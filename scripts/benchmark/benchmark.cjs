// Harness-only instrumentation. Production application modules are loaded unchanged.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const appRequire = createRequire('/home/node/app/package.json');
const metrics = { sqlCount: 0, sqlMs: 0, ffmpeg: 0, ffprobe: 0, mediaMs: 0, imageDecodes: 0,
  thumbnailPublishes: 0, maxObservedPendingCreatedAgeMs: null,
  jobs: { media: { attempted: 0, succeeded: 0, failed: 0 }, directories: { attempted: 0, succeeded: 0, failed: 0 } } };
let measuring = false;
const childProcess = require('node:child_process');
const originalExecFile = childProcess.execFile;
childProcess.execFile = function (executable, args, options, callback) {
  const name = path.basename(executable);
  if (!measuring || !['ffmpeg', 'ffprobe'].includes(name)) return originalExecFile.apply(this, arguments);
  metrics[name]++;
  const started = performance.now();
  return originalExecFile.call(this, executable, args, options, (...result) => {
    metrics.mediaMs += performance.now() - started;
    callback(...result);
  });
};
const Jimp = appRequire('jimp');
const originalRead = Jimp.read;
Jimp.read = function (...args) {
  if (measuring) metrics.imageDecodes++;
  return originalRead.apply(this, args);
};
const prismaModule = appRequire('@prisma/client');
const OriginalClient = prismaModule.PrismaClient;
appRequire.cache[appRequire.resolve('@prisma/client')].exports = {
  ...prismaModule,
  PrismaClient: class extends OriginalClient {
    constructor(options) {
      super({ ...options, log: [{ emit: 'event', level: 'query' }] });
      this.$on('query', (event) => {
        if (measuring) { metrics.sqlCount++; metrics.sqlMs += event.duration; }
      });
      this.$use(async (params, next) => {
        const result = await next(params);
        if (measuring && params.model === 'File') {
          if (params.action === 'update' && params.args.data.thumbnailProcessedAt) metrics.thumbnailPublishes++;
          if (params.action === 'findMany' && Array.isArray(result)) {
            for (const file of result) if (!file.isDirectory && file.metadataStatus === 'New' && file.createdAt) {
              metrics.maxObservedPendingCreatedAgeMs = Math.max(metrics.maxObservedPendingCreatedAgeMs ?? 0,
                Date.now() - +file.createdAt);
            }
          }
        }
        return result;
      });
    }
  },
};
appRequire('ts-node').register({ transpileOnly: true, project: '/home/node/app/tsconfig.json' });
appRequire('tsconfig-paths/register');
const prisma = appRequire('./src/utils/prisma/prismaImporter').default;
const runner = appRequire('./src/utils/processes/updateMetadataProcess').default;
const { syncAlbumFiles } = appRequire('./src/utils/albumHelper');
const fileHelper = appRequire('./src/utils/fileHelper');
const fileStages = appRequire('./src/utils/processes/fileStages');
const directoryProcessor = appRequire('./src/utils/fileProcessor/directory');
const mediaResults = new Map();
const originalProcessStage = fileStages.processFileStage;
fileStages.processFileStage = async (file, stage) => {
  const result = await originalProcessStage(file, stage);
  if (measuring) {
    if (!mediaResults.has(file.id)) mediaResults.set(file.id, []);
    mediaResults.get(file.id).push(result);
  }
  return result;
};
const originalDirectoryProcessor = directoryProcessor.directoryFileProcessor;
directoryProcessor.directoryFileProcessor = async (file) => {
  if (!measuring) return originalDirectoryProcessor(file);
  metrics.jobs.directories.attempted++;
  try {
    const ok = await originalDirectoryProcessor(file);
    metrics.jobs.directories[ok ? 'succeeded' : 'failed']++;
    return ok;
  } catch (error) { metrics.jobs.directories.failed++; throw error; }
};
const { loadMetadata } = fileHelper;
const { withProcessingLock } = appRequire('./src/utils/processes/processingLock');
const live = appRequire('./src/pages/api/health/live').default;
const ready = appRequire('./src/pages/api/health/ready').default;
// Avoid exposing fixture paths and media metadata in benchmark logs.
console.log = () => {};
console.error = () => {};

