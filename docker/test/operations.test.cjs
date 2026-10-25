const assert = require('node:assert/strict');
const { mkdtemp, rm, mkdir, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const app = path.resolve(__dirname, '../../home-media-viewer');
require(`${app}/node_modules/ts-node/register/transpile-only`);
require(`${app}/node_modules/tsconfig-paths/register`);
const load = (file) => require(`${app}/src/${file}`);

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hmv-operations-'));
  const oldStorage = process.env.APP_STORAGE_PATH;
  process.env.APP_STORAGE_PATH = directory;
  process.env.APP_ALBUM_ROOT_PATH = directory;
  process.env.APP_THUMBNAIL_SUBDIRECTORY = 'custom/previews';
  process.env.MIN_STORAGE_FREE_BYTES = '0';
  try {
    const { getWorkerCount } = load('utils/processes/processConfig.ts');
    for (const value of [0, -2, 1, 10000, NaN, Infinity]) {
      assert.ok(getWorkerCount(value) >= 1 && getWorkerCount(value) <= 4);
    }
    const availableParallelism = os.availableParallelism;
    os.availableParallelism = () => 1;
    assert.equal(getWorkerCount(10), 1);
    os.availableParallelism = availableParallelism;

    const { storageRoot, thumbnailRoot } = load('utils/storagePaths.ts');
    assert.equal(storageRoot(), directory);
    assert.equal(thumbnailRoot(), path.join(directory, 'custom/previews'));
    process.env.APP_THUMBNAIL_SUBDIRECTORY = '../escape';
    assert.throws(thumbnailRoot);
    process.env.APP_THUMBNAIL_SUBDIRECTORY = 'custom/previews';

    const { isProcessAuthorized } = load('utils/processAuth.ts');
    process.env.PROCESS_TOKEN = 'private-test';
    assert.equal(isProcessAuthorized({ headers: {}, query: { token: 'private-test' } }), false);
    assert.equal(isProcessAuthorized({ headers: { authorization: 'Bearer private-test' } }), true);
    assert.equal(isProcessAuthorized({ headers: { authorization: 'Bearer wrong' } }), false);

    const { withIndexingLock, IndexingBusyError, readIndexingState } = load('utils/processes/indexingState.ts');
    await withIndexingLock(async () => {
      await assert.rejects(withIndexingLock(async () => true), IndexingBusyError);
      // A separate Node process must observe the same lock.
      const child = spawn(process.execPath, ['-e', `
        require(${JSON.stringify(app + '/node_modules/ts-node/register/transpile-only')});
        require(${JSON.stringify(app + '/node_modules/tsconfig-paths/register')});
        const {withIndexingLock, IndexingBusyError} = require(${JSON.stringify(app + '/src/utils/processes/indexingState.ts')});
        withIndexingLock(async () => true).then(() => process.exit(2), e => process.exit(e instanceof IndexingBusyError ? 0 : 3));
      `], { env: process.env, stdio: 'inherit' });
      assert.equal(await new Promise(resolve => child.on('exit', resolve)), 0);
      return true;
    });
    const success = (await readIndexingState()).lastSuccessAt;
    await assert.rejects(withIndexingLock(async () => { throw new Error('fixture failure'); }));
    assert.equal((await readIndexingState()).failures, 1);
    assert.equal((await readIndexingState()).lastSuccessAt, success);
    await withIndexingLock(async () => undefined);
    assert.equal((await readIndexingState()).outcome, 'interrupted');
    // A stale lock fails closed rather than permitting duplicate processing.
    await mkdir(path.join(directory, 'operations/indexing.lock'));
    await assert.rejects(withIndexingLock(async () => true), IndexingBusyError);
    await rm(path.join(directory, 'operations/indexing.lock'), { recursive: true });

    const prisma = load('utils/prisma/prismaImporter.ts').default;
    const noRows = async () => null;
    for (const model of ['album', 'file', 'fileMeta', 'user']) prisma[model].findFirst = noRows;
    prisma.$queryRaw = async () => [];
    const readiness = load('pages/api/health/ready.ts').default;
    async function probe(handler) {
      const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
      await handler({}, response);
      return response;
    }
    assert.equal((await probe(readiness)).code, 200);
    assert.deepEqual(await require('node:fs/promises').readdir(thumbnailRoot()), []);
    // Invalidate the five-second cache without sleeping.
    const realNow = Date.now;
    let tick = realNow();
    Date.now = () => (tick += 6000);
    prisma.album.findFirst = async () => { throw new Error('database unavailable'); };
    assert.equal((await probe(readiness)).code, 503);
    prisma.album.findFirst = noRows;
    prisma.$queryRaw = async () => [{ migration_name: 'failed' }];
    assert.equal((await probe(readiness)).code, 503);
    prisma.$queryRaw = async () => [];
    process.env.MIN_STORAGE_FREE_BYTES = String(Number.MAX_SAFE_INTEGER);
    assert.equal((await probe(readiness)).code, 503);
    process.env.MIN_STORAGE_FREE_BYTES = '0';
    process.env.APP_THUMBNAIL_SUBDIRECTORY = '../escape';
    assert.equal((await probe(readiness)).code, 503);
    process.env.APP_THUMBNAIL_SUBDIRECTORY = 'custom/previews';
    const live = load('pages/api/health/live.ts').default;
    assert.equal((await probe(live)).code, 200);
    process.env.HMV_SHUTTING_DOWN = '1';
    assert.equal((await probe(readiness)).code, 503);
    assert.equal((await probe(live)).code, 503);
    delete process.env.HMV_SHUTTING_DOWN;
    Date.now = realNow;
    await prisma.$disconnect();

    // Media commands are asynchronous, report errors and receive shutdown signals.
    const { mediaCommand } = load('utils/mediaCommand.ts');
    assert.equal(await mediaCommand(process.execPath, ['-e', 'process.stdout.write("ok")']), 'ok');
    await assert.rejects(mediaCommand(process.execPath, ['-e', 'process.exit(1)']));
    const hasFfmpeg = require('node:fs').existsSync('/usr/bin/ffmpeg');
    const pending = hasFfmpeg
      ? mediaCommand('/usr/bin/ffmpeg', ['-re', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=1', '-f', 'null', '-'])
      : mediaCommand(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    await new Promise(resolve => setTimeout(resolve, 300));
    process.kill(process.pid, 'SIGTERM');
    await assert.rejects(pending);
    console.log('Operations regression checks passed: concurrency, storage, auth, cross-process lock, durable status, readiness failures and media shutdown');
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (oldStorage === undefined) delete process.env.APP_STORAGE_PATH;
    else process.env.APP_STORAGE_PATH = oldStorage;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
