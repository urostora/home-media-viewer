import os from 'node:os';

export const getWorkerCount = (requested = Number(process.env.MEDIA_WORKERS ?? 2)): number =>
  Math.max(1, Math.min(4, os.availableParallelism(), Number.isFinite(requested) ? Math.floor(requested) : 1));

export const getProcessTimeout = (): number => {
  const seconds = Number(process.env.LONG_PROCESS_TIMEOUT_SEC ?? 120);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
    throw new Error('LONG_PROCESS_TIMEOUT_SEC must be between 1 and 600');
  }
  return seconds;
};
