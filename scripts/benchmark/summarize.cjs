// Read results.json on stdin; audit measurement accounting and print a compact report.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const records = JSON.parse(fs.readFileSync(0, 'utf8'));
assert(records.length > 0, 'No benchmark records');
const groups = Object.groupBy(records, (record) => record.scenario);
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
for (const record of records) {
  assert.equal(record.failure, null);
  assert.equal(record.limits.nodeEnv, 'production');
  for (const jobs of Object.values(record.metrics.jobs)) {
    assert.equal(jobs.attempted, jobs.succeeded + jobs.failed);
    assert.equal(jobs.failed, 0);
  }
  assert.equal(record.after.metadata.Error, 0);
  assert.equal(record.deferredMetadataCount, record.after.metadata.New);
  assert.equal(record.throughputMediaPerSec, record.metrics.jobs.media.succeeded / (record.elapsedMs / 1000));
  for (const latency of Object.values(record.latency)) {
    assert(latency.ms.samples > 0);
    assert.equal(latency.failures, 0);
    assert.deepEqual(latency.statuses, [200]);
  }
  if (record.runnerStatistics) {
    assert.equal(record.runnerStatistics.isDeveloperEnvironment, false);
    assert.equal(record.runnerStatistics.processedFileCount, record.metrics.jobs.media.attempted);
    assert.equal(record.runnerStatistics.processedDirectoryCount, record.metrics.jobs.directories.attempted);
  }
  if (record.mode === 'metadata') {
    assert.equal(record.metrics.ffmpeg + record.metrics.imageDecodes, 0);
    assert.equal(record.metrics.thumbnailPublishes, 0);
    assert.deepEqual(record.after.thumbnail, record.before.thumbnail);
  }
  if (record.mode === 'thumbnails') {
    assert.equal(record.metrics.ffprobe, 0);
    assert.deepEqual(record.after.metadata, record.before.metadata);
  }
  if (record.mode === 'discovery') {
    assert.equal(record.metrics.jobs.media.attempted, 0);
    assert.equal(record.metrics.imageDecodes + record.metrics.ffmpeg + record.metrics.ffprobe, 0);
    assert.equal(record.metrics.thumbnailPublishes, 0);
  }
}
console.log(`Audited ${records.length} successful runs. Timings and SQL counts are medians; RSS is the largest lifetime peak per scenario.\n`);
console.log('| Scenario | Runs | Wall ms | CPU ms | SQL statements | SQL ms | Media jobs/s | Peak RSS MiB |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [name, runs] of Object.entries(groups)) {
  const med = (get) => median(runs.map(get)).toFixed(1);
  console.log(`| ${name} | ${runs.length} | ${med(r => r.elapsedMs)} | ${med(r => r.cgroupCpuMs)} | ${med(r => r.metrics.sqlCount)} | ${med(r => r.metrics.sqlMs)} | ${med(r => r.throughputMediaPerSec)} | ${(Math.max(...runs.map(r => r.lifetimePeakRssBytes)) / 1024 ** 2).toFixed(1)} |`);
}
console.log('\nMedian of each run’s p95 latency, with the smallest sample count among runs. Short-run p95 values have limited meaning.\n');
console.log('| Scenario | Indexing liveness p95 ms | Foreground album API p95 ms | Minimum samples per endpoint/run |');
console.log('| --- | ---: | ---: | ---: |');
for (const [name, runs] of Object.entries(groups)) {
  console.log(`| ${name} | ${median(runs.map(r => r.latency.workerLive.ms.p95)).toFixed(1)} | ${median(runs.map(r => r.latency.foregroundApi.ms.p95)).toFixed(1)} | ${Math.min(...runs.flatMap(r => Object.values(r.latency).map(l => l.ms.samples)))} |`);
}
