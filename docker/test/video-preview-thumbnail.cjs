// Run only with the disposable thumbnail_preview database and /fixtures source root.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const app = createRequire('/home/node/app/package.json');
app('ts-node').register({ transpileOnly: true, project: '/home/node/app/tsconfig.json' });
app('tsconfig-paths/register');
const load = name => app(`./src/${name}`);

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname, '/thumbnail_preview');
  assert.equal(process.env.APP_ALBUM_ROOT_PATH, '/fixtures');
  if (process.argv.includes('--prepare')) {
    cp.execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=red:size=320x180:rate=10:d=1',
      '-f', 'lavfi', '-i', 'color=c=green:size=320x180:rate=10:d=1',
      '-filter_complex_threads', '1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
      '-map', '[v]', '-threads', '1', '-c:v', 'mpeg4', '/fixtures/changing.mp4']);
    return;
  }
  const prisma = load('utils/prisma/prismaImporter').default;
  const { getFileThumbnailPath } = load('utils/thumbnailHelper');
  const { getIronSessionOptions } = load('utils/sessionHelper');
  const { sealData } = app('iron-session');
  const Jimp = app('jimp');
  const sizes = [200, 600, 1280];
  const options = getIronSessionOptions();
  const cookie = async admin => `${options.cookieName}=${await sealData({ user: { id: 'preview-test', admin } }, { password: options.password })}`;
  const adminCookie = await cookie(true);
  const memberCookie = await cookie(false);
  const source = await fs.readFile('/fixtures/changing.mp4');
  const stat = await fs.stat('/fixtures/changing.mp4');
  let file;
  try {
    file = await prisma.file.create({ data: { path: 'changing.mp4', name: 'changing', extension: 'mp4', size: stat.size, modifiedAt: stat.mtime } });
    await prisma.fileMeta.create({ data: { fileId: file.id, metaKey: 'preview-test', origin: 'Manual', type: 'String', stringValue: 'preserve' } });
    const metadata = async () => {
      const row = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
      for (const key of ['thumbnailStatus', 'thumbnailProcessedAt', 'thumbnailProcessingError', 'thumbnailSourceVersion']) delete row[key];
      return JSON.stringify({ row, metas: await prisma.fileMeta.findMany({ where: { fileId: file.id } }) });
    };
    const beforeMetadata = await metadata();
    const previews = () => Promise.all(sizes.map(size => fs.readFile(getFileThumbnailPath(file, size))));
    const request = async (time, session = adminCookie, id = file.id) => {
      const response = await fetch('http://app:3000/api/process/run', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: session },
        body: JSON.stringify({ fileId: id, stages: ['thumbnails'], mode: 'refresh', videoThumbnailTimeSec: time }), signal: AbortSignal.timeout(120000) });
      const text = await response.text();
      let body; try { body = JSON.parse(text); } catch { /* Authorization errors are text. */ }
      return { status: response.status, body };
    };
    assert.equal((await request(0)).body.data.stages.thumbnails.succeeded, 1);
    const red = await previews();
    assert.equal((await request(undefined)).status, 200);
    assert.deepEqual(await previews(), red);
    for (const session of ['', memberCookie]) {
      assert.equal((await request(1.5, session)).status, 403);
      assert.deepEqual(await previews(), red);
    }
    assert.equal((await request(1.5)).body.data.stages.thumbnails.succeeded, 1);
    const green = await previews();
    for (const [index, size] of sizes.entries()) {
      const first = await Jimp.read(red[index]);
      const second = await Jimp.read(green[index]);
      assert.equal(second.bitmap.width, size);
      const a = Jimp.intToRGBA(first.getPixelColor(10, 10));
      const b = Jimp.intToRGBA(second.getPixelColor(10, 10));
      assert(a.r > a.g * 2);
      assert(b.g > b.r * 2);
    }
    assert.equal((await request(-1)).status, 400);
    assert.equal((await request(2)).status, 500);
    assert.deepEqual(await previews(), green);
    const missing = await request(0, adminCookie, 'missing-preview-file');
    assert.equal(missing.status, 400);
    const response = await fetch(`http://app:3000/api/file/${file.id}`, { headers: { cookie: adminCookie } });
    const refreshed = (await response.json()).data;
    assert.equal(refreshed.thumbnail, green[0].toString('base64'));
    assert(refreshed.thumbnailProcessedAt);
    assert.equal(await metadata(), beforeMetadata);
    assert.deepEqual(await fs.readFile('/fixtures/changing.mp4'), source);
    console.log(JSON.stringify({ passed: true, checks: ['administrator zero/fractional frames at all sizes and default parity', 'anonymous/member forbidden without mutations', 'invalid/end time preserves thumbnails', 'missing target rejected', 'refetch returns current image and generation time', 'source and metadata unchanged'] }));
  } finally {
    if (file) {
      await prisma.fileMeta.deleteMany({ where: { fileId: file.id } });
      await prisma.file.delete({ where: { id: file.id } });
      await Promise.all(sizes.map(size => fs.rm(getFileThumbnailPath(file, size), { force: true })));
    }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
