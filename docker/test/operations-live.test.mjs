// Run in a disposable probe container connected to an isolated seeded app/background.
import assert from 'node:assert/strict';
const app = process.env.APP_URL;
const background = process.env.BACKGROUND_URL;
const headers = { Authorization: `Bearer ${process.env.PROCESS_TOKEN}` };
for (const base of [app, background]) {
  for (const path of ['/api/health/live', '/api/health/ready']) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, `${base}${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(new URL('/api/me', base))).status, 403);
}
assert.equal((await fetch(new URL('/api/process/updateMetadata?force=1', app), { headers })).status, 400);
assert.equal((await fetch(new URL(`/api/process/updateMetadata?token=${encodeURIComponent(process.env.PROCESS_TOKEN)}`, background))).status, 403);
assert.equal((await fetch(new URL('/api/process/updateMetadata', background))).status, 403);
const status = await fetch(new URL('/api/process/lastProcessStatistics', background), { headers });
assert.equal(status.status, 200);
const state = await status.json();
assert.ok(state.indexing.lastSuccessAt);
assert.equal(state.indexing.outcome, 'success');
console.log('Live health/middleware, web role isolation, header authentication and durable indexing state passed');
