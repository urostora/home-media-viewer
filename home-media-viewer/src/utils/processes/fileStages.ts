import type { File, Prisma } from '@prisma/client';
import type { MediaStage } from '@/types/processingTypes';
import prisma from '../prisma/prismaImporter';
import { getMetadataExtractor, getThumbnailGenerator } from '../fileProcessor/processorFactory';
import { MetaType } from '../metaUtils';
import { assertSourceVersion, readSource, SourceChangedError } from './sourceIdentity';
import { publishThumbnails } from './thumbnailPublication';
import { withProcessingLock } from './processingLock';
import { isShuttingDownHandler } from '../isShuttingDown';
import { retryMetadataTransaction } from './retryMetadataTransaction';

export type StageResult = 'succeeded' | 'failed' | 'notSupported' | 'deferred';

export const processFileStage = async (file: File, stage: MediaStage): Promise<StageResult> =>
  await withProcessingLock(async () => {
    if (file.isDirectory) throw new Error('Media stages cannot process directories');
    if (isShuttingDownHandler.isShuttingDown()) return 'deferred';
    const metadata = stage === 'metadata';
    const update = async (data: Prisma.FileUpdateInput): Promise<void> => {
      await prisma.file.update({ where: { id: file.id }, data });
    };
    // New also represents interrupted work; last-success timestamps/previews remain available.
    await update(
      metadata
        ? { metadataStatus: 'New', metadataProcessingError: null }
        : { thumbnailStatus: 'New', thumbnailProcessingError: null },
    );
    try {
      const source = await readSource(file);
      if (metadata) {
        const extract = getMetadataExtractor(file);
        const extracted = extract === undefined ? undefined : await extract(file);
        await assertSourceVersion(file, source.version);
        await retryMetadataTransaction(
          async () =>
            await prisma.$transaction(async (transaction) => {
              const existingValues = await transaction.fileMeta.findMany({
                where: { fileId: file.id },
              });
              const protectedValues = existingValues.filter((value) => value.origin !== 'Extracted');
              const protectedKeys = new Set(protectedValues.map((value) => value.metaKey));
              const keys = [...(extracted?.entries.keys() ?? [])];
              // Delete concrete rows rather than locking empty index ranges shared by concurrent files.
              const removed = existingValues.filter(
                (value) => value.origin === 'Extracted' && !keys.includes(value.metaKey),
              );
              if (removed.length > 0)
                await transaction.fileMeta.deleteMany({ where: { id: { in: removed.map((value) => value.id) } } });
              for (const [metaKey, value] of extracted?.entries ?? []) {
                if (protectedKeys.has(metaKey)) continue;
                await transaction.fileMeta.upsert({
                  where: { fileId_metaKey: { fileId: file.id, metaKey } },
                  create: { fileId: file.id, metaKey, ...value, origin: 'Extracted' },
                  update: { ...value, origin: 'Extracted' },
                });
              }
              const protectedDate = protectedValues.find((value) => value.metaKey === MetaType.DateTime);
              await assertSourceVersion(file, source.version);
              await transaction.file.update({
                where: { id: file.id },
                data: {
                  size: source.stat.size,
                  createdAt: source.stat.ctime,
                  modifiedAt: source.stat.mtime,
                  contentDate:
                    protectedDate !== undefined
                      ? (protectedDate.dateValue ?? file.contentDate)
                      : (extracted?.contentDate ?? null),
                  metadataStatus: extract === undefined ? 'NotSupported' : 'Processed',
                  metadataProcessedAt: new Date(),
                  metadataProcessingError: null,
                  metadataSourceVersion: source.version,
                },
              });
            }),
        );
        return extract === undefined ? 'notSupported' : 'succeeded';
      }
      const generate = getThumbnailGenerator(file);
      if (generate === undefined) {
        await update({
          thumbnailStatus: 'NotSupported',
          thumbnailProcessedAt: new Date(),
          thumbnailProcessingError: null,
          thumbnailSourceVersion: source.version,
        });
        return 'notSupported';
      }
      await publishThumbnails(file, source.version, generate, async () => {
        await update({
          thumbnailStatus: 'Processed',
          thumbnailProcessedAt: new Date(),
          thumbnailProcessingError: null,
          thumbnailSourceVersion: source.version,
        });
      });
      return 'succeeded';
    } catch (error) {
      const deferred = error instanceof SourceChangedError || isShuttingDownHandler.isShuttingDown();
      if (!deferred) {
        const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
        console.error(
          JSON.stringify({
            event: 'media_stage_failed',
            stage,
            errorType: error instanceof Error ? error.name : 'unknown',
            code,
          }),
        );
      }
      const message = deferred
        ? 'Source changed or processing interrupted; retry required'
        : `${metadata ? 'Metadata' : 'Thumbnail'} processing failed`;
      await update(
        metadata
          ? { metadataStatus: deferred ? 'New' : 'Error', metadataProcessingError: message }
          : { thumbnailStatus: deferred ? 'New' : 'Error', thumbnailProcessingError: message },
      );
      return deferred ? 'deferred' : 'failed';
    }
  });
