import type { File, Prisma } from '@prisma/client';
import {
  validateProcessingOptions,
  ProcessingOptionsError,
  emptyStageStatistics,
  type ProcessingOptions,
  type ProcessingStage,
  type StageStatistics,
} from '@/types/processingTypes';
import { syncAlbumFiles } from '@/utils/albumHelper';
import { directoryFileProcessor } from '@/utils/fileProcessor/directory';
import prisma from '@/utils/prisma/prismaImporter';
import { isShuttingDownHandler } from '../isShuttingDown';
import { getWorkerCount } from './processConfig';
import { withProcessingLock } from './processingLock';
import { processFileStage } from './fileStages';

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
      for (const album of albums) {
        if (stopped()) {
          stages.discovery.deferred++;
          continue;
        }
        stages.discovery.attempted++;
        try {
          await syncAlbumFiles(album.id);
          stages.discovery.succeeded++;
        } catch {
          stages.discovery.failed++;
        }
      }
      const existingDirectories = await prisma.file.findMany({
        where: { ...scope, isDirectory: true },
        orderBy: { path: 'asc' },
      });
      for (const directory of existingDirectories) {
        if (stopped()) {
          stages.discovery.deferred++;
          continue;
        }
        directories++;
        stages.discovery.attempted++;
        try {
          await directoryFileProcessor(directory);
          stages.discovery.succeeded++;
        } catch {
          stages.discovery.failed++;
        }
      }
    }
    const discoveryMs = Date.now() - started;
    const selectedMediaStages = options.stages.filter((stage) => stage !== 'discovery');
    const needsWork = (file: File, stage: 'metadata' | 'thumbnails'): boolean =>
      options.mode === 'refresh' || (stage === 'metadata' ? file.metadataStatus : file.thumbnailStatus) === 'New';
    const selector: Prisma.FileWhereInput = {
      ...scope,
      isDirectory: false,
      ...(options.mode === 'pending'
        ? {
            OR: selectedMediaStages.map((stage) =>
              stage === 'metadata' ? { metadataStatus: 'New' as const } : { thumbnailStatus: 'New' as const },
            ),
          }
        : {}),
    };
    // Queue paging and continuous worker replenishment are deliberately deferred to I5.
    const files =
      selectedMediaStages.length === 0 ? [] : await prisma.file.findMany({ where: selector, orderBy: { id: 'asc' } });
    const processed = new Set<string>();
    for (let index = 0; index < files.length; index += workers) {
      if (stopped()) {
        for (const file of files.slice(index))
          for (const stage of selectedMediaStages) {
            if (needsWork(file, stage)) stages[stage]!.deferred++;
          }
        break;
      }
      await Promise.all(
        files.slice(index, index + workers).map(async (file) => {
          for (const stage of selectedMediaStages) {
            if (!needsWork(file, stage)) continue;
            const counts = stages[stage]!;
            if (stopped()) {
              counts.deferred++;
              continue;
            }
            processed.add(file.id);
            counts.attempted++;
            try {
              const result = await processFileStage(file, stage);
              counts[result]++;
            } catch {
              counts.failed++;
            }
          }
        }),
      );
      if (isDevEnv && !stopped()) await new Promise((resolve) => setTimeout(resolve, 300));
    }
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
      processedFileCount: processed.size,
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
