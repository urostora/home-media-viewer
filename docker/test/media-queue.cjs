// Queue acceptance in the disposable benchmark DB; processors are controlled so
// dispatch, deadlines and failures can be exercised without decoding media.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const requireApp = createRequire('/home/node/app/package.json');
requireApp('ts-node').register({ transpileOnly: true, project: '/home/node/app/tsconfig.json' });
requireApp('tsconfig-paths/register');
const load = name => requireApp(`./src/${name}`);
const prisma = load('utils/prisma/prismaImporter.ts').default;
const fileStages = load('utils/processes/fileStages.ts');
const { processMediaQueue, mediaQueueCursorKey, mediaPageSize } = load('utils/processes/mediaQueue.ts');
const runner = load('utils/processes/updateMetadataProcess.ts').default;
const { withProcessingLock } = load('utils/processes/processingLock.ts');
const { isShuttingDownHandler } = load('utils/isShuttingDown.ts');
const checks = [];
const measurements = [];
const prefix = `queue-${randomUUID()}`;
const albumIds = [];
const cursorKeys = new Set();
let processor;
let pageHook;
let virtual;
let pageReads = 0;
fileStages.processFileStage = async (file, stage) => processor(file, stage);
prisma.$use(async (params, next) => {
  if (params.model === 'File' && params.action === 'findMany' && params.args.take === mediaPageSize) {
    assert.equal(params.args.skip, undefined, 'Offset paging can skip a shrinking queue');
    assert.deepEqual(params.args.orderBy, { id: 'asc' });
    pageReads++;
    if (virtual) return virtual.page(params.args);
    if (pageHook) return pageHook(params, next);
  }
  if (virtual && params.model === 'File' && params.action === 'count') return 0;
  return next(params);
});

