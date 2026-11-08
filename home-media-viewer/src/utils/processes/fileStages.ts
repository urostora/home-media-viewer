import { retryRead } from '../prisma/retryRead';
import type { File, Prisma } from '@prisma/client';
import { VideoThumbnailTimeError, type MediaStage } from '@/types/processingTypes';
import prisma from '../prisma/prismaImporter';
import { getMetadataExtractor, getThumbnailGenerator, isVideoFile } from '../fileProcessor/processorFactory';
import { readSource, SourceChangedError } from './sourceIdentity';
import { publishThumbnails } from './thumbnailPublication';
import { withProcessingLock } from './processingLock';
import { isShuttingDownHandler } from '../isShuttingDown';
import { publishMetadata } from './publishMetadata';
import { MetaType } from '../metaUtils';
import { getReadableThumbnailPath } from '../thumbnailHelper';
import { thumbnailSizes } from '../frontend/thumbnailUtils';

export type StageResult = 'succeeded' | 'failed' | 'notSupported' | 'deferred';

export const processFileStage = async (
    file: File,
    stage: MediaStage,
    videoThumbnailTimeSec?: number,
): Promise<StageResult> =>
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
            const video = isVideoFile(file);
            const savedTime =
                video && videoThumbnailTimeSec === undefined
                    ? await retryRead(() =>
                          prisma.fileMeta.findUnique({
                              where: { fileId_metaKey: { fileId: file.id, metaKey: MetaType.VideoThumbnailTime } },
                          }),
                      )
                    : null;
            await publishThumbnails(
                file,
                source.version,
                async (target, outputs) => {
                    if (savedTime === null) return await generate(target, outputs, videoThumbnailTimeSec);
                    try {
                        if (savedTime.type !== 'Float' || savedTime.floatValue === null)
                            throw new VideoThumbnailTimeError('Invalid saved video thumbnail time');
                        await generate(target, outputs, savedTime.floatValue);
                    } catch (error) {
                        if (!(error instanceof VideoThumbnailTimeError)) throw error;
                        const existing = await Promise.all(
                            thumbnailSizes.map(async (size) => await getReadableThumbnailPath(file.id, size)),
                        );
                        if (existing.some((thumbnail) => thumbnail !== null)) throw error;
                        // An invalid selection may bootstrap a missing preview, but must never replace an existing one.
                        await generate(target, outputs);
                    }
                },
                async () => {
                    const status: Prisma.FileUpdateManyMutationInput = {
                        thumbnailStatus: 'Processed',
                        thumbnailProcessedAt: new Date(),
                        thumbnailProcessingError: null,
                        thumbnailSourceVersion: source.version,
                    };
                    if (!video || videoThumbnailTimeSec === undefined) return await update(status);
                    // Publication restores the previous previews if this transaction fails.
                    await prisma.$transaction(async (transaction) => {
                        const result = await transaction.file.updateMany({ where: { id: file.id }, data: status });
                        if (result.count !== 1) throw new Error('Media target disappeared');
                        const value = {
                            type: 'Float' as const,
                            origin: 'Manual' as const,
                            floatValue: videoThumbnailTimeSec,
                            intValue: null,
                            stringValue: null,
                            dateValue: null,
                            latitude: null,
                            longitude: null,
                        };
                        await transaction.fileMeta.upsert({
                            where: { fileId_metaKey: { fileId: file.id, metaKey: MetaType.VideoThumbnailTime } },
                            create: { fileId: file.id, metaKey: MetaType.VideoThumbnailTime, ...value },
                            update: value,
                        });
                    });
                },
            );
            return 'succeeded';
        } catch (error) {
            const deferred = error instanceof SourceChangedError || isShuttingDownHandler.isShuttingDown();
            if (!deferred) {
                const code =
                    error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
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
                : error instanceof VideoThumbnailTimeError
                  ? error.message
                  : `${metadata ? 'Metadata' : 'Thumbnail'} processing failed`;
            await update(
                metadata
                    ? { metadataStatus: deferred ? 'New' : 'Error', metadataProcessingError: message }
                    : { thumbnailStatus: deferred ? 'New' : 'Error', thumbnailProcessingError: message },
            );
            return deferred ? 'deferred' : 'failed';
        }
    });
