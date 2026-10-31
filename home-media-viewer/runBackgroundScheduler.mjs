import { setTimeout } from 'node:timers/promises';

export function schedulerConfig(env) {
  const seconds = (name, fallback, maximum = 86400, integer = true) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < 1 || value > maximum) throw new Error(`${name} must be between 1 and ${maximum} seconds`);
    return value;
  };
  const interval = seconds('BACKGROUND_INTERVAL_SEC', 180);
  const catchup = seconds('BACKGROUND_CATCHUP_INTERVAL_SEC', Math.min(30, interval), interval);
  const maximumBackoff = seconds('BACKGROUND_MAX_BACKOFF_SEC', Math.max(900, interval));
  if (maximumBackoff < interval) throw new Error('BACKGROUND_MAX_BACKOFF_SEC must be at least BACKGROUND_INTERVAL_SEC');
  const budget = seconds('LONG_PROCESS_TIMEOUT_SEC', 120, 600, false);
  return { interval, catchup, maximumBackoff, requestTimeoutMs: Math.ceil((budget + 120) * 1000) };
}
const token = process.env.PROCESS_TOKEN;
if (!token) throw new Error('PROCESS_TOKEN is required');
const config = schedulerConfig(process.env);
let endpoint;
try {
  const base = new URL(process.env.BACKGROUND_URL);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
  endpoint = new URL('/api/process/updateMetadata', base);
} catch { throw new Error('BACKGROUND_URL must be an HTTP(S) service URL without credentials or query parameters'); }

const shutdown = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown.abort());

function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error('Request interrupted'));
    if (signal.aborted) { Promise.resolve(operation).catch(() => {}); stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
async function resultBody(response, signal) {
  if (!response.body) throw new Error('Missing response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    for (;;) {
      const part = await abortable(reader.read(), signal);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 65536) throw new Error('Response too large');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    try { await abortable(reader.cancel(), signal); } catch { /* The request is already aborted. */ }
    reader.releaseLock();
  }
}
let delay = config.interval, failures = 0;
// Delay after each completed request: neither slow requests nor catch-up overlap.
while (!shutdown.signal.aborted) {
  let failure = 'request_error';
  let requestSignal;
  try {
    await setTimeout(delay * 1000, undefined, { signal: shutdown.signal });
    if (shutdown.signal.aborted) break;
    requestSignal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(config.requestTimeoutMs)]);
    const signal = requestSignal;
    const response = await abortable(fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal }), signal);
    if (!response.ok) {
      await abortable(response.body?.cancel(), signal);
      if (response.status === 409) {
        failures = 0; delay = config.interval;
        console.error(JSON.stringify({ event: 'scheduler_locked', delaySec: delay }));
        continue;
      }
      failure = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? `http_${response.status}` : 'invalid_status';
      throw new Error();
    }
    failure = 'invalid_response';
    const body = await resultBody(response, signal);
    const statistics = body?.data;
    if (!['success', 'partial', 'interrupted'].includes(statistics?.outcome)) throw new Error();
    const backlog = Object.values(statistics.stages ?? {}).some(stage => Number.isFinite(stage?.deferred) && stage.deferred > 0);
    delay = statistics.outcome === 'partial' && statistics.reason === 'deadline' && backlog ? config.catchup : config.interval;
    failures = 0;
    console.log(JSON.stringify({ event: 'scheduler_completed', outcome: statistics.outcome, delaySec: delay }));
  } catch {
    if (shutdown.signal.aborted) break;
    if (requestSignal?.aborted) failure = 'request_timeout';
    failures++;
    delay = Math.min(config.maximumBackoff, config.interval * 2 ** Math.min(failures - 1, 20));
    // Log only fixed codes and numbers; never emit response bodies, URLs, or exception text.
    console.error(JSON.stringify({ event: 'scheduler_failed', reason: failure, failures, delaySec: delay }));
  }
}
