import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const source = readFileSync(new URL('../../home-media-viewer/runBackgroundScheduler.mjs', import.meta.url), 'utf8');
async function check({ token = 'test-secret', timeout = '120', statuses = [503, 200], stopWhileWaiting = false } = {}) {
  const signals = {};
  const logs = [];
  let calls = 0;
  let waits = 0;
  let cancelled = 0;
  const module = new SourceTextModule(source, {
    context: createContext({
      URL, AbortController, AbortSignal, Number, Error,
      process: {
        env: { PROCESS_TOKEN: token, BACKGROUND_URL: 'http://background:3000', LONG_PROCESS_TIMEOUT_SEC: timeout },
        once: (name, fn) => { signals[name] = fn; },
      },
      console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
      fetch: async (url, options) => {
        assert.equal(url.hostname, 'background');
        assert.equal(url.search, '');
        assert.equal(options.headers.Authorization, `Bearer ${token}`);
        assert.ok(options.signal);
        const status = statuses[calls++];
        if (calls === statuses.length) signals.SIGTERM();
        if (status instanceof Error) throw status;
        return { ok: status === 200, status, body: { cancel: async () => { cancelled++; } } };
      },
    }),
  });
  await module.link(() => new SyntheticModule(['setTimeout'], function () {
    this.setExport('setTimeout', async (ms, _, options) => {
      assert.equal(ms, 180000);
      assert.equal(options.signal.aborted, false);
      waits++;
      if (stopWhileWaiting) {
        signals.SIGTERM();
        throw new Error('aborted');
      }
    });
  }, { context: module.context }));
  await module.evaluate();
  if (stopWhileWaiting) {
    assert.equal(calls, 0);
    assert.equal(logs.length, 0);
    return;
  }
  assert.equal(calls, 2);
  assert.equal(waits, 2);
  assert.equal(cancelled, statuses.filter(status => !(status instanceof Error)).length);
  assert.ok(logs.some(line => line.includes('failed')));
  assert.ok(logs.some(line => line.includes('completed')));
  assert.ok(logs.every(line => !line.includes(token)));
}
await check();
await check({ statuses: [new Error('test-secret must not appear in logs'), 200] });
await check({ stopWhileWaiting: true });
await assert.rejects(check({ token: '' }), /PROCESS_TOKEN is required/);
await assert.rejects(check({ timeout: 'invalid' }), /positive request timeout/);
console.log('Scheduler checks passed: retries, success, shutdown, configuration, and secret-safe logging');
