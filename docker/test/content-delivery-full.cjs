// Production build and native Chromium delivery checks. Only the isolated task database/media are permitted.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const reqApp = createRequire('/app/package.json');
const execute = promisify(execFile);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, 'db');
assert.equal(database.pathname, '/delivery_fixture');
assert.equal(process.env.APP_ALBUM_ROOT_PATH, '/fixtures');
reqApp('ts-node').register({ project: '/app/tsconfig.json', transpileOnly: true });
reqApp('tsconfig-paths').register({ baseUrl: '/app', paths: { '@/*': ['src/*'] } });
const prisma = reqApp('./src/utils/prisma/prismaImporter.ts').default;
let temporary,
  app,
  browser,
  stage = 'fixture preparation';
(async () => {
  const files = await prisma.file.findMany();
  assert(
    files.length === 3 && files.some((file) => file.name === 'playback'),
    'requires generated delivery/browser fixtures',
  );
  const { getFileIdThumbnailPath } = reqApp('./src/utils/thumbnailHelper.ts');
  const { sourceVersion } = reqApp('./src/utils/processes/sourceIdentity.ts');
  for (const file of files) {
    const source = '/fixtures/' + file.path;
    const version = sourceVersion(await fs.stat(source));
    await prisma.file.update({
      where: { id: file.id },
      data: {
        metadataStatus: 'Processed',
        thumbnailStatus: 'Processed',
        sourceVersion: version,
        metadataSourceVersion: version,
        thumbnailSourceVersion: version,
        thumbnailProcessedAt: new Date(),
        metadataProcessedAt: new Date(),
      },
    });
    for (const size of [200, 600, 1280])
      await execute('ffmpeg', [
        '-v',
        'error',
        '-i',
        source,
        '-vf',
        `scale=${size}:-1`,
        '-frames:v',
        '1',
        '-y',
        getFileIdThumbnailPath(file.id, size),
      ]);
  }
  stage = 'production build';
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hmv-delivery-build-'));
  for (const item of ['src', 'public', 'package.json', 'tsconfig.json', 'next-env.d.ts']) {
    await fs.cp('/app/' + item, path.join(temporary, item), { recursive: true });
  }
  await fs.symlink('/app/node_modules', path.join(temporary, 'node_modules'));
  const config = { ...reqApp('./next.config.js.prod'), experimental: { cpus: 1 } };
  await fs.writeFile(path.join(temporary, 'next.config.js'), 'module.exports = ' + JSON.stringify(config));
  let build;
  try {
    build = await execute(process.execPath, [reqApp.resolve('next/dist/bin/next'), 'build', '--webpack'], {
      cwd: temporary,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' },
      timeout: 360000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    let output = (error.stdout ?? '') + (error.stderr ?? '');
    for (const [key, value] of Object.entries(process.env)) {
      if (/SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(key) && value) output = output.replaceAll(value, '[redacted]');
    }
    console.error(output.slice(-6000));
    throw new Error('production build failed');
  }
  app = spawn(
    process.execPath,
    [reqApp.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', '3000'],
    {
      cwd: temporary,
      env: process.env,
      stdio: 'ignore',
    },
  );
  for (let i = 0; ; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3000/api/health/ready')).ok) break;
    } catch {}
    assert(i < 60 && app.exitCode === null, 'production app readiness');
    await pause(500);
  }
  for (let i = 0; ; i++) {
    try {
      if ((await fetch('http://browser:9223/json/version')).ok) break;
    } catch {}
    assert(i < 60, 'task Chromium readiness');
    await pause(500);
  }
  browser = await reqApp('puppeteer').connect({ browserURL: 'http://browser:9223' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.setDefaultTimeout(30000);
  const errors = [];
  const mediaStatuses = [];
  const requests = [];
  const cdp = await page.target().createCDPSession();
  const mediaRequests = new Set();
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.includes('/api/file/')) mediaRequests.add(event.requestId);
  });
  cdp.on('Network.responseReceivedExtraInfo', (event) => {
    if (mediaRequests.has(event.requestId)) mediaStatuses.push(event.statusCode);
  });
  page.on('pageerror', (error) => errors.push(error.name));
  page.on('request', (request) => {
    if (request.url().includes('/api/file/')) requests.push(request.url());
  });
  const image = files.find((file) => file.name === 'image');
  const video = files.find((file) => file.name === 'playback');
  stage = 'browser login';
  await page.goto('http://fullcheck:3000/search', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-email');
  await page.type('#login-email', 'delivery-0@example.invalid');
  await page.type('#login-password', 'Synthetic-Delivery-Password!');
  await page.click('input[type=submit]');
  await page.waitForSelector('img[alt=image]');
  stage = 'image display/cache';
  await page.click('img[alt=image]');
  await page.waitForFunction(() => {
    const image = document.querySelector('[role=dialog] img');
    return image?.naturalWidth === 1280;
  });
  const src = await page.$eval('[role=dialog] img', (image) => image.getAttribute('src'));
  assert(src.startsWith(`/api/file/thumbnail/${image.id}/1280?v=`));
  assert(!requests.some((url) => url.includes('/api/file/content/' + image.id)), 'display must not download original');
  const imageSizes = await page.evaluate(async ({ id }) => {
    const preview = await fetch(document.querySelector('[role=dialog] img').src);
    const thumbnailBytes = (await preview.arrayBuffer()).byteLength;
    return { thumbnailBytes, etag: preview.headers.get('etag') };
  }, image);
  assert(imageSizes.thumbnailBytes < image.size);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('img[alt=image]');
  await page.waitForFunction(() => document.querySelector('[role=dialog] img')?.naturalWidth === 1280);
  assert(mediaStatuses.includes(304), 'browser must revalidate and reuse private image response');
  stage = 'original download';
  const popup = new Promise((resolve) => browser.once('targetcreated', resolve));
  await page.click('button[aria-label="Download media"]');
  const target = await popup;
  const original = await target.page();
  await original.waitForFunction(() => document.images[0]?.naturalWidth === 2400);
  assert(original.url().includes('/api/file/content/' + image.id));
  await original.close();
  await page.click('button[aria-label="Close dialog"]');
  stage = 'native video metadata/play/seek';
  await page.click('img[alt=playback]');
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video?.readyState >= 2 && video.duration > 7;
  });
  await page.$eval('video', (video) => video.play());
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
  await page.$eval('video', (video) => video.pause());
  for (const time of [0.1, 4, 7.7]) {
    await page.$eval(
      'video',
      (video, time) => {
        video.currentTime = time;
      },
      time,
    );
    await page.waitForFunction(
      (time) => {
        const video = document.querySelector('video');
        return !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.15;
      },
      {},
      time,
    );
  }
  stage = 'video thumbnail regeneration';
  const before = await prisma.file.findUniqueOrThrow({ where: { id: video.id } });
  const beforeThumbnailTag = await page.evaluate(async (id) => {
    const response = await fetch('/api/file/thumbnail/' + id + '/1280');
    await response.arrayBuffer();
    return response.headers.get('etag');
  }, video.id);
  await page.$eval('video', (video) => {
    video.currentTime = 4;
  });
  await page.waitForFunction(() => !document.querySelector('video').seeking);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (b) => b.textContent === 'Use current frame as thumbnail' && !b.disabled,
    ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Use current frame as thumbnail').click(),
  );
  await page.waitForFunction(() => document.body.textContent.includes('Thumbnail updated'), { timeout: 60000 });
  const after = await prisma.file.findUniqueOrThrow({ where: { id: video.id } });
  assert(after.thumbnailProcessedAt > before.thumbnailProcessedAt);
  const regenerated = await page.evaluate(
    async ({ id, etag }) => {
      const response = await fetch('/api/file/thumbnail/' + id + '/1280', { headers: { 'if-none-match': etag } });
      await response.arrayBuffer();
      return { status: response.status, etag: response.headers.get('etag') };
    },
    { id: video.id, etag: beforeThumbnailTag },
  );
  assert.equal(regenerated.status, 200, 'regenerated thumbnail must invalidate the previous representation');
  assert.notEqual(regenerated.etag, beforeThumbnailTag);
  assert.equal(await page.$eval('video', (video) => Math.round(video.currentTime)), 4);
  for (let i = 0; i < 6; i++)
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[role=dialog] button')];
      const next = buttons.find((b) => b.textContent.includes('Next') && !b.disabled);
      const previous = buttons.find((b) => b.textContent.includes('Previous') && !b.disabled);
      (next ?? previous)?.click();
    });
  await page.click('button[aria-label="Close dialog"]');
  stage = 'browser revocation/cache denial';
  const account = await prisma.user.findUniqueOrThrow({ where: { email: 'delivery-0@example.invalid' } });
  await reqApp('./src/utils/auth/serverSession.ts').revokeAllSessions(account.id);
  const denied = await page.evaluate(
    async ({ id, etag }) =>
      (
        await fetch('/api/file/thumbnail/' + id + '/1280', {
          headers: { 'if-none-match': etag },
          cache: 'no-cache',
        })
      ).status,
    { id: image.id, etag: imageSizes.etag },
  );
  assert.equal(denied, 403, 'a browser validator cannot bypass revoked authority');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-email');
  assert.deepEqual(errors, [], 'no unhandled browser exceptions');
  console.log(
    JSON.stringify({
      productionBuild: 'passed',
      standaloneTraceWarnings: ((build.stdout + build.stderr).match(/Failed to copy traced files/g) ?? []).length,
      browser: await browser.version(),
      largestThumbnail: { width: 1280, bytes: imageSizes.thumbnailBytes, originalBytes: image.size },
      browser304: true,
      originalDownload: true,
      nativePlayback: true,
      seekPositions: [0.1, 4, 7.7],
      thumbnailRegeneration: true,
      regeneratedThumbnailInvalidatesCache: true,
      rapidNavigationAndClose: true,
      revocationBlocksConditionalCache: true,
      limitations: ['External read-only dependency symlink; standalone artifact packaging is not validated'],
    }),
  );
})()
  .catch((error) => {
    console.error('Full delivery checks failed at', stage, error.name, error.code ?? '', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.disconnect();
    if (app && app.exitCode === null) {
      app.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => app.once('exit', resolve)), pause(5000)]);
      if (app.exitCode === null) app.kill('SIGKILL');
    }
    await prisma.$disconnect();
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  });
