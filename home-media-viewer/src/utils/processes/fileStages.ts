import type { File, Prisma } from '@prisma/client';
import type { MediaStage } from '@/types/processingTypes';
import prisma from '../prisma/prismaImporter';
import { getMetadataExtractor, getThumbnailGenerator } from '../fileProcessor/processorFactory';
import { readSource, SourceChangedError } from './sourceIdentity';
import { publishThumbnails } from './thumbnailPublication';
import { withProcessingLock } from './processingLock';
import { isShuttingDownHandler } from '../isShuttingDown';
import { publishMetadata } from './publishMetadata';

export type StageResult = 'succeeded' | 'failed' | 'notSupported' | 'deferred';

export const processFileStage = async (file: File, stage: MediaStage): Promise<StageResult> =>
  await withProcessingLock(async () => {
    if (file.isDirectory) throw new Error('Media stages cannot process directories');
    if (isShuttingDownHandler.isShuttingDown()) return 'deferred';
    const metadata = stage === 'metadata';
    const update = async (data: Prisma.FileUpdateManyMutationInput): Promise<void> => {
      const result = await prisma.file.updateMany({ where: { id: file.id }, data });
      if (result.count !== 1) throw new Error('Media target disappeared');
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
        await publishMetadata(file, source, extracted);
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
