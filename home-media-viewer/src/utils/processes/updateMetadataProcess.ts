import type { Prisma } from '@prisma/client';
import {
  validateProcessingOptions,
  ProcessingOptionsError,
  emptyStageStatistics,
  type ProcessingOptions,
  type ProcessingStage,
  type StageStatistics,
} from '@/types/processingTypes';
import { discover } from './discovery';
import prisma from '@/utils/prisma/prismaImporter';
import { isShuttingDownHandler } from '../isShuttingDown';
import { getWorkerCount } from './processConfig';
import { withProcessingLock } from './processingLock';
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
  outcome: 'success' | 'partial' | 'failed';
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
  return await withProcessingLock(async () => {
    const started = Date.now();
    const timeout = options.timeoutSec ?? 50;
    const workers = isDevEnv ? 1 : getWorkerCount(options.workers ?? 2);
    const stopped = (): boolean => Date.now() >= started + timeout * 1000 || isShuttingDownHandler.isShuttingDown();
    const stages = Object.fromEntries(options.stages.map((stage) => [stage, emptyStageStatistics()])) as Partial<
      Record<ProcessingStage, StageStatistics>
    >;
    const albums =
      options.fileId !== undefined
        ? []
        : await prisma.album.findMany({
            where: { id: options.albumId, status: { in: ['Active', 'Disabled'] } },
            orderBy: { basePath: 'asc' },
          });
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
    let directories = 0;
    if (stages.discovery !== undefined) {
      // Reserve time for existing media even while discovery has a continuous backlog.
      const discoveryDeadline = started + timeout * 1000 * (options.stages.length > 1 ? 0.5 : 1);
      const result = await discover(albums, () => stopped() || Date.now() >= discoveryDeadline);
      stages.discovery = result.statistics;
      directories = result.directories;
    }
    const discoveryMs = Date.now() - started;
    const selectedMediaStages = options.stages.filter((stage) => stage !== 'discovery');
    const media = await processMediaQueue({
      scope,
      stages: selectedMediaStages,
      mode: options.mode,
      workers,
      stopped,
      ...(options.fileId === undefined
        ? { cursorKey: mediaQueueCursorKey(options.albumId, options.mode, selectedMediaStages) }
        : {}),
      delayMs: isDevEnv ? 300 : 0,
    });
    Object.assign(stages, media.stages);
    const counts = Object.values(stages);
    const outcome = counts.some((stage) => stage.failed > 0)
      ? 'failed'
      : counts.some((stage) => stage.deferred > 0)
        ? 'partial'
        : 'success';
    const result: MetadataProcessStatistics = {
      isDeveloperEnvironment: isDevEnv,
      threadCount: workers,
      processTimeoutInSec: timeout,
      lastProcessedOn: new Date(),
      processedAlbumCount: albums.length,
      processedDirectoryCount: directories,
      processedFileCount: media.processedFiles,
      directorySyncTimeInMs: stages.discovery === undefined ? 0 : discoveryMs,
      fullProcessingTimeSec: Math.floor((Date.now() - started) / 1000),
      stages,
      outcome,
    };
    lastStatistics.setLastStatistics(result);
    // Preserve durable failure reporting while exposing independent stage statistics to callers.
    if (outcome === 'failed') throw new ProcessingFailedError(result);
    return result;
  });
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
