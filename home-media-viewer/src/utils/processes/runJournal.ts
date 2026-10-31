import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storageRoot } from '../storagePaths';
import {
  emptyStageStatistics,
  type ProcessingOptions,
  type ProcessingStage,
  type StageStatistics,
} from '@/types/processingTypes';
import type { MetadataProcessStatistics } from './updateMetadataProcess';

export type RunReason =
  | 'drained'
  | 'deadline'
  | 'shutdown'
  | 'stage_failure'
  | 'infrastructure'
  | 'invalid_scope'
  | 'retry_required'
  | 'unfinished'
  | 'abandoned';
export interface StageRunSummary {
  counts: StageStatistics;
  inFlight: number;
  unresolved: number;
  retryable: number;
  selectedBefore: number | null;
  pendingBefore: number | null;
  pendingAfter: number | null;
  remaining: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  processingMs: number;
  reason: RunReason | null;
}
export interface ProcessingRun {
  version: 1;
  id: string;
  scope: { kind: 'library' | 'album' | 'file'; id?: string };
  mode: 'pending' | 'refresh';
  timeoutSec: number;
  workers: number;
  startedAt: string;
  checkpointAt: string;
  finishedAt: string | null;
  durationMs: number;
  outcome: 'running' | 'success' | 'partial' | 'failed' | 'interrupted';
  reason: RunReason | null;
  stages: Partial<Record<ProcessingStage, StageRunSummary>>;
  statistics?: MetadataProcessStatistics;
}
const directory = (): string => path.join(storageRoot(), 'operations', 'runs');
const validId = (id: string): boolean => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
const atomic = async (name: string, value: unknown): Promise<void> => {
  const temporary = path.join(directory(), `.write-${randomUUID()}`);
  try {
    await writeFile(temporary, JSON.stringify(value));
    await rename(temporary, path.join(directory(), name));
  } finally {
    await rm(temporary, { force: true });
  }
};
export const readProcessingRun = async (id?: string): Promise<ProcessingRun | null> => {
  try {
    const selected =
      id ?? (JSON.parse(await readFile(path.join(directory(), 'latest.json'), 'utf8')) as { id: string }).id;
    if (!validId(selected)) throw new Error('Invalid processing run ID');
    const value = JSON.parse(await readFile(path.join(directory(), `${selected}.json`), 'utf8')) as ProcessingRun;
    if (value.statistics !== undefined) value.statistics.lastProcessedOn = new Date(value.statistics.lastProcessedOn);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

// Call only after acquiring the shared writer lock. Readers never expire locks or
// classify another potentially live writer as dead based on timestamps/PIDs.
export const createRunJournal = async (
  options: ProcessingOptions & { stages: ProcessingStage[]; mode: 'pending' | 'refresh' },
  workers: number,
  timeoutSec: number,
) => {
  await mkdir(directory(), { recursive: true });
  for (const name of await readdir(directory())) {
    if (name.startsWith('.write-') && validId(name.slice(7))) await rm(path.join(directory(), name));
  }
  const previous = await readProcessingRun();
  if (previous?.outcome === 'running') {
    previous.outcome = 'interrupted';
    previous.reason = 'abandoned';
    for (const stage of Object.values(previous.stages)) {
      stage.unresolved += stage.inFlight;
      stage.inFlight = 0;
      stage.reason = stage.remaining === 0 ? 'drained' : 'abandoned';
    }
    // No finish time or fabricated outcomes: a crash can fall between DB publication
    // and the next journal checkpoint. The last confirmed counts remain authoritative.
    await atomic(`${previous.id}.json`, previous);
  }
  const now = new Date().toISOString();
  const record: ProcessingRun = {
    version: 1,
    id: randomUUID(),
    scope: options.fileId
      ? { kind: 'file', id: options.fileId }
      : options.albumId
        ? { kind: 'album', id: options.albumId }
        : { kind: 'library' },
    mode: options.mode,
    timeoutSec,
    workers,
    startedAt: now,
    checkpointAt: now,
    finishedAt: null,
    durationMs: 0,
    outcome: 'running',
    reason: null,
    stages: Object.fromEntries(
      options.stages.map((stage) => [
        stage,
        {
          counts: emptyStageStatistics(),
          inFlight: 0,
          unresolved: 0,
          retryable: 0,
          selectedBefore: null,
          pendingBefore: null,
          pendingAfter: null,
          remaining: null,
          startedAt: null,
          finishedAt: null,
          durationMs: 0,
          processingMs: 0,
          reason: null,
        },
      ]),
    ),
  };
  let turn: Promise<unknown> = Promise.resolve();
  const change = async (edit: (value: ProcessingRun) => void): Promise<void> => {
    const operation = turn.then(async () => {
      edit(record);
      record.checkpointAt = new Date().toISOString();
      record.durationMs = Math.max(0, Date.now() - Date.parse(record.startedAt));
      await atomic(`${record.id}.json`, record);
    });
    turn = operation.catch(() => undefined);
    await operation;
  };
  await change(() => {});
  await atomic('latest.json', { id: record.id });
  // Bound history by count. The writer lock makes retention and latest-pointer updates serial.
  const names = (await readdir(directory())).filter(
    (name) => validId(name.replace(/\.json$/, '')) && name.endsWith('.json'),
  );
  const history = await Promise.all(
    names
      .filter((name) => name !== `${record.id}.json`)
      .map(async (name) => ({ name, run: await readProcessingRun(name.slice(0, -5)) })),
  );
  history.sort((a, b) => (b.run?.startedAt ?? '').localeCompare(a.run?.startedAt ?? ''));
  await Promise.all(history.slice(99).map(({ name }) => rm(path.join(directory(), name))));
  return { record, change };
};
export type RunJournal = Awaited<ReturnType<typeof createRunJournal>>;