function cgroup(name) {
  try { return fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim(); } catch { return null; }
}
function cpuUs() {
  return Number(cgroup('cpu.stat')?.match(/^usage_usec (\d+)$/m)?.[1] ?? NaN);
}
async function snapshot() {
  const files = await prisma.file.findMany({ select: {
    id: true, isDirectory: true, metadataStatus: true, thumbnailStatus: true, createdAt: true,
  } });
  const media = files.filter((file) => !file.isDirectory);
  const pending = media.filter((file) => file.metadataStatus === 'New');
  const counts = (key) => Object.fromEntries(['New', 'Processed', 'Error', 'NotSupported']
    .map((status) => [status, media.filter((file) => file[key] === status).length]));
  return { files: files.length, directories: files.length - media.length, media: media.length,
    metadata: counts('metadataStatus'), thumbnail: counts('thumbnailStatus'),
    oldestPendingCreatedAgeMs: pending.length ? Date.now() - Math.min(...pending.map((file) => +file.createdAt)) : null };
}
function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return { samples: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? null,
    p95: sorted[Math.ceil((sorted.length - 1) * 0.95)] ?? null, max: sorted.at(-1) ?? null };
}
async function main() {
  if (process.env.NODE_ENV !== 'production' || new URL(process.env.DATABASE_URL).hostname !== 'db' ||
      new URL(process.env.DATABASE_URL).pathname !== '/benchmark' || process.env.APP_ALBUM_ROOT_PATH !== '/fixtures') {
    throw new Error('Refusing non-benchmark environment');
  }
  await prisma.$connect();
  const mode = process.argv[2];
  if (mode === 'prepare') {
    // Only task-owned records in the isolated database are removed; the seeded admin remains.
    await prisma.fileMeta.deleteMany();
    await prisma.album.deleteMany();
    await prisma.file.updateMany({ data: { parentFileId: null } });
    await prisma.file.deleteMany();
    for (const [index, suffix] of ['', '/mixed', '/deep/level'].entries()) {
      await prisma.album.create({ data: { name: `benchmark-${index}`, sourceType: 'File',
        connectionString: '', basePath: `/fixtures${suffix}` } });
    }
    process.stdout.write(JSON.stringify({ prepared: true }) + '\n');
    return;
  }
  if (!['full', 'discovery', 'metadata', 'thumbnails'].includes(mode)) throw new Error('Unknown benchmark mode');
  const before = await snapshot();
  const server = http.createServer((req, res) => {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => res.end(JSON.stringify(data));
    const handler = req.url === '/api/health/ready' ? ready : live;
    Promise.resolve(handler(req, res)).catch(() => { res.statusCode = 500; res.end(); });
  }).listen(3100, '127.0.0.1');
  await once(server, 'listening');
  // Warm readiness outside the measurement and establish the external sampler's session.
  for (const url of ['http://127.0.0.1:3100/api/health/ready', 'http://app:3000/api/health/ready']) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Benchmark readiness failed');
    await response.arrayBuffer();
  }
  const probe = childProcess.fork('/benchmark/probe.cjs', [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const first = await Promise.race([once(probe, 'message'), once(probe, 'exit').then(() => { throw new Error('Probe failed'); })]);
  if (first[0] !== 'ready') throw new Error('Probe not ready');
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  let peakRssBytes = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 20);
  const cpuBefore = cpuUs();
  const processCpuBefore = process.cpuUsage();
  const start = performance.now();
  let runnerStatistics;
  let failure = null;
  measuring = true;
  try {
    if (mode === 'full') runnerStatistics = await runner.update(600, 2);
    else if (mode !== 'discovery') runnerStatistics = await runner.run({ stages: [mode], timeoutSec: 600, workers: 2 });
    else await withProcessingLock(async () => {
      const albums = await prisma.album.findMany({ orderBy: { basePath: 'asc' } });
      for (const album of albums) await syncAlbumFiles(album.id);
      // Existing directories need explicit reconciliation too; de-duplicate overlapping albums.
      const directories = await prisma.file.findMany({ where: { isDirectory: true, status: 'Active' } });
      for (const directory of directories) if (!await loadMetadata(directory)) throw new Error('Discovery failed');
      return true;
    });
  } catch { failure = 'Indexing failed; inspect aggregate statuses'; }
  const elapsedMs = performance.now() - start;
  for (const outcomes of mediaResults.values()) {
    metrics.jobs.media.attempted++;
    metrics.jobs.media[outcomes.some((result) => result === 'failed' || result === 'deferred') ? 'failed' : 'succeeded']++;
  }
  const cpuAfter = cpuUs();
  const processCpu = process.cpuUsage(processCpuBefore);
  await new Promise(setImmediate);
  measuring = false;
  clearInterval(sampler);
  delay.disable();
  const response = once(probe, 'message');
  probe.send('stop');
  const [probes] = await response;
  await once(probe, 'exit');
  const latency = Object.fromEntries(Object.entries(probes).map(([name, values]) => [name, {
    ms: distribution(values.map((value) => value.ms)),
    failures: values.filter((value) => value.status !== 200).length,
    statuses: [...new Set(values.map((value) => value.status))],
  }]));
  await new Promise((resolve) => server.close(resolve));
  const after = await snapshot();
  const record = { mode, failure, elapsedMs, metrics, before, after, runnerStatistics,
    cgroupCpuMs: Number.isFinite(cpuAfter - cpuBefore) ? (cpuAfter - cpuBefore) / 1000 : null,
    processCpuMs: (processCpu.user + processCpu.system) / 1000,
    sampledPeakRssBytes: Math.max(peakRssBytes, process.memoryUsage().rss),
    lifetimePeakRssBytes: process.resourceUsage().maxRSS * 1024,
    cgroupMemoryPeakBytes: Number(cgroup('memory.peak')) || null,
    eventLoopDelayMs: { p50: delay.percentile(50) / 1e6, p95: delay.percentile(95) / 1e6, max: delay.max / 1e6 },
    latency, limits: { cpu: cgroup('cpu.max'), memoryBytes: cgroup('memory.max'), poolPerProcess: 5,
      workers: 2, node: process.version, nodeEnv: process.env.NODE_ENV },
    deferredMetadataCount: after.metadata.New,
    throughputMediaPerSec: metrics.jobs.media.succeeded / (elapsedMs / 1000) };
  process.stdout.write(JSON.stringify(record) + '\n');
  if (failure || Object.values(latency).some((value) => value.failures)) process.exitCode = 1;
}
main().catch(() => { process.stderr.write('Benchmark failed\n'); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); if (process.exitCode) process.exit(process.exitCode); });
