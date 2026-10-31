import { createHash } from 'node:crypto';
import type { File, Prisma } from '@prisma/client';
import { emptyStageStatistics, type MediaStage, type StageStatistics } from '@/types/processingTypes';
import prisma from '../prisma/prismaImporter';
import { isShuttingDownHandler } from '../isShuttingDown';
import { processFileStage } from './fileStages';

export const mediaPageSize = 64;

export const mediaQueueCursorKey = (
  albumId: string | undefined,
  mode: 'pending' | 'refresh',
  stages: MediaStage[],
): string =>
  createHash('sha256')
    .update(JSON.stringify([albumId ?? null, mode, stages]))
    .digest('hex');

interface MediaQueueOptions {
  scope: Prisma.FileWhereInput;
  stages: MediaStage[];
  mode: 'pending' | 'refresh';
  workers: number;
  stopped: () => boolean;
  cursorKey?: string;
  delayMs?: number;
}

export const processMediaQueue = async ({
  scope,
  stages,
  mode,
  workers,
  stopped,
  cursorKey,
  delayMs = 0,
}: MediaQueueOptions): Promise<{
  stages: Partial<Record<MediaStage, StageStatistics>>;
  processedFiles: number;
}> => {
  const statistics = Object.fromEntries(stages.map((stage) => [stage, emptyStageStatistics()]));
  if (stages.length === 0) return { stages: statistics, processedFiles: 0 };
  const status = (stage: MediaStage): Prisma.FileWhereInput =>
    stage === 'metadata' ? { metadataStatus: 'New' } : { thumbnailStatus: 'New' };
  const eligible: Prisma.FileWhereInput = { AND: [scope, { isDirectory: false }] };
  const selector: Prisma.FileWhereInput = {
    AND: [eligible, ...(mode === 'pending' ? [{ OR: stages.map(status) }] : [])],
  };
  const saved = cursorKey === undefined ? null : await prisma.mediaQueueCursor.findUnique({ where: { id: cursorKey } });
  const start = saved?.lastFileId ?? null;
  let after = start ?? undefined;
  let wrapped = false;
  let exhausted = false;
  let blocked = false;
  let page: File[] = [];
  let offset = 0;
  let dispatched: string | undefined;
  let checkpoint: string | undefined;
  let processedFiles = 0;
  let failure: { error: unknown } | undefined;

  const save = async (): Promise<void> => {
    if (cursorKey === undefined || dispatched === undefined || dispatched === checkpoint) return;
    await prisma.mediaQueueCursor.upsert({
      where: { id: cursorKey },
      create: { id: cursorKey, lastFileId: dispatched },
      update: { lastFileId: dispatched },
    });
    checkpoint = dispatched;
  };

  // A single claimant loads each page. Workers hold only their current file;
  // no library-sized array or deduplication set survives processing.
  const claim = async (): Promise<File | undefined> => {
    if (blocked || exhausted || stopped()) return;
    try {
      while (offset === page.length) {
        await save();
        if (stopped()) return;
        page = [];
        offset = 0;
        page = await prisma.file.findMany({
          where: {
            AND: [
              selector,
              { id: { ...(after === undefined ? {} : { gt: after }), ...(wrapped ? { lte: start! } : {}) } },
            ],
          },
          orderBy: { id: 'asc' },
          take: mediaPageSize,
        });
        if (stopped()) return;
        if (page.length > 0) {
          after = page[page.length - 1].id;
          break;
        }
        if (start === null || wrapped) {
          exhausted = true;
          return;
        }
        // Disjoint ranges make one pass around the saved position, including a
        // deleted cursor row and pending work whose status changed behind it.
        wrapped = true;
        after = undefined;
      }
      if (stopped()) return;
      const file = page[offset++];
      dispatched = file.id;
      return file;
    } catch (error) {
      blocked = true;
      throw error;
    }
  };
  let turn: Promise<unknown> = Promise.resolve();
  const next = async (): Promise<File | undefined> => {
    const result = turn.then(claim);
    turn = result.catch(() => undefined);
    return await result;
  };
  const worker = async (): Promise<void> => {
    try {
      for (;;) {
        const file = await next();
        if (file === undefined) return;
        let attempted = false;
        for (const stage of stages) {
          if (mode === 'pending' && (stage === 'metadata' ? file.metadataStatus : file.thumbnailStatus) !== 'New')
            continue;
          // A claimed file is the active unit: finish its selected stages after
          // the dispatch deadline, or repeated short refreshes could starve
          // thumbnails behind a slow metadata stage. Shutdown still interrupts.
          if (blocked || isShuttingDownHandler.isShuttingDown()) break;
          if (!attempted) processedFiles++;
          attempted = true;
          const counts = statistics[stage];
          counts.attempted++;
          try {
            counts[await processFileStage(file, stage)]++;
          } catch {
            counts.failed++;
          }
        }
        if (delayMs > 0 && !stopped()) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      blocked = true;
      failure ??= { error };
    }
  };
  // Never release the shared writer lock while a straggler can still publish,
  // including when another worker encounters a paging/checkpoint failure.
  await Promise.allSettled(Array.from({ length: workers }, worker));
  await save();
  if (failure !== undefined) throw failure.error;

  if (mode === 'refresh') {
    const total = await prisma.file.count({ where: eligible });
    for (const stage of stages) statistics[stage].deferred += Math.max(0, total - statistics[stage].attempted);
  } else {
    await Promise.all(
      stages.map(async (stage) => {
        statistics[stage].deferred = await prisma.file.count({ where: { AND: [eligible, status(stage)] } });
      }),
    );
  }
  return { stages: statistics, processedFiles };
};
