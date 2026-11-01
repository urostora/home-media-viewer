// Fresh disposable T6 database only. Uses actual Pages API HTTP handlers,
// encrypted cookies, bcrypt and MariaDB transactions; no proxy/browser here.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const app = path.resolve(process.env.HMV_APP_ROOT ?? 'home-media-viewer');
const reqApp = createRequire(path.join(app, 'package.json'));
const dbURL = new URL(process.env.DATABASE_URL ?? '');
assert.equal(dbURL.hostname, '127.0.0.1');
assert.equal(dbURL.pathname, '/hmv_auth_t6_fixture');
process.env.APP_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.SESSION_COOKIE_SECURE = 'false';
reqApp('ts-node').register({ project: path.join(app, 'tsconfig.json'), transpileOnly: true });
reqApp('tsconfig-paths').register({ baseUrl: app, paths: { '@/*': ['src/*'] } });
let prisma,
  server,
  checks = 0,
  stage = 'setup';
const check = (value, expected, message) => {
  assert.equal(value, expected, message);
  checks++;
};
const gate = () => {
  let open;
  const promise = new Promise((resolve) => {
    open = resolve;
  });
  return { promise, open };
};
(async () => {
  prisma = reqApp('./src/utils/prisma/prismaImporter.ts').default;
  check(await prisma.user.count(), 0, 'fresh fixture DB');
  const password = 'Synthetic-T6-P4ssword!';
  const nextPassword = 'Synthetic-T6-New-P4ssword!';
  const bcrypt = reqApp('bcrypt');
  const admin = await prisma.user.create({
    data: {
      email: 't6-admin@example.invalid',
      name: 'T6 administrator',
      password: await bcrypt.hash(password, 10),
      isAdmin: true,
    },
  });
  const reader = await prisma.user.create({
    data: { email: 't6-reader@example.invalid', name: 'T6 reader', password: await bcrypt.hash(password, 10) },
  });
  const routes = new Map();
  for (const name of ['login', 'logout', 'me', 'hello', 'session/revoke-all']) {
    routes.set('/api/' + name, { handler: reqApp('./src/pages/api/' + name + '.ts').default, query: {} });
  }
  routes.set('/api/user/' + reader.id, {
    handler: reqApp('./src/pages/api/user/[id].ts').default,
    query: { id: reader.id },
  });
  const { apiResolver } = reqApp('next/dist/server/api-utils/node/api-resolver');
  server = createServer(async (req, res) => {
    const route = routes.get(req.url);
    if (!route) {
      res.statusCode = 404;
      res.end();
      return;
    }
    await apiResolver(
      req,
      res,
      route.query,
      { default: route.handler },
      { previewModeId: '', previewModeSigningKey: '', previewModeEncryptionKey: '' },
      false,
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (url, cookie, method = 'GET', data) =>
    fetch(base + url, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
  const login = async (who = reader, pass = password, oldCookie) => {
    const response = await call('/api/login', oldCookie, 'POST', { email: who.email, password: pass });
    check(response.status, 200, 'fixture login');
    const body = await response.json();
    check(body.ok, true, 'successful login body');
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert(cookie);
    checks++;
    return { cookie, data: body.data };
  };
  const { unsealData, sealData } = reqApp('iron-session');
  const { getIronSessionOptions } = reqApp('./src/utils/sessionHelper.ts');
  const { issueSession, resolveServerSession, lockSessionUser, revokeUserSessions, revokeSession, cleanupSessions } =
    reqApp('./src/utils/auth/serverSession.ts');
  const { updateUser, deleteUser } = reqApp('./src/utils/userHelper.ts');
  const options = getIronSessionOptions();
  const unpack = (cookie) => unsealData(cookie.split('=').slice(1).join('='), options);
  const sessionRow = async (cookie) => {
    const decoded = await unpack(cookie);
    const hash = require('node:crypto').createHash('sha256').update(decoded.token).digest('hex');
    return prisma.authSession.findUniqueOrThrow({ where: { tokenHash: hash } });
  };
  const adminCookie = (await login(admin)).cookie;
  let first = await login();
  let second = await login();
  stage = 'single logout';
  const initial = await sessionRow(first.cookie);
  check(initial.expiresAt - initial.issuedAt, 14 * 86400000, 'absolute lifetime');
  check(initial.idleExpiresAt - initial.issuedAt, 86400000, 'idle lifetime');
  check(first.data.sessionExpiresOn, initial.idleExpiresAt.getTime(), 'login reports persisted effective expiry');
  const decoded = await unpack(first.cookie);
  check(decoded.version, 1, 'versioned seal');
  check(decoded.user, undefined, 'no legacy role identity in seal');
  check(decoded.token.length, 64, 'opaque token entropy');
  check((await call('/api/logout', first.cookie)).status, 405, 'GET cannot revoke');
  check((await call('/api/me', first.cookie)).status, 200, 'GET retains authority');
  const logout = await call('/api/logout', first.cookie, 'POST');
  check(logout.status, 200, 'server confirms revocation');
  check(/Max-Age=0/.test(logout.headers.get('set-cookie')), true, 'browser deletion');
  check((await call('/api/me', first.cookie)).status, 403, 'saved cookie replay denied');
  check((await call('/api/me', second.cookie)).status, 200, 'other session survives single logout');
  check((await call('/api/logout', first.cookie, 'POST')).status, 200, 'logout idempotent');
  stage = 'explicit revoke all';
  check((await call('/api/session/revoke-all', second.cookie)).status, 405, 'explicit revoke POST only');
  first = await login();
  check(
    (await call('/api/session/revoke-all', second.cookie, 'POST', { userId: admin.id })).status,
    200,
    'revoke own sessions',
  );
  for (const cookie of [first.cookie, second.cookie])
    check((await call('/api/me', cookie)).status, 403, 'all prior own cookies denied');
  check((await call('/api/me', adminCookie)).status, 200, 'body cannot target another user');
  stage = 'replacement login';
  first = await login();
  second = await login(reader, password, first.cookie);
  check((await call('/api/me', first.cookie)).status, 403, 'new login revokes previous browser token');
  check((await call('/api/me', second.cookie)).status, 200, 'replacement token remains valid');
  stage = 'account changes';
  const patch = async (data) => {
    const response = await call('/api/user/' + reader.id, adminCookie, 'PATCH', data);
    check(response.status, 200, 'account mutation');
    const body = await response.json();
    check('sessionVersion' in body.data, false, 'internal version not exposed');
  };
  first = await login();
  second = await login();
  await patch({ password: nextPassword });
  for (const cookie of [first.cookie, second.cookie])
    check((await call('/api/me', cookie)).status, 403, 'password reset invalidates all saved seals');
  check(
    (await call('/api/login', undefined, 'POST', { email: reader.email, password })).status,
    400,
    'old password rejected',
  );
  await patch({ password });
  let retained;
  for (const change of [
    { isAdmin: true },
    { isAdmin: false },
    { status: 'Disabled' },
    { status: 'Active' },
    { status: 'Deleted' },
    { status: 'Active' },
  ]) {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: reader.id } });
    if (before.status === 'Active') retained = (await login()).cookie;
    await patch(change);
    if (retained) {
      check((await call('/api/me', retained)).status, 403, 'role/status change revokes retained cookie');
      check((await call('/api/me', retained)).status, 403, 'restoration cannot resurrect retained seal');
    }
  }
  first = await login();
  await patch({ name: 'T6 renamed' });
  check((await call('/api/me', first.cookie)).status, 200, 'ordinary edit preserves session');
  stage = 'expiry';
  const row = await sessionRow(first.cookie);
  const absolute = new Date(Date.now() + 60000);
  await prisma.authSession.update({ where: { id: row.id }, data: { expiresAt: absolute } });
  const me = await (await call('/api/me', first.cookie)).json();
  check(me.data.sessionExpiresOn, absolute.getTime(), 'me never extends absolute expiry');
  check(
    me.data.sessionExpiresInSeconds <= 60 && me.data.sessionExpiresInSeconds >= 0,
    true,
    'me reports remaining lifetime',
  );
  check((await sessionRow(first.cookie)).idleExpiresAt.getTime(), absolute.getTime(), 'idle capped at absolute');
  await prisma.authSession.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1) } });
  check((await call('/api/me', first.cookie)).status, 403, 'absolute expiry denied');
  first = await login();
  await prisma.authSession.update({
    where: { id: (await sessionRow(first.cookie)).id },
    data: { idleExpiresAt: new Date(Date.now() - 1) },
  });
  check((await call('/api/me', first.cookie)).status, 403, 'idle expiry denied');
  const legacy = options.cookieName + '=' + (await sealData({ user: { id: reader.id, admin: true } }, options));
  check((await call('/api/hello', legacy)).status, 403, 'legacy cookie denied independently of proxy');
  check((await call('/api/me', undefined)).status, 403, 'absent seal denied');
  check((await call('/api/me', second.cookie.slice(0, -8) + 'tampered')).status, 403, 'tamper denied');
  stage = 'transaction races';
  let onLock,
    onTouch,
    failRevocation = false;
  let failRead = false;
  prisma.$use(async (params, next) => {
    if (failRead && params.model === 'AuthSession' && params.action === 'findUnique') {
      failRead = false;
      throw new Error('Synthetic session database failure');
    }
    if (params.action === 'queryRaw' && onLock) onLock();
    if (params.model === 'AuthSession' && params.action === 'updateMany') {
      if (failRevocation && params.args.data.revokedAt) {
        failRevocation = false;
        throw new Error('Synthetic rollback');
      }
      if (onTouch && params.args.data.lastSeenAt) await onTouch();
    }
    return next(params);
  });
  // Start a verified login while a password-reset transaction already holds the
  // account lock. The stale verification must fail after that reset commits.
  const verified = await prisma.user.findUniqueOrThrow({ where: { id: reader.id } });
  const locked = gate(),
    release = gate();
  const reset = prisma.$transaction(
    async (tx) => {
      await lockSessionUser(tx, reader.id);
      await tx.user.update({
        where: { id: reader.id },
        data: { password: await bcrypt.hash(nextPassword, 10), sessionVersion: { increment: 1 } },
      });
      await revokeUserSessions(tx, reader.id);
      locked.open();
      await release.promise;
    },
    { timeout: 10000 },
  );
  await locked.promise;
  const attempted = gate();
  onLock = () => attempted.open();
  const pendingLogin = issueSession(verified);
  await attempted.promise;
  onLock = null;
  release.open();
  await reset;
  check(await pendingLogin, null, 'stale bcrypt verification cannot race reset');
  await updateUser(reader.id, { password });
  first = await login();
  const sessionCookie = await unpack(first.cookie);
  const revokeLocked = gate(),
    releaseRevoke = gate();
  const revoke = prisma.$transaction(
    async (tx) => {
      await lockSessionUser(tx, reader.id);
      await revokeUserSessions(tx, reader.id);
      revokeLocked.open();
      await releaseRevoke.promise;
    },
    { timeout: 10000 },
  );
  await revokeLocked.promise;
  const readAttempted = gate();
  onLock = () => readAttempted.open();
  const pendingRead = resolveServerSession(sessionCookie);
  await readAttempted.promise;
  onLock = null;
  releaseRevoke.open();
  await revoke;
  check(await pendingRead, null, 'new authorization after revoke commit denied');
  first = await login();
  const touchStarted = gate(),
    releaseTouch = gate();
  onTouch = async () => {
    touchStarted.open();
    await releaseTouch.promise;
  };
  const touching = resolveServerSession(await unpack(first.cookie));
  await touchStarted.promise;
  const logoutAttempted = gate();
  onLock = () => logoutAttempted.open();
  const pendingLogout = revokeSession(await unpack(first.cookie));
  await logoutAttempted.promise;
  onLock = null;
  onTouch = null;
  releaseTouch.open();
  check((await touching) !== null, true, 'already authorized touch may finish before logout');
  await pendingLogout;
  check(await resolveServerSession(await unpack(first.cookie)), null, 'touch cannot resurrect logged-out session');
  stage = 'rollback';
  first = await login();
  for (const change of [{ password: nextPassword }, { isAdmin: true }, { status: 'Disabled' }]) {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: reader.id } });
    const saved = await sessionRow(first.cookie);
    failRevocation = true;
    await assert.rejects(updateUser(reader.id, change));
    checks++;
    assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: reader.id } }), before);
    checks++;
    assert.deepEqual(await sessionRow(first.cookie), saved);
    checks++;
    check((await call('/api/me', first.cookie)).status, 200, 'rollback preserves original authority');
  }
  failRevocation = true;
  await assert.rejects(deleteUser(reader.id));
  checks++;
  check((await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).status, 'Active', 'delete rollback atomic');
  stage = 'bounded cleanup';
  const expired = new Date(Date.now() - 1000);
  await prisma.authSession.createMany({
    data: Array.from({ length: 125 }, () => ({
      tokenHash: randomBytes(32).toString('hex'),
      userId: reader.id,
      userVersion: 0,
      issuedAt: expired,
      lastSeenAt: expired,
      expiresAt: expired,
      idleExpiresAt: expired,
    })),
  });
  const beforeCleanup = await prisma.authSession.count();
  await cleanupSessions();
  check(beforeCleanup - (await prisma.authSession.count()), 100, 'cleanup deletes at most one fixed batch');
  check((await call('/api/me', first.cookie)).status, 200, 'cleanup preserves live sessions');
  stage = 'database failure';
  failRead = true;
  let unavailable = await call('/api/me', first.cookie);
  check(unavailable.status, 503, 'lookup failure fails closed');
  check(unavailable.headers.has('set-cookie'), false, 'lookup failure preserves cookie');
  failRead = true;
  unavailable = await call('/api/logout', first.cookie, 'POST');
  check(unavailable.status, 503, 'logout failure does not falsely confirm');
  check(unavailable.headers.has('set-cookie'), false, 'logout failure preserves cookie');
  check((await call('/api/me', first.cookie)).status, 200, 'retry after failure retains valid session');
  const versionBefore = (await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).sessionVersion;
  failRevocation = true;
  unavailable = await call('/api/session/revoke-all', first.cookie, 'POST');
  check(unavailable.status, 503, 'failed revoke-all does not confirm');
  check(unavailable.headers.has('set-cookie'), false, 'failed revoke-all preserves cookie');
  check(
    (await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).sessionVersion,
    versionBefore,
    'revoke-all rollback preserves generation',
  );
  check((await call('/api/me', first.cookie)).status, 200, 'revoke-all rollback preserves authority');
  stage = 'physical delete';
  await prisma.user.delete({ where: { id: reader.id } });
  check(await prisma.authSession.count({ where: { userId: reader.id } }), 0, 'physical deletion cascades');
  check((await call('/api/me', first.cookie)).status, 403, 'deleted-user saved seal denied');
  check(await prisma.user.count(), 1, 'task fixtures only');
  console.log(
    `T6 session lifecycle: ${checks} checks passed (HTTP, replay, expiry, account changes, deterministic races, rollback, cleanup).`,
  );
})()
  .catch((error) => {
    console.error(
      `T6 integration failed at ${stage} after ${checks} checks (${error?.name}: ${error?.code ?? 'no-code'}).`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (prisma) await prisma.$disconnect();
  });
