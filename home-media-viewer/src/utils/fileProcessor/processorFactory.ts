import type { File } from '@prisma/client';
import type { ExtractedMetadata } from './metadata';
import { extractImageMetadata, generateImageThumbnails } from './image';
import { extractVideoMetadata, generateVideoThumbnails } from './video';

export type FileProcessor = (file: File) => Promise<boolean>;
export type MetadataExtractor = (file: File) => Promise<ExtractedMetadata>;
export type ThumbnailGenerator = (
    file: File,
    outputs: ReadonlyMap<number, string>,
    videoThumbnailTimeSec?: number,
) => Promise<void>;

const images = new Set(['bmp', 'jpg', 'jpeg', 'gif', 'png', 'tiff']);
const videos = new Set(['mp4', 'mkv', 'avi', 'mpg', 'mpeg', 'mov']);

export const isVideoFile = (file: File): boolean => !file.isDirectory && videos.has(file.extension.toLowerCase());

export const getMetadataExtractor = (file: File): MetadataExtractor | undefined => {
    if (file.isDirectory) return undefined;
    if (images.has(file.extension.toLowerCase())) return extractImageMetadata;
    if (isVideoFile(file)) return extractVideoMetadata;
    return undefined;
};

export const getThumbnailGenerator = (file: File): ThumbnailGenerator | undefined => {
    if (file.isDirectory) return undefined;
    if (images.has(file.extension.toLowerCase())) return generateImageThumbnails;
    if (isVideoFile(file)) return generateVideoThumbnails;
    return undefined;
};
