import type { Prisma } from '@prisma/client';
import {
  validateProcessingOptions,
  ProcessingOptionsError,
  type ProcessingOptions,
  type ProcessingStage,
  type StageStatistics,
} from '@/types/processingTypes';
import { discover } from './discovery';
import prisma from '@/utils/prisma/prismaImporter';
import { isShuttingDownHandler } from '../isShuttingDown';
import { getWorkerCount } from './processConfig';
import { withProcessingLock, withProcessingRun, setProcessingOutcome } from './processingLock';
import { createRunJournal, type RunReason } from './runJournal';
import { mediaProgress, discoveryProgress } from './runProgress';
import { mediaQueueCursorKey, processMediaQueue } from './mediaQueue';

const isDevEnv = process.env.NODE_ENV !== 'production';

export interface MetadataProcessStatistics {
  isDeveloperEnvironment: boolean;
  threadCount: number;
  processTimeoutInSec: number;
  lastProcessedOn: Date;
  processedAlbumCount: number;
  processedDirectoryCount: number;
  processedFileCount: number;
  directorySyncTimeInMs: number;
  fullProcessingTimeSec: number;
  stages: Partial<Record<ProcessingStage, StageStatistics>>;
  outcome: 'success' | 'partial' | 'failed' | 'interrupted';
  runId?: string;
  reason?: RunReason;
  durationMs?: number;
}

export const lastStatistics = (() => {
  let value: MetadataProcessStatistics | undefined;
  return {
    getLastStatistics: () => value,
    setLastStatistics: (next: MetadataProcessStatistics): void => {
      value = next;
    },
  };
})();

export class ProcessingFailedError extends Error {
  constructor(public statistics: MetadataProcessStatistics) {
    super('One or more processing stages failed');
  }
}

