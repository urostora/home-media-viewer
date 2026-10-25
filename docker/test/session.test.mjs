import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';

const app = resolve(process.env.HMV_SOURCE_ROOT ?? '.', 'home-media-viewer');
const require = createRequire(resolve(app, 'package.json'));
const ts = require('typescript');
const { getIronSession, nextProxyCookies, sealData } = require('iron-session');
const { NextRequest, NextResponse } = require('next/server');
const cache = new Map();
function load(file) {
  const path = resolve(app, 'src', file);
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  cache.set(path, exports);
  const localRequire = (name) => {
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(resolve(dirname(path), name) + '.ts');
    return require(name);
  };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: localRequire, process, console, Date });
  return exports;
}
const secret = randomBytes(32).toString('hex');
process.env.APP_SESSION_SECRET = secret;
process.env.SESSION_COOKIE_SECURE = 'false';
const { proxy, config } = load('proxy.ts');
const { getIronSessionOptions } = load('utils/sessionHelper.ts');
const options = getIronSessionOptions();
const request = cookie => new NextRequest('http://app:3000/api/me', {
  headers: cookie ? { cookie: options.cookieName + '=' + cookie } : {},
});

test('proxy preserves the protected API matcher and rejects absent, malformed, tampered and expired sessions', async () => {
  assert.equal(config.matcher[0], '/(api/(?!log|process|health/(?:live|ready)$).*)');
  for (const cookie of [undefined, 'invalid']) assert.equal((await proxy(request(cookie))).status, 403);
  const sealed = await sealData({ user: { id: 'probe', admin: true } }, options);
  assert.equal((await proxy(request(sealed))).status, 200);
  assert.equal((await proxy(request(sealed.slice(0, -8) + 'tampered'))).status, 403);
  const originalNow = Date.now;
  let expired;
  try {
    Date.now = () => originalNow() - 3600_000;
    expired = await sealData({ user: { id: 'probe' } }, { ...options, ttl: 1 });
  } finally { Date.now = originalNow; }
  assert.equal((await proxy(request(expired))).status, 403);
});

test('session cookies retain flags and work through the real Node API route wrapper', async () => {
  const { withSessionRoute } = load('utils/sessionRoute.ts');
  const headers = new Map();
  const response = { getHeader: name => headers.get(name), setHeader: (name, value) => headers.set(name, value) };
  const req = { headers: {} };
  await withSessionRoute(async req => { req.session.user = { id: 'probe', admin: true }; await req.session.save(); })(req, response);
  const setCookie = String(headers.get('set-cookie'));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Max-Age=1209600/);
  const cookie = setCookie.split(';')[0].split('=').slice(1).join('=');
  assert.equal((await proxy(request(cookie))).status, 200);
  const res = NextResponse.next();
  const session = await getIronSession(nextProxyCookies(request(cookie), res), options);
  session.destroy();
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/i);
  process.env.SESSION_COOKIE_SECURE = 'true';
  assert.equal(getIronSessionOptions().cookieOptions.secure, true);
  await withSessionRoute(async req => { req.session.user = { id: 'secure-probe' }; await req.session.save(); })({ headers: {} }, response);
  assert.match(String(headers.get('set-cookie')), /; Secure/i);
  process.env.SESSION_COOKIE_SECURE = 'false';
});
