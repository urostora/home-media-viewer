// Separate process: blocked indexing event loops cannot delay probe dispatch.
const { performance } = require('node:perf_hooks');
const results = {};
let stopping = false;
process.on('message', (message) => { if (message === 'stop') stopping = true; });
const targets = {
  workerLive: 'http://127.0.0.1:3100/api/health/live',
  workerReady: 'http://127.0.0.1:3100/api/health/ready',
  foregroundReady: 'http://app:3000/api/health/ready',
  foregroundApi: 'http://app:3000/api/album/search',
};
let cookie = '';
async function probe(name, url) {
  const start = performance.now();
  let status = 0;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000),
      method: name === 'foregroundApi' ? 'POST' : 'GET',
      body: name === 'foregroundApi' ? '{}' : undefined,
      headers: { 'Content-Type': 'application/json', Cookie: cookie } });
    await response.arrayBuffer();
    status = response.status;
  } catch {}
  (results[name] ??= []).push({ ms: performance.now() - start, status });
}
async function main() {
  const response = await fetch('http://app:3000/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  const login = await response.json();
  cookie = response.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  if (!response.ok || !login.ok || !cookie) throw new Error('Probe login failed');
  process.send('ready');
  while (!stopping) {
    await Promise.all(Object.entries(targets).map(([name, url]) => probe(name, url)));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  process.send(results);
  process.disconnect();
}
main().catch(() => process.exit(1));
