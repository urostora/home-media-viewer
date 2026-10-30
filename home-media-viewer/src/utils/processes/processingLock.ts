import { AsyncLocalStorage } from 'node:async_hooks';
import { withIndexingLock } from './indexingState';
import { isShuttingDownHandler } from '../isShuttingDown';

const ownership = new AsyncLocalStorage<{ active: boolean }>();

// Nested helpers may share a job's lock; unrelated requests and other processes must acquire it.
export const withProcessingLock = async <T>(run: () => Promise<T>): Promise<T> => {
  if (ownership.getStore()?.active === true) return await run();
  let value!: T;
  await withIndexingLock(async () => {
    const owner = { active: true };
    try {
      value = await ownership.run(owner, run);
      return isShuttingDownHandler.isShuttingDown() ? undefined : true;
    } finally {
      owner.active = false;
    }
  });
  return value;
};