const run = async (input: ProcessingOptions = {}): Promise<MetadataProcessStatistics> => {
  const options = validateProcessingOptions(input);
  return await withProcessingLock(
    async () =>
      await withProcessingRun(async () => {
        const timeout = options.timeoutSec ?? 50;
        const workers = isDevEnv ? 1 : getWorkerCount(options.workers ?? 2);
        const journal = await createRunJournal(options, workers, timeout);
        const started = Date.parse(journal.record.startedAt);
        let directories = 0;
        let processedFiles = 0;
        let albumsCount = 0;
        let discoveryMs = 0;
        const discoveryDeadline = started + timeout * 1000 * (options.stages.length > 1 ? 0.5 : 1);
        const deadline = (): boolean => Date.now() >= started + timeout * 1000;
        const stopped = (): boolean => deadline() || isShuttingDownHandler.isShuttingDown();
        const complete = async (error?: unknown, infrastructureFailure = false): Promise<MetadataProcessStatistics> => {
          const shuttingDown = isShuttingDownHandler.isShuttingDown();
          const summaries = Object.entries(journal.record.stages);
          const failed = summaries.some(([, value]) => value.counts.failed > 0);
          const pending = summaries.some(([, value]) => value.remaining === null || value.remaining > 0);
          const timedOut = summaries.some(
            ([stage, value]) =>
              (value.remaining ?? 0) > 0 && (stage === 'discovery' ? Date.now() >= discoveryDeadline : deadline()),
          );
          const reason: RunReason = infrastructureFailure
            ? error instanceof ProcessingOptionsError
              ? 'invalid_scope'
              : 'infrastructure'
            : failed
              ? 'stage_failure'
              : shuttingDown
                ? 'shutdown'
                : pending
                  ? timedOut
                    ? 'deadline'
                    : summaries.some(([, value]) => value.retryable > 0)
                      ? 'retry_required'
                      : 'unfinished'
                  : 'drained';
          const outcome =
            infrastructureFailure || failed ? 'failed' : shuttingDown ? 'interrupted' : pending ? 'partial' : 'success';
          const result: MetadataProcessStatistics = {
            isDeveloperEnvironment: isDevEnv,
            threadCount: workers,
            processTimeoutInSec: timeout,
            lastProcessedOn: new Date(),
            processedAlbumCount: albumsCount,
            processedDirectoryCount: directories,
            processedFileCount: processedFiles,
            directorySyncTimeInMs: options.stages.includes('discovery') ? discoveryMs : 0,
            fullProcessingTimeSec: Math.floor((Date.now() - started) / 1000),
            stages: Object.fromEntries(summaries.map(([stage, value]) => [stage, { ...value.counts }])),
            outcome,
            reason,
            runId: journal.record.id,
            durationMs: Math.max(0, Date.now() - started),
          };
          setProcessingOutcome(outcome, journal.record.id);
          await journal.change((run) => {
            run.outcome = outcome;
            run.reason = reason;
            run.finishedAt = new Date().toISOString();
            run.statistics = result;
            for (const [stage, value] of Object.entries(run.stages)) {
              value.unresolved += value.inFlight;
              value.inFlight = 0;
              value.reason =
                value.counts.failed > 0
                  ? 'stage_failure'
                  : value.remaining === null
                    ? reason
                    : value.remaining === 0
                      ? 'drained'
                      : shuttingDown
                        ? 'shutdown'
                        : (stage === 'discovery' ? Date.now() >= discoveryDeadline : deadline())
                          ? 'deadline'
                          : value.retryable > 0
                            ? 'retry_required'
                            : 'unfinished';
            }
          });
          lastStatistics.setLastStatistics(result);
          console.log(
            JSON.stringify({
              event: 'processing_run_finished',
              runId: result.runId,
              outcome,
              reason,
              durationMs: result.durationMs,
            }),
          );
          return result;
        };
        try {
          const albums =
            options.fileId !== undefined
              ? []
              : await prisma.album.findMany({
                  where: { id: options.albumId, status: { in: ['Active', 'Disabled'] } },
                  orderBy: { basePath: 'asc' },
                });
          albumsCount = albums.length;
          if (options.albumId !== undefined && albums.length === 0) throw new ProcessingOptionsError('Album not found');
          if (options.fileId !== undefined) {
            const file = await prisma.file.findFirst({
              where: { id: options.fileId, status: { in: ['Active', 'Disabled'] } },
            });
            if (file === null || file.isDirectory) throw new ProcessingOptionsError('Media file not found');
          }
          const scope: Prisma.FileWhereInput =
            options.fileId !== undefined
              ? { id: options.fileId, status: { in: ['Active', 'Disabled'] } }
              : { status: 'Active', albums: { some: { id: { in: albums.map((album) => album.id) } } } };
          if (options.stages.includes('discovery')) {
            await discover(
              albums,
              () => stopped() || Date.now() >= discoveryDeadline,
              undefined,
              discoveryProgress(journal, (count) => {
                directories = count;
              }),
            );
          }
          discoveryMs = Date.now() - started;
          const selectedMediaStages = options.stages.filter((stage) => stage !== 'discovery');
          await processMediaQueue({
            scope,
            stages: selectedMediaStages,
            mode: options.mode,
            workers,
            stopped,
            ...(options.fileId === undefined
              ? { cursorKey: mediaQueueCursorKey(options.albumId, options.mode, selectedMediaStages) }
              : {}),
            delayMs: isDevEnv ? 300 : 0,
            progress: mediaProgress(journal, () => {
              processedFiles++;
            }),
          });
        } catch (error) {
          discoveryMs ||= Date.now() - started;
          await complete(error, true);
          throw error;
        }
        const result = await complete();
        if (result.outcome === 'failed') throw new ProcessingFailedError(result);
        return result;
      }),
  );
};

const updateMetadataProcess = {
  run,
  update: async (
    processTimeout = 50,
    threadCount = 2,
    albumToProcess: string | null = null,
  ): Promise<MetadataProcessStatistics> =>
    await run({
      timeoutSec: processTimeout,
      workers: threadCount,
      ...(albumToProcess === null ? {} : { albumId: albumToProcess }),
    }),
};
export default updateMetadataProcess;