const gate = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function until(condition) {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for controlled worker progress');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
async function publish(file, stage) {
  await prisma.file.update({ where: { id: file.id }, data: stage === 'metadata'
    ? { metadataStatus: 'Processed' } : { thumbnailStatus: 'Processed' } });
  return 'succeeded';
}
async function fixture(count) {
  const tag = `${prefix}-${albumIds.length}`;
  const albums = [];
  for (const suffix of ['early', 'overlap']) {
    const album = await prisma.album.create({ data: {
      name: `${tag}-${suffix}`, sourceType: 'File', connectionString: '', basePath: `/fixtures/${tag}/${suffix}`,
    } });
    albumIds.push(album.id);
    albums.push(album);
  }
  const files = [];
  for (let index = 0; index < count; index++) {
    files.push(await prisma.file.create({ data: {
      id: `${tag}-${String(index + 100).padStart(6, '0')}`,
      path: `${tag}/${index}.txt`, name: String(index), extension: 'txt',
      albums: { connect: (index % 3 === 0 ? albums : [albums[index % 2]]).map(({ id }) => ({ id })) },
    } }));
  }
  const scope = { status: 'Active', albums: { some: { id: { in: albums.map(({ id }) => id) } } } };
  const key = (mode = 'pending', stages = ['metadata', 'thumbnails']) => {
    const value = mediaQueueCursorKey(albums[0].id, mode, stages);
    cursorKeys.add(value);
    return value;
  };
  return { files, albums, scope, key };
}
async function cleanup() {
  pageHook = undefined;
  virtual = undefined;
  await prisma.file.deleteMany({ where: { path: { startsWith: prefix } } });
  await prisma.album.deleteMany({ where: { id: { in: albumIds } } });
  await prisma.mediaQueueCursor.deleteMany({ where: { id: { in: [...cursorKeys] } } });
}
async function check(name, test) {
  pageReads = 0;
  processor = publish;
  try {
    await test();
    checks.push(name);
    console.log(JSON.stringify({ check: name, passed: true }));
  } finally { await cleanup(); }
}
const run = options => withProcessingLock(() => processMediaQueue({
  mode: 'pending', stages: ['metadata', 'thumbnails'], workers: 2, stopped: () => false, ...options,
}));

async function boundedRefresh(albumId) {
  const originalNow = Date.now;
  let clock = originalNow();
  Date.now = () => clock;
  const ids = [];
  processor = async (file, stage) => {
    ids.push(file.id);
    const result = await publish(file, stage);
    clock += 1500;
    return result;
  };
  try {
    const result = await runner.run({ albumId, mode: 'refresh', stages: ['metadata'], workers: 1, timeoutSec: 1 });
    assert.equal(result.processedFileCount, 1);
    assert.equal(result.outcome, 'partial');
    return ids;
  } finally { Date.now = originalNow; }
}

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname, '/benchmark');
  assert.equal(process.env.NODE_ENV, 'production');
  if (process.argv[2] === 'resume') {
    const ids = await boundedRefresh(process.env.QUEUE_TEST_ALBUM);
    console.log(JSON.stringify({ ids }));
    return;
  }
  await check('shrinking stage queues cross pages without skipped or duplicate overlapping files', async () => {
    const data = await fixture(193);
    for (let index = 0; index < data.files.length; index++) {
      await prisma.file.update({ where: { id: data.files[index].id }, data: index % 2
        ? { metadataStatus: 'Processed' } : { thumbnailStatus: 'Processed' } });
    }
    const seen = new Set();
    processor = async (file, stage) => {
      const key = `${file.id}:${stage}`;
      assert.ok(!seen.has(key), 'A stage ran twice for an overlapping file');
      seen.add(key);
      return publish(file, stage);
    };
    const result = await run({ scope: data.scope, cursorKey: data.key() });
    assert.equal(result.processedFiles, 193);
    assert.equal(seen.size, 193);
    assert.equal(result.stages.metadata.attempted, 97);
    assert.equal(result.stages.thumbnails.attempted, 96);
    assert.equal(result.stages.metadata.deferred + result.stages.thumbnails.deferred, 0);
    assert.ok(pageReads >= 4);
  });
  await check('a free worker dispatches more files while an unrelated slow file is active', async () => {
    const data = await fixture(12);
    const slow = gate();
    let fast = 0;
    let active = 0;
    let peak = 0;
    let slowFinished = false;
    processor = async (file, stage) => {
      peak = Math.max(peak, ++active);
      try {
        if (file.id === data.files[0].id) { await slow.promise; slowFinished = true; }
        else fast++;
        return await publish(file, stage);
      } finally { active--; }
    };
    const work = run({ scope: data.scope, stages: ['metadata'], cursorKey: data.key('pending', ['metadata']) });
    try {
      await until(() => fast >= 5);
      assert.equal(slowFinished, false);
      assert.equal(peak, 2);
    } finally { slow.resolve(); }
    const result = await work;
    assert.equal(result.processedFiles, 12);
  });
  await check('a rejected stage preserves per-file ordering and does not stall other stages or files', async () => {
    const data = await fixture(8);
    const states = new Map();
    processor = async (file, stage) => {
      if (stage === 'metadata') {
        assert.equal(states.has(file.id), false);
        states.set(file.id, 'metadata');
        if (file.id === data.files[0].id) throw new Error('Injected stage rejection');
      } else assert.equal(states.get(file.id), 'metadata');
      return publish(file, stage);
    };
    const result = await run({ scope: data.scope, cursorKey: data.key() });
    assert.equal(result.processedFiles, 8);
    assert.equal(result.stages.metadata.failed, 1);
    assert.equal(result.stages.metadata.attempted, 8);
    assert.equal(result.stages.thumbnails.succeeded, 8);
    assert.equal(result.stages.metadata.deferred, 1);
  });
  await check('a deadline stops dispatch mid-page without checkpointing prefetched files', async () => {
    const data = await fixture(80);
    let stopped = false;
    processor = async (file, stage) => { const result = await publish(file, stage); stopped = true; return result; };
    const key = data.key();
    const result = await run({ scope: data.scope, workers: 1, stopped: () => stopped, cursorKey: key });
    assert.equal(result.processedFiles, 1);
    assert.equal(result.stages.metadata.attempted, 1);
    assert.equal(result.stages.thumbnails.attempted, 1);
    assert.equal(result.stages.metadata.deferred, 79);
    assert.equal(result.stages.thumbnails.deferred, 79);
    assert.equal((await prisma.mediaQueueCursor.findUniqueOrThrow({ where: { id: key } })).lastFileId, data.files[0].id);
    processor = publish;
    const resumed = await run({ scope: data.scope, cursorKey: key });
    assert.equal(resumed.processedFiles, 79);
    assert.equal(resumed.stages.metadata.attempted, 79);
    assert.equal(resumed.stages.thumbnails.attempted, 79);
  });
  await check('a deadline during page loading dispatches nothing and leaves the saved position untouched', async () => {
    const data = await fixture(8);
    let stopped = false;
    pageHook = async (params, next) => { const rows = await next(params); stopped = true; return rows; };
    const key = data.key();
    const result = await run({ scope: data.scope, cursorKey: key, stopped: () => stopped });
    assert.equal(result.processedFiles, 0);
    assert.equal(result.stages.metadata.deferred, 8);
    assert.equal(result.stages.thumbnails.deferred, 8);
    assert.equal(await prisma.mediaQueueCursor.findUnique({ where: { id: key } }), null);
  });
  await check('shutdown stops new dispatch and drains every already active worker', async () => {
    const data = await fixture(8);
    const release = gate();
    let started = 0;
    let finished = 0;
    const prior = process.env.HMV_SHUTTING_DOWN;
    processor = async () => { started++; await release.promise; finished++; return 'deferred'; };
    const work = run({ scope: data.scope, cursorKey: data.key(), stopped: isShuttingDownHandler.isShuttingDown });
    try {
      await until(() => started === 2);
      process.env.HMV_SHUTTING_DOWN = '1';
      release.resolve();
      const result = await work;
      assert.equal(started, 2);
      assert.equal(finished, 2);
      assert.equal(result.stages.metadata.attempted, 2);
      assert.equal(result.stages.metadata.deferred, 8);
      assert.equal(result.stages.thumbnails.attempted, 0);
      assert.equal(result.stages.thumbnails.deferred, 8);
    } finally {
      release.resolve();
      if (prior === undefined) delete process.env.HMV_SHUTTING_DOWN;
      else process.env.HMV_SHUTTING_DOWN = prior;
      await work;
    }
  });
  await check('a page rejection retains the writer lock until slow active work has drained', async () => {
    const data = await fixture(80);
    const slow = gate();
    let failed = false;
    let finished = false;
    pageHook = async (params, next) => {
      if (pageReads === 2) { failed = true; throw new Error('Injected page failure'); }
      return next(params);
    };
    processor = async (file, stage) => {
      if (file.id === data.files[0].id) { await slow.promise; finished = true; }
      return publish(file, stage);
    };
    const work = run({ scope: data.scope, stages: ['metadata'], cursorKey: data.key('pending', ['metadata']) });
    // Attach rejection handling immediately, while deliberately retaining the slow job.
    const outcome = work.then(() => null, error => error);
    try {
      await until(() => failed);
      assert.equal(finished, false);
      await assert.rejects(withProcessingLock(async () => true), /locked/i);
    } finally { slow.resolve(); }
    assert.match((await outcome).message, /Injected page failure/);
    assert.equal(finished, true);
    await withProcessingLock(async () => true);
  });
  await check('refresh resumes in a fresh process and wraps once despite continuous early work', async () => {
    const data = await fixture(6);
    await prisma.file.updateMany({ where: data.scope, data: { metadataStatus: 'Processed' } });
    const key = data.key('refresh', ['metadata']);
    const ids = [...await boundedRefresh(data.albums[0].id)];
    const child = spawnSync(process.execPath, [__filename, 'resume'], {
      env: { ...process.env, QUEUE_TEST_ALBUM: data.albums[0].id }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(child.status, 0, child.stderr);
    ids.push(...JSON.parse(child.stdout.trim().split('\n').at(-1)).ids);
    assert.deepEqual(ids, [data.files[0].id, data.files[2].id]);
    // Cursor positions remain usable even when their referenced source is removed.
    await prisma.file.delete({ where: { id: ids[1] } });
    processor = publish;
    const completed = await runner.run({ albumId: data.albums[0].id, mode: 'refresh', stages: ['metadata'], workers: 2, timeoutSec: 30 });
    const uniqueCount = await prisma.file.count({ where: { albums: { some: { id: data.albums[0].id } } } });
    assert.equal(completed.processedFileCount, uniqueCount);
    assert.equal(completed.stages.metadata.attempted, uniqueCount);
    assert.equal(completed.stages.metadata.deferred, 0);
    assert.ok(await prisma.mediaQueueCursor.findUnique({ where: { id: key } }));
  });
  await check('bounded library runs advance past repeatedly pending early records across albums', async () => {
    const data = await fixture(8);
    // Other stage fixtures have already drained; select only metadata for this check.
    assert.equal(await prisma.file.count({ where: { metadataStatus: 'New', NOT: data.scope, isDirectory: false } }), 0);
    const key = mediaQueueCursorKey(undefined, 'pending', ['metadata']);
    cursorKeys.add(key);
    await prisma.mediaQueueCursor.deleteMany({ where: { id: key } });
    const originalNow = Date.now;
    const ids = [];
    try {
      for (let iteration = 0; iteration < 4; iteration++) {
        let clock = originalNow();
        Date.now = () => clock;
        processor = async file => { ids.push(file.id); clock += 1500; return 'deferred'; };
        const result = await runner.run({ stages: ['metadata'], timeoutSec: 1, workers: 1 });
        assert.equal(result.processedFileCount, 1);
        assert.equal(result.outcome, 'partial');
      }
    } finally { Date.now = originalNow; }
    assert.deepEqual(ids, data.files.slice(0, 4).map(file => file.id));
  });
  await check('slow metadata cannot starve thumbnails during repeated short refreshes', async () => {
    const data = await fixture(6);
    const key = data.key('refresh');
    const originalNow = Date.now;
    const calls = [];
    try {
      for (let iteration = 0; iteration < 2; iteration++) {
        let clock = originalNow();
        Date.now = () => clock;
        processor = async (file, stage) => {
          calls.push([file.id, stage]);
          const result = await publish(file, stage);
          if (stage === 'metadata') clock += 1500;
          return result;
        };
        const result = await runner.run({ albumId: data.albums[0].id, mode: 'refresh', timeoutSec: 1, workers: 1,
          stages: ['metadata', 'thumbnails'] });
        assert.equal(result.processedFileCount, 1);
        assert.equal(result.stages.metadata.attempted, 1);
        assert.equal(result.stages.thumbnails.attempted, 1);
        assert.equal(result.outcome, 'partial');
      }
    } finally { Date.now = originalNow; }
    assert.deepEqual(calls, [
      [data.files[0].id, 'metadata'], [data.files[0].id, 'thumbnails'],
      [data.files[2].id, 'metadata'], [data.files[2].id, 'thumbnails'],
    ]);
    assert.equal((await prisma.mediaQueueCursor.findUniqueOrThrow({ where: { id: key } })).lastFileId, data.files[2].id);
  });
  await check('large virtual queues keep page size and retained heap bounded as the backlog grows', async () => {
    for (const size of [4096, 131072]) {
      let processed = 0;
      let sum = 0;
      let maxPage = 0;
      let heap = 0;
      global.gc?.();
      const before = process.memoryUsage().heapUsed;
      const started = performance.now();
      virtual = { page(args) {
        const range = args.where.AND[1].id;
        assert.equal(range.lte, undefined);
        const from = Number(range.gt ?? 0) + 1;
        const count = Math.max(0, Math.min(size - from + 1, args.take));
        maxPage = Math.max(maxPage, count);
        if (pageReads % 64 === 0) { global.gc?.(); heap = Math.max(heap, process.memoryUsage().heapUsed); }
        return Array.from({ length: count }, (_, offset) => ({
          id: String(from + offset).padStart(12, '0'), name: `virtual-${from + offset}`,
          metadataStatus: 'New', thumbnailStatus: 'Processed', isDirectory: false,
        }));
      } };
      processor = async file => { processed++; sum += Number(file.id); return 'succeeded'; };
      const result = await processMediaQueue({ scope: {}, stages: ['metadata'], mode: 'pending', workers: 4, stopped: () => false });
      global.gc?.();
      heap = Math.max(heap, process.memoryUsage().heapUsed);
      const retainedHeapGrowth = heap - before;
      assert.equal(result.processedFiles, size);
      assert.equal(processed, size);
      assert.equal(sum, size * (size + 1) / 2);
      assert.equal(maxPage, 64);
      assert.ok(retainedHeapGrowth < 32 * 1024 ** 2, `Retained heap grew with backlog: ${retainedHeapGrowth}`);
      measurements.push({ size, durationMs: performance.now() - started, maxPage, retainedHeapGrowth });
      virtual = undefined;
    }
  });
  console.log(JSON.stringify({ passed: true, checks, measurements }));
}
main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (process.argv[2] !== 'resume') await cleanup(); await prisma.$disconnect(); });
