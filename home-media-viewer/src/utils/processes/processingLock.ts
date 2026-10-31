import { AsyncLocalStorage } from 'node:async_hooks';
import { withIndexingLock, IndexingBusyError, type IndexingState } from './indexingState';
import { isShuttingDownHandler } from '../isShuttingDown';

const ownership = new AsyncLocalStorage<{
  active: boolean;
  runActive?: boolean;
  completion?: { outcome: IndexingState['outcome']; runId: string };
}>();
export const setProcessingOutcome = (outcome: IndexingState['outcome'], runId: string): void => {
  const owner = ownership.getStore();
  if (owner?.active !== true) throw new Error('Processing outcome requires the writer lock');
  owner.completion = { outcome, runId };
};

// A nested helper may reuse the writer lock, but two run journals must not
// classify each other's active records as abandoned under that same ownership.
export const withProcessingRun = async <T>(run: () => Promise<T>): Promise<T> => {
  const owner = ownership.getStore();
  if (owner?.active !== true) throw new Error('Processing run requires the writer lock');
  if (owner.runActive) throw new IndexingBusyError();
  owner.runActive = true;
  try {
    return await run();
  } finally {
    owner.runActive = false;
  }
};

// Nested helpers may share a job's lock; unrelated requests and other processes must acquire it.
export const withProcessingLock = async <T>(run: () => Promise<T>): Promise<T> => {
  if (ownership.getStore()?.active === true) return await run();
  let value!: T;
  const owner: NonNullable<ReturnType<typeof ownership.getStore>> = { active: true };
  await withIndexingLock(
    async () => {
      try {
        value = await ownership.run(owner, run);
        return isShuttingDownHandler.isShuttingDown() ? undefined : true;
      } finally {
        owner.active = false;
      }
    },
    () => owner.completion,
  );
  return value;
};
