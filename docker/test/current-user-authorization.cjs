// Run only against the disposable T3 database, after prisma migrate deploy.
// Exercises real Pages API parsing, iron-session cookies, bcrypt and Prisma;
// the Node HTTP adapter avoids a separate Next build and does not run the proxy.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const app = path.resolve(process.env.HMV_SOURCE_ROOT ?? '.', 'home-media-viewer');
const appRequire = createRequire(path.join(app, 'package.json'));
process.env.TS_NODE_PROJECT = path.join(app, 'tsconfig.json');
const database = new URL(process.env.DATABASE_URL ?? '');
assert.equal(database.hostname, '127.0.0.1', 'Use the isolated database network namespace');
assert.equal(database.pathname, '/hmv_auth_t3_fixture', 'Refusing a non-task database');
process.env.APP_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.SESSION_COOKIE_SECURE = 'false';
appRequire('ts-node').register({ project: path.join(app, 'tsconfig.json'), transpileOnly: true });
appRequire('tsconfig-paths').register({ baseUrl: app, paths: { '@/*': ['src/*'] } });

let prisma;
let server;
let temporary;
let checks = 0;
const check = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  checks++;
};

(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'hmv-auth-t3-'));
  process.env.APP_ALBUM_ROOT_PATH = path.join(temporary, 'media');
  process.env.APP_STORAGE_PATH = path.join(temporary, 'storage');
  const { mkdir } = require('node:fs/promises');
  await mkdir(process.env.APP_ALBUM_ROOT_PATH);
  prisma = appRequire('./src/utils/prisma/prismaImporter.ts').default;
  assert.equal(await prisma.user.count(), 0, 'Fixtures require a fresh task database');
  const { getHashedPassword } = appRequire('./src/utils/passwordHelper.ts');
  const password = 'Synthetic-T3-P4ssword!';
  const hash = await getHashedPassword(password);
  const administrator = await prisma.user.create({ data: {
    name: 'T3 administrator', email: 't3-admin@example.invalid', password: hash, isAdmin: true,
  } });
  const reader = await prisma.user.create({ data: {
    name: 'T3 reader', email: 't3-reader@example.invalid', password: hash,
  } });
  const album = await prisma.album.create({ data: {
    name: 'T3 shared album', sourceType: 'File', connectionString: '', basePath: process.env.APP_ALBUM_ROOT_PATH,
    users: { connect: [{ id: reader.id }, { id: administrator.id }] },
  } });
  const file = await prisma.file.create({ data: {
    name: 'synthetic', extension: 'jpg', path: 'synthetic.jpg', albums: { connect: { id: album.id } },
  } });
  const privateAlbum = await prisma.album.create({ data: {
    name: 'T3 administrator-only album', sourceType: 'File', connectionString: '', basePath: '/synthetic-private',
  } });
  const privateFile = await prisma.file.create({ data: {
    name: 'private', extension: 'jpg', path: 'private.jpg', albums: { connect: { id: privateAlbum.id } },
  } });
  const original = 'T3 synthetic original bytes';
  await writeFile(path.join(process.env.APP_ALBUM_ROOT_PATH, file.path), original);
  await writeFile(path.join(process.env.APP_ALBUM_ROOT_PATH, privateFile.path), original);
  const { getFileIdThumbnailPath } = appRequire('./src/utils/thumbnailHelper.ts');
  await writeFile(getFileIdThumbnailPath(file.id, 200), 'T3 synthetic thumbnail bytes');

  // Every browser-protected API route in the reviewed application is represented.
  const protectedRoutes = [
    ['album/index', '/api/album', 'POST'],
    ['album/[id]', `/api/album/${album.id}`, 'PATCH', { id: album.id }],
    ['album/search', '/api/album/search', 'POST'],
    ['album/metadata/index', '/api/album/metadata', 'POST'],
    ['album/sync/index', '/api/album/sync', 'POST'],
    ['browse/index', '/api/browse', 'GET'],
    ['browse/[...path]', '/api/browse/synthetic', 'GET', { path: ['synthetic'] }],
    ['file/[id]/index', `/api/file/${file.id}`, 'PATCH', { id: file.id }],
    ['file/[id]/metadata', `/api/file/${file.id}/metadata`, 'PATCH', { id: file.id }],
    ['file/content/[id]', `/api/file/content/${file.id}`, 'GET', { id: file.id }],
    ['file/thumbnail/[...params]', `/api/file/thumbnail/${file.id}/200`, 'GET', { params: [file.id, '200'] }],
    ['file/metadata/index', '/api/file/metadata', 'POST'],
    ['file/search', '/api/file/search', 'POST'],
    ['user/index', '/api/user', 'POST'],
    ['user/[id]', `/api/user/${reader.id}`, 'PATCH', { id: reader.id }],
    ['user/search', '/api/user/search', 'POST'],
    ['user/album/index', '/api/user/album', 'PUT'],
    ['process/run', '/api/process/run', 'POST'],
    ['me', '/api/me', 'GET'],
    ['hello', '/api/hello', 'GET'],
  ];
  const routes = new Map(protectedRoutes.map(([source, url, , query]) => [url, {
    module: appRequire(`./src/pages/api/${source}.ts`), query: query ?? {},
  }]));
  routes.set('/api/login', { module: appRequire('./src/pages/api/login.ts'), query: {} });
  for (const [source, url] of [
    ['album/[id]', `/api/album/${privateAlbum.id}`],
    ['file/[id]/index', `/api/file/${privateFile.id}`],
    ['file/content/[id]', `/api/file/content/${privateFile.id}`],
  ]) routes.set(url, { module: appRequire(`./src/pages/api/${source}.ts`), query: { id: source.startsWith('album/') ? privateAlbum.id : privateFile.id } });
  const { apiResolver } = appRequire('next/dist/server/api-utils/node/api-resolver');
  server = createServer((req, res) => {
    const route = routes.get(new URL(req.url, 'http://localhost').pathname);
    if (!route) { res.writeHead(404).end(); return; }
    apiResolver(req, res, route.query, route.module, {}, true, false).catch(() => {
      res.statusCode = 500;
      res.end('Test adapter failure');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, cookie, method = 'GET', body) => fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const login = async email => {
    const response = await call('/api/login', undefined, 'POST', { email, password });
    check(response.status, 200, 'Active fixture login');
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert(cookie, 'Login must issue an actual sealed cookie');
    await response.text();
    return cookie;
  };
  const adminCookie = await login(administrator.email);
  const readerCookie = await login(reader.email);
  check((await call('/api/me', readerCookie)).status, 200, 'Active reader identity');
  check(await (await call(`/api/file/content/${file.id}`, readerCookie)).text(), original, 'Reader original');
  check((await call(`/api/file/${file.id}`, readerCookie)).status, 200, 'Reader metadata');
  check((await call(`/api/file/thumbnail/${file.id}/200`, readerCookie)).status, 200, 'Reader thumbnail');
  check((await call('/api/process/run', adminCookie)).status, 405, 'Administrator reaches process method gate');
  check((await call('/api/process/run', readerCookie, 'POST', {})).status, 403, 'Reader cannot process');
  check((await call(`/api/file/content/${privateFile.id}`, adminCookie)).status, 200, 'Active administrator can read unrelated media');
  check((await call(`/api/file/content/${privateFile.id}`, readerCookie)).status, 400, 'Reader cannot read unrelated media');

  await prisma.user.update({ where: { id: administrator.id }, data: { isAdmin: false } });
  const countsBefore = await prisma.user.count();
  check((await call('/api/user', adminCookie, 'POST', { name: 'unwanted', email: 'unwanted@example.invalid', password })).status, 403, 'Old admin cookie cannot create users');
  check(await prisma.user.count(), countsBefore, 'Denied user creation has no write');
  check((await call(`/api/album/${album.id}`, adminCookie, 'PATCH', { name: 'unwanted' })).status, 404, 'Old admin cookie cannot mutate albums');
  check((await prisma.album.findUniqueOrThrow({ where: { id: album.id } })).name, album.name, 'Denied album mutation has no write');
  check((await call('/api/process/run', adminCookie, 'POST', {})).status, 403, 'Demoted administrator cannot process');
  check((await call(`/api/file/${file.id}`, adminCookie, 'PATCH', { status: 'Deleted' })).status, 403, 'Demoted administrator cannot change file status');
  check((await prisma.file.findUniqueOrThrow({ where: { id: file.id } })).status, 'Active', 'Denied file mutation has no write');
  check((await (await call('/api/me', adminCookie)).json()).data.isAdmin, false, 'Identity reflects demotion');
  check((await call(`/api/file/content/${privateFile.id}`, adminCookie)).status, 400, 'Demoted administrator loses unrelated original access');
  check((await call(`/api/file/${privateFile.id}`, adminCookie)).status, 404, 'Demoted administrator loses unrelated file details');
  check((await call(`/api/album/${privateAlbum.id}`, adminCookie)).status, 404, 'Demoted administrator loses unrelated album details');
  const fileSearch = await (await call('/api/file/search', adminCookie, 'POST', {})).json();
  check(fileSearch.data.some(item => item.id === privateFile.id), false, 'File search ignores stale administrator authority');
  check(fileSearch.data.some(item => item.id === file.id), true, 'File search retains permitted member results');
  const albumSearch = await (await call('/api/album/search', adminCookie, 'POST', {})).json();
  check(albumSearch.data.some(item => item.id === privateAlbum.id), false, 'Album search ignores stale administrator authority');
  check(albumSearch.data.some(item => item.id === album.id), true, 'Album search retains permitted member results');

  await prisma.user.update({ where: { id: reader.id }, data: { isAdmin: true } });
  check((await call('/api/process/run', readerCookie)).status, 405, 'Old reader cookie uses current promotion');
  check((await call(`/api/album/${album.id}`, readerCookie, 'PATCH', { name: 'T3 administrator update' })).status, 200, 'Promoted administrator can mutate album');
  check((await prisma.album.findUniqueOrThrow({ where: { id: album.id } })).name, 'T3 administrator update', 'Authorized mutation persists');
  check((await call(`/api/file/content/${privateFile.id}`, readerCookie)).status, 200, 'Promotion grants current administrator media access');

  const before = {
    users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
    album: await prisma.album.findUniqueOrThrow({ where: { id: album.id } }),
    file: await prisma.file.findUniqueOrThrow({ where: { id: file.id } }),
  };
  for (const status of ['Disabled', 'Deleted', 'missing']) {
    if (status === 'missing') await prisma.user.delete({ where: { id: reader.id } });
    else await prisma.user.update({ where: { id: reader.id }, data: { status } });
    for (const [, url, method] of protectedRoutes) {
      const result = await call(url, readerCookie, method, method === 'GET' ? undefined : {});
      check(result.status, 403, `${status} principal denied on ${url}`);
      check(/Max-Age=0/i.test(result.headers.get('set-cookie') ?? ''), true, 'Denied account clears browser cookie');
      await result.text();
    }
    const result = await call('/api/login', readerCookie, 'POST', { email: reader.email, password });
    check(result.status, 400, `${status} account cannot log in`);
    check(await result.text(), 'Error in login: Invalid email or password', 'Generic login denial');
    check(/Max-Age=0/i.test(result.headers.get('set-cookie') ?? ''), true, 'Failed login clears browser cookie');
    assert.deepEqual(await prisma.album.findUniqueOrThrow({ where: { id: album.id } }), before.album);
    assert.deepEqual(await prisma.file.findUniqueOrThrow({ where: { id: file.id } }), before.file);
    check(await prisma.user.count(), status === 'missing' ? 1 : 2, 'Denied requests create no users');
  }
  for (const cookie of [undefined, 'home-media-viewer-user-cookie=invalid', readerCookie.slice(0, -8) + 'tampered']) {
    check((await call('/api/hello', cookie)).status, 403, 'Missing/invalid/tampered cookies denied without proxy');
  }
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: administrator.id } }), before.users.find(u => u.id === administrator.id));
  console.log(JSON.stringify({ checks, protectedRoutes: protectedRoutes.length, result: 'passed', adapter: 'real Next Pages API resolver; no proxy or browser' }));
})().catch(() => {
  console.error('T3 integration failed; completed checks:', checks);
  process.exitCode = 1;
}).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (prisma) await prisma.$disconnect();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
