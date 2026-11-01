// Run in the task browser image/network namespace after migrations on a fresh
// hmv_auth_t5_fixture database. No real accounts, env files or media are used.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const { cp, mkdtemp, mkdir, symlink, rm, readFile } = require('node:fs/promises');
const { execFileSync, spawn } = require('node:child_process');
const http = require('node:http');
const { createServer } = require('node:https');
const path = require('node:path');
const os = require('node:os');
const source = path.resolve(process.env.HMV_SOURCE_ROOT ?? '.', 'home-media-viewer');
const appRequire = createRequire(path.join(source, 'package.json'));
const database = new URL(process.env.DATABASE_URL ?? '');
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.pathname, '/hmv_auth_t5_fixture', 'Refusing non-task database');
process.env.APP_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.SESSION_COOKIE_SECURE = 'true';
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.IS_BACKGROUND_PROCESS_ENABLED = 'false';
let temporary, prisma, app, server, browser;
let checks = 0;
let stage = 'setup';
let activePage;
const check = (value, expected, label) => {
  assert.equal(value, expected, label);
  checks++;
};
(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'hmv-auth-t5-'));
  const directory = path.join(temporary, 'app');
  await mkdir(directory);
  // Deliberately exclude .env, shared build artifacts and media.
  for (const item of ['src', 'public', 'package.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.js']) {
    await cp(path.join(source, item), path.join(directory, item), { recursive: true });
  }
  await symlink(path.join(source, 'node_modules'), path.join(directory, 'node_modules'));
  process.env.APP_STORAGE_PATH = path.join(temporary, 'storage');
  process.env.APP_ALBUM_ROOT_PATH = path.join(temporary, 'media');
  await mkdir(process.env.APP_ALBUM_ROOT_PATH);
  prisma = new (appRequire('@prisma/client').PrismaClient)();
  check(await prisma.user.count(), 0, 'fresh task database');
  const password = randomBytes(24).toString('hex');
  const account = await prisma.user.create({
    data: {
      email: 't5-reader@example.invalid',
      name: 'T5 current reader',
      password: await appRequire('bcrypt').hash(password, 10),
      isAdmin: false,
    },
  });
  // Explicit fixture administrator bootstrap; no shared seed/account is touched.
  await prisma.user.create({
    data: {
      email: 't5-admin@example.invalid',
      name: 'T5 administrator',
      password: await appRequire('bcrypt').hash(randomBytes(24).toString('hex'), 10),
      isAdmin: true,
    },
  });
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-keyout',
      path.join(temporary, 'key.pem'),
      '-out',
      path.join(temporary, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  );
  app = spawn(
    process.execPath,
    [
      appRequire.resolve('next/dist/bin/next'),
      'dev',
      '--webpack',
      directory,
      '--hostname',
      '127.0.0.1',
      '--port',
      '3000',
    ],
    {
      cwd: directory,
      env: process.env,
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:3000')).status === 200) break;
    } catch {}
    assert(attempt < 59 && app.exitCode === null, 'Task application readiness failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  server = createServer(
    { key: await readFile(path.join(temporary, 'key.pem')), cert: await readFile(path.join(temporary, 'cert.pem')) },
    (request, response) => {
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: 3000,
          path: request.url,
          method: request.method,
          headers: { ...request.headers, 'x-forwarded-proto': 'https' },
        },
        (result) => {
          response.writeHead(result.statusCode, result.headers);
          result.pipe(response);
        },
      );
      upstream.on('error', () => {
        response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    },
  );
  await new Promise((resolve) => server.listen(3443, '127.0.0.1', resolve));
  browser = await appRequire('puppeteer').launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium',
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const page = await browser.newPage();
  activePage = page;
  page.setDefaultTimeout(60000);
  const origin = 'https://localhost:3443';
  const loginForm = async (tab) => {
    await tab.bringToFront();
    await tab.waitForSelector('input[name="email"]');
  };
  const loggedIn = async (tab) => {
    await tab.waitForFunction(() =>
      [...document.querySelectorAll('button')].some((button) => button.textContent === 'Logout'),
    );
  };
  const clickButton = async (tab, text) => {
    await tab.evaluate((text) => {
      const button = [...document.querySelectorAll('button')].find((button) => button.textContent === text);
      if (!button) throw new Error('Expected button missing');
      button.click();
    }, text);
  };
  const login = async () => {
    await loginForm(page);
    await page.type('input[name="email"]', account.email);
    await page.type('input[name="password"]', password);
    await page.click('input[type="submit"]');
    await loggedIn(page);
  };
  const status = async (tab, url, method = 'GET') =>
    tab.evaluate(async ({ url, method }) => (await fetch(url, { method, cache: 'no-store' })).status, { url, method });
  await page.goto(origin);
  await loginForm(page);
  await page.evaluate(() => {
    document.cookie = 'hmv-name=Forged administrator; Path=/';
    document.cookie = 'hmv-email=forged@example.invalid; Path=/';
    document.cookie = 'hmv-isadmin=1; Path=/';
  });
  await page.reload();
  await loginForm(page);
  check(await status(page, '/api/me'), 403, 'editable hints do not grant authority');
  await login();
  const cookie = (await page.cookies()).find((cookie) => cookie.name === 'home-media-viewer-user-cookie');
  check(cookie?.httpOnly, true, 'HttpOnly retained');
  check(cookie?.secure, true, 'Secure retained over HTTPS');
  check(cookie?.sameSite, 'Lax', 'SameSite retained');
  check(
    (await page.evaluate(() => document.cookie)).includes('home-media-viewer-user-cookie'),
    false,
    'cookie hidden from JS',
  );
  check((await page.evaluate(() => document.cookie)).includes('hmv-'), false, 'legacy hints removed');
  await page.reload();
  await loggedIn(page);
  check(
    await page.evaluate(() => document.body.textContent.includes('T5 current reader')),
    true,
    'reload restores real identity',
  );
  check(await status(page, '/api/me'), 200, 'reload preserves API authority');
  check(await status(page, '/api/logout'), 405, 'GET logout rejected');
  check(await status(page, '/api/me'), 200, 'GET logout preserves session');
  const tab = await browser.newPage();
  tab.setDefaultTimeout(60000);
  await tab.goto(origin);
  await loggedIn(tab);
  // Both HTTP failure and a real aborted network request must retain retry UI.
  let failure = 'http';
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/logout' && failure !== null) {
      if (failure === 'network') void request.abort('failed');
      else void request.respond({ status: 503, contentType: 'application/json', body: '{"ok":false}' });
    } else void request.continue();
  });
  for (const mode of ['http', 'network']) {
    failure = mode;
    await clickButton(page, 'Logout');
    await page.waitForFunction(() =>
      document.querySelector('[role="alert"]')?.textContent.includes('Logout could not be confirmed'),
    );
    await loggedIn(page);
    check(await status(page, '/api/me'), 200, `${mode} failure preserves authority honestly`);
    check(
      await page.evaluate(() => document.querySelector('input[name="email"]') === null),
      true,
      `${mode} failure does not claim logout`,
    );
  }
  failure = null;
  await clickButton(page, 'Retry');
  await loginForm(page);
  await loginForm(tab);
  check(await status(page, '/api/me'), 403, 'actual button removes same-browser authority');
  check(await status(tab, '/api/me'), 403, 'second tab loses authority');
  check(
    (await page.cookies()).some((cookie) => cookie.name === 'home-media-viewer-user-cookie'),
    false,
    'session cookie removed',
  );
  stage = 'reload-after-logout';
  await page.bringToFront();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await loginForm(page);
  check(await status(page, '/api/me'), 403, 'reload stays logged out');
  stage = 'login-again';
  await login();
  await loggedIn(tab);
  stage = 'resource-denial';
  // A resource-only 403 must recheck identity without signing out a valid user.
  let denyAlbums = true;
  // Use a second page's interception to avoid replacing the logout failure hook.
  await tab.setRequestInterception(true);
  tab.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/album/search' && denyAlbums) {
      void request.respond({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"Forbidden"}' });
    } else void request.continue();
  });
  const identityRecheck = tab.waitForResponse((response) => new URL(response.url()).pathname === '/api/me');
  await tab.evaluate(() => document.querySelector('a[href="/album"]').click());
  await identityRecheck;
  await loggedIn(tab);
  check(await status(tab, '/api/me'), 200, 'resource denial retains valid identity');
  denyAlbums = false;
  // Remove current authority while the rendered tab is still logged in, then
  // navigate through the UI to trigger apiFetch's denial/identity recheck path.
  await prisma.user.update({ where: { id: account.id }, data: { status: 'Disabled' } });
  await tab.evaluate(() => document.querySelector('a[href="/search"]').click());
  await loginForm(tab);
  check(await status(tab, '/api/me'), 403, 'denied UI fetch clears inactive identity');
  check(await prisma.user.count(), 2, 'fixtures remain isolated');
  console.log(
    `T5 HTTPS browser lifecycle: ${checks} checks passed (real UI, Next proxy/API, cookies, reload, two tabs, failures, denied fetch).`,
  );
})()
  .catch(async (error) => {
    // Never dump browser cookies, request bodies, credentials or raw exceptions.
    console.error(`T5 browser lifecycle failed at ${stage} after ${checks} checks (${error?.name}).`);
    if (activePage && !activePage.isClosed()) {
      console.error(
        await activePage
          .evaluate(() => ({
            title: document.title,
            initiating: document.body.textContent.includes('Initiating'),
            retry: document.querySelector('[role="alert"]')?.textContent,
            loginForm: document.querySelector('input[name="email"]') !== null,
          }))
          .catch(() => 'Page unavailable'),
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (app && app.exitCode === null) {
      // Stop Next's compiler/watchers before removing its writable temporary copy.
      await new Promise((resolve) => {
        const deadline = setTimeout(() => app.kill('SIGKILL'), 5000);
        app.once('exit', () => {
          clearTimeout(deadline);
          resolve();
        });
        app.kill('SIGTERM');
      });
    }
    if (prisma) await prisma.$disconnect();
    if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
