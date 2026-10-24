import { setTimeout } from 'node:timers/promises';

const token = process.env.PROCESS_TOKEN;
if (!token) throw new Error('PROCESS_TOKEN is required');

const endpoint = new URL('/api/process/updateMetadata', process.env.BACKGROUND_URL);
endpoint.searchParams.set('token', token);

const intervalMs = 180_000;
const timeoutMs = (Number(process.env.LONG_PROCESS_TIMEOUT_SEC ?? 120) + 60) * 1000;
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error('LONG_PROCESS_TIMEOUT_SEC must define a positive request timeout');
}

const shutdown = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => shutdown.abort());
}

// Wait between runs so startup/migrations have time to finish. Requests are serial.
while (!shutdown.signal.aborted) {
  try {
    await setTimeout(intervalMs, undefined, { signal: shutdown.signal });
    const response = await fetch(endpoint, {
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(timeoutMs)]),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log('Background indexing completed');
  } catch (error) {
    if (shutdown.signal.aborted) break;
    // Do not log request URLs or errors that could contain the process token.
    console.error('Background indexing failed; retrying next interval',
      error.message?.startsWith('HTTP ') ? error.message : error.name);
  }
}
