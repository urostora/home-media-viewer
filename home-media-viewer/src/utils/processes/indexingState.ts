import { mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storageRoot } from '../storagePaths';
import { HmvError } from '../apiHelpers';

export class IndexingBusyError extends HmvError {
  constructor(message = 'Indexing is locked') {
    super(message, { isPublic: true, httpStatus: 409 });
  }
}

export interface IndexingState {
  startedAt?: string;
  finishedAt?: string;
  lastSuccessAt?: string;
  failures: number;
  outcome: 'running' | 'success' | 'failed' | 'interrupted';
}

export const readIndexingState = async (): Promise<IndexingState | null> => {
  try {
    return JSON.parse(await readFile(path.join(storageRoot(), 'operations', 'indexing.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

// Atomic mkdir coordinates all processes sharing the generated-storage volume.
// A crash deliberately leaves the lock in place: operators must stop all workers before removing it.
export const withIndexingLock = async <T>(run: () => Promise<T>): Promise<T> => {
  const directory = path.join(storageRoot(), 'operations');
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, 'indexing.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new IndexingBusyError('Indexing is locked');
    throw error;
  }
  const save = async (state: IndexingState): Promise<void> => {
    const temporary = path.join(directory, `indexing-${randomUUID()}.json`);
    await writeFile(temporary, JSON.stringify(state));
    await rename(temporary, path.join(directory, 'indexing.json'));
  };
  try {
    const previous = await readIndexingState();
    const state: IndexingState = {
      ...previous,
      startedAt: new Date().toISOString(),
      failures: previous?.failures ?? 0,
      outcome: 'running',
    };
    await save(state);
    try {
      const result = await run();
      state.finishedAt = new Date().toISOString();
      state.outcome = result === undefined ? 'interrupted' : 'success';
      if (state.outcome === 'success') state.lastSuccessAt = state.finishedAt;
      await save(state);
      console.log(JSON.stringify({ event: 'indexing_finished', ...state }));
      return result;
    } catch (error) {
      state.finishedAt = new Date().toISOString();
      state.outcome = 'failed';
      state.failures++;
      await save(state);
      console.error(JSON.stringify({ event: 'indexing_failed', ...state }));
      throw error;
    }
  } finally {
    await rmdir(lock);
  }
};
