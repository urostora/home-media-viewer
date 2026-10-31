// Run in the benchmark worker against its disposable DB. Sources live in a
// task-owned /tmp directory; the normal /fixtures mount remains read-only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const requireApp = createRequire('/home/node/app/package.json');
const checks = [];
const measurements = [];

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname, '/benchmark');
  const child = process.argv[2] === 'resume';
  const root = child ? process.env.DISCOVERY_TEST_ROOT : await fs.mkdtemp(path.join(os.tmpdir(), 'hmv-discovery-'));
  process.env.APP_ALBUM_ROOT_PATH = root;
  requireApp('ts-node').register({ transpileOnly: true, project: '/home/node/app/tsconfig.json' });
  requireApp('tsconfig-paths/register');
  const load = name => requireApp(`./src/${name}`);
  const prisma = load('utils/prisma/prismaImporter.ts').default;
  const { discover } = load('utils/processes/discovery.ts');
  const { withProcessingLock } = load('utils/processes/processingLock.ts');
  const runner = load('utils/processes/updateMetadataProcess.ts').default;
  const albumIds = [];
  let queryCount = 0;
  prisma.$use(async (params, next) => { queryCount++; return next(params); });
  const albumsInScope = async () => {
    const albums = await prisma.album.findMany({ where: { id: { in: albumIds } } });
    return albumIds.map(id => albums.find(album => album.id === id));
  };
  const step = async (albums, calls = Infinity) => {
    let count = 0;
    return withProcessingLock(() => discover(albums, () => ++count > calls));
  };
  const drain = async (albums, allowedFailures = 0) => {
    for (let iteration = 0; iteration < 50; iteration++) {
      const result = await step(albums, 140);
      assert.ok(result.statistics.failed <= allowedFailures, JSON.stringify(result));
      if (result.statistics.deferred === 0) return;
    }
    assert.fail('Discovery did not drain after bounded runs');
  };
  const file = relative => prisma.file.findFirstOrThrow({ where: { path: relative, albums: { some: { id: { in: albumIds } } } } });
  const check = async (name, test) => { await test(); checks.push(name); };
  try {
    if (child) {
      const albums = await prisma.album.findMany({ where: { basePath: { startsWith: root } } });
      const result = await step(albums, 140);
      assert.equal(result.statistics.failed, 0);
      console.log(JSON.stringify({ resumed: true }));
      return;
    }
    for (const directory of ['a-wide', 'z-later', 'a-wide/nested', 'a-wide/deep/a/b/c/d/e/f/g/h']) {
      await fs.mkdir(path.join(root, directory), { recursive: true });
    }
    for (let offset = 0; offset < 640; offset += 32) {
      await Promise.all(Array.from({ length: 32 }, (_, index) => fs.writeFile(path.join(root, 'a-wide', `${String(offset + index).padStart(4, '0')}.txt`), 'first')));
    }
    await fs.writeFile(path.join(root, 'a-wide/nested/shared.txt'), 'shared');
    await fs.writeFile(path.join(root, 'z-later/late.txt'), 'late');
    await fs.writeFile(path.join(root, 'a-wide/deep/a/b/c/d/e/f/g/h/deep.txt'), 'deep');
    for (const directory of ['a-wide', 'z-later', 'a-wide/nested']) {
      const album = await prisma.album.create({ data: { name: `discovery-${path.basename(root)}-${directory}`, sourceType: 'File', connectionString: '', basePath: path.join(root, directory) } });
      albumIds.push(album.id);
    }
    const albums = await albumsInScope();
    await check('bounded initial import checkpoints without extracting metadata or thumbnails', async () => {
      const result = await step(albums, 50);
      assert.ok(result.statistics.deferred > 0);
      const count = await prisma.file.count({ where: { albums: { some: { id: albumIds[0] } }, isDirectory: false } });
      assert.ok(count > 0 && count < 642);
      assert.ok(await prisma.discoveryDirectory.count({ where: { entryCursor: { not: null }, path: { startsWith: root } } }) > 0);
      assert.equal(await prisma.fileMeta.count({ where: { file: { albums: { some: { id: { in: albumIds } } } } } }), 0);
      assert.equal(await prisma.file.count({ where: { albums: { some: { id: { in: albumIds } } }, OR: [{ metadataStatus: { not: 'New' } }, { thumbnailStatus: { not: 'New' } }] } }), 0);
    });
    await check('fresh process resumes durable progress and later albums progress before early import completes', async () => {
      const before = await prisma.file.count({ where: { albums: { some: { id: albumIds[0] } } } });
      const resumed = spawnSync(process.execPath, [__filename, 'resume'], { env: { ...process.env, DISCOVERY_TEST_ROOT: root }, encoding: 'utf8', timeout: 120000 });
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.ok(await prisma.file.count({ where: { albums: { some: { id: albumIds[0] } } } }) > before);
      assert.equal((await file('z-later/late.txt')).status, 'Active');
      assert.ok(await prisma.file.count({ where: { albums: { some: { id: albumIds[0] } }, isDirectory: false } }) < 642);
      await drain(albums);
    });
    await check('deep traversal and overlapping albums retain unique files and correct memberships', async () => {
      const shared = await prisma.file.findMany({ where: { path: 'a-wide/nested/shared.txt' }, include: { albums: true } });
      assert.equal(shared.length, 1);
      assert.deepEqual(new Set(shared[0].albums.map(album => album.id)), new Set([albumIds[0], albumIds[2]]));
      assert.equal((await file('a-wide/deep/a/b/c/d/e/f/g/h/deep.txt')).status, 'Active');
      const parent = await file('a-wide/nested');
      assert.equal(shared[0].parentFileId, parent.id);
    });
    await check('one physical enumeration per run and bounded linear reconciliation query growth', async () => {
      const original = fs.readdir;
      const reads = new Map();
      fs.readdir = async (...args) => { reads.set(args[0], (reads.get(args[0]) ?? 0) + 1); return original(...args); };
      try {
        queryCount = 0;
        const started = performance.now();
        const result = await step(albums);
        measurements.push({ scenario: 'unchanged-640-wide-deep-overlap', durationMs: performance.now() - started, prismaOperations: queryCount });
        assert.equal(result.statistics.deferred, 0);
        assert.equal(result.statistics.failed, 0);
        assert.ok([...reads.values()].every(count => count === 1));
        // An unchanged flat 640-file directory must not issue per-file writes/reads.
        assert.ok(queryCount < 400, `Unexpected query amplification: ${queryCount}`);
      } finally { fs.readdir = original; }
    });
    await check('changed listings restart saved cursors and discover names before the previous cursor', async () => {
      const rootTask = { path: path.join(root, 'a-wide') };
      await prisma.discoveryDirectory.updateMany({ where: rootTask, data: { lastServedAt: new Date(0) } });
      const partial = await step([albums[0]], 30);
      const saved = await prisma.discoveryDirectory.findFirstOrThrow({ where: rootTask });
      assert.ok(saved.entryCursor !== null && saved.scanVersion !== null, JSON.stringify({ saved, partial }));
      const early = path.join(root, 'a-wide', '!before-cursor.txt');
      await fs.writeFile(early, 'new');
      await prisma.discoveryDirectory.updateMany({ where: rootTask, data: { lastServedAt: new Date(0) } });
      await step([albums[0]], 30);
      assert.equal((await file('a-wide/!before-cursor.txt')).status, 'Active');
      await drain(albums);
      await fs.unlink(early);
      await drain(albums);
    });
    await check('interrupted and unreadable enumeration cannot delete unvisited records', async () => {
      const target = await file('a-wide/0000.txt');
      await fs.unlink(path.join(root, target.path));
      await step([albums[0]], 5);
      assert.equal((await file(target.path)).status, 'Active');
      const original = fs.readdir;
      fs.readdir = async () => { const error = new Error('Injected unreadable directory'); error.code = 'EACCES'; throw error; };
      try {
        const result = await step([albums[0]]);
        assert.ok(result.statistics.failed > 0);
        assert.equal((await file(target.path)).status, 'Active');
      } finally { fs.readdir = original; }
      await drain(albums);
      assert.equal((await file(target.path)).status, 'Deleted');
      await fs.writeFile(path.join(root, target.path), 'again');
      await drain(albums);
      assert.equal((await file(target.path)).id, target.id);
      assert.equal((await file(target.path)).status, 'Active');
    });
    await check('same-size edits invalidate both stages and retain existing metadata', async () => {
      const target = await file('a-wide/0001.txt');
      await prisma.file.update({ where: { id: target.id }, data: { metadataStatus: 'Processed', thumbnailStatus: 'Processed' } });
      await prisma.fileMeta.create({ data: { fileId: target.id, metaKey: 'keep', type: 'String', origin: 'Manual', stringValue: 'manual' } });
      await fs.writeFile(path.join(root, target.path), 'other');
      await drain(albums);
      const changed = await file(target.path);
      assert.equal(changed.size, target.size);
      assert.notEqual(changed.sourceVersion, target.sourceVersion);
      assert.equal(changed.metadataStatus, 'New'); assert.equal(changed.thumbnailStatus, 'New');
      assert.equal((await prisma.fileMeta.findFirstOrThrow({ where: { fileId: target.id } })).stringValue, 'manual');
    });
    await check('disappearing directories do not delete descendants until the parent safely reconciles', async () => {
      await fs.rename(path.join(root, 'a-wide/nested'), path.join(root, 'parked'));
      const result = await withProcessingLock(() => discover(albums, () => false, path.join(root, 'a-wide/nested')));
      assert.equal(result.statistics.failed, 1);
      assert.equal((await file('a-wide/nested/shared.txt')).status, 'Active');
      // A queued missing child can get a turn before its parent confirms absence.
      // That attempt must fail safely; the parent subsequently removes the task.
      await drain([albums[0]], 1);
      assert.equal((await file('a-wide/nested/shared.txt')).status, 'Deleted');
      await fs.rename(path.join(root, 'parked'), path.join(root, 'a-wide/nested'));
      await drain(albums);
      assert.equal((await file('a-wide/nested/shared.txt')).status, 'Active');
    });
    await check('directory/file replacements retain identities and remove obsolete subtree work', async () => {
      const directory = path.join(root, 'a-wide/replaced.ext');
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, 'old.txt'), 'old');
      await drain(albums);
      const original = await file('a-wide/replaced.ext');
      await fs.rm(directory, { recursive: true });
      await fs.writeFile(directory, 'file');
      await drain([albums[0]], 1);
      const replaced = await file(original.path);
      assert.equal(replaced.id, original.id);
      assert.equal(replaced.isDirectory, false);
      assert.equal(replaced.name, 'replaced'); assert.equal(replaced.extension, 'ext');
      assert.equal((await file('a-wide/replaced.ext/old.txt')).status, 'Deleted');
      assert.equal(await prisma.discoveryDirectory.count({ where: { path: directory } }), 0);
      await fs.unlink(directory);
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, 'new.txt'), 'new');
      // An explicit nested scan may precede the outer album's next turn.
      const result = await withProcessingLock(() => discover(albums, () => false, directory));
      assert.equal(result.statistics.failed, 0);
      const restored = await file(original.path);
      assert.equal(restored.id, original.id);
      assert.equal(restored.isDirectory, true);
      assert.equal(restored.name, 'replaced.ext'); assert.equal(restored.extension, '');
      assert.equal(restored.size, null);
      assert.equal((await file('a-wide/replaced.ext/new.txt')).parentFileId, original.id);
      assert.equal(await prisma.file.count({ where: { path: original.path } }), 1);
    });
    await check('full runs reserve media time while discovery has continuous work', async () => {
      const original = fs.lstat;
      fs.lstat = async (...args) => { await new Promise(resolve => setTimeout(resolve, 70)); return original(...args); };
      try {
        const target = await file('a-wide/0002.txt');
        await prisma.file.updateMany({ where: { albums: { some: { id: { in: albumIds } } } }, data: { metadataStatus: 'NotSupported', thumbnailStatus: 'NotSupported' } });
        await prisma.file.update({ where: { id: target.id }, data: { metadataStatus: 'New' } });
        const result = await runner.run({ albumId: albumIds[0], timeoutSec: 1, workers: 1 });
        assert.ok(result.stages.discovery.deferred > 0);
        assert.ok(result.stages.metadata.attempted > 0);
        assert.equal((await file(target.path)).metadataStatus, 'NotSupported');
      } finally { fs.lstat = original; }
    });
    await check('doubling unchanged directory width keeps reconciliation operations linear', async () => {
      const counts = [];
      for (const width of [256, 512]) {
        const directory = path.join(root, `scale-${width}`);
        await fs.mkdir(directory);
        for (let offset = 0; offset < width; offset += 32)
          await Promise.all(Array.from({ length: 32 }, (_, index) => fs.writeFile(path.join(directory, `${offset + index}.txt`), 'scale')));
        const album = await prisma.album.create({ data: { name: `scale-${path.basename(root)}-${width}`, sourceType: 'File', connectionString: '', basePath: directory } });
        albumIds.push(album.id);
        await drain([album]);
        queryCount = 0;
        const started = performance.now();
        const result = await step([album]);
        assert.equal(result.statistics.deferred, 0);
        assert.equal(result.statistics.failed, 0);
        counts.push(queryCount);
        measurements.push({ scenario: `unchanged-flat-${width}`, durationMs: performance.now() - started, prismaOperations: queryCount });
      }
      assert.ok(counts[1] <= 2 * counts[0], `Nonlinear query growth: ${counts}`);
      assert.ok(counts[1] < 150, `Unchanged files should not need per-file database operations: ${counts}`);
    });
    console.log(JSON.stringify({ passed: true, checks, measurements }));
  } finally {
    if (!child) {
      const where = { albums: { some: { id: { in: albumIds } } } };
      await prisma.fileMeta.deleteMany({ where: { file: where } });
      await prisma.file.updateMany({ where, data: { parentFileId: null } });
      await prisma.file.deleteMany({ where });
      await prisma.album.deleteMany({ where: { id: { in: albumIds } } });
      await prisma.discoveryDirectory.deleteMany({ where: { path: { startsWith: root } } });
      await fs.rm(root, { recursive: true, force: true });
    }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
