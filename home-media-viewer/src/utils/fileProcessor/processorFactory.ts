import type { File } from '@prisma/client';
import type { ExtractedMetadata } from './metadata';
import { extractImageMetadata, generateImageThumbnails } from './image';
import { extractVideoMetadata, generateVideoThumbnails } from './video';

export type FileProcessor = (file: File) => Promise<boolean>;
export type MetadataExtractor = (file: File) => Promise<ExtractedMetadata>;
export type ThumbnailGenerator = (file: File, outputs: ReadonlyMap<number, string>) => Promise<void>;

const images = new Set(['bmp', 'jpg', 'jpeg', 'gif', 'png', 'tiff']);
const videos = new Set(['mp4', 'mkv', 'avi', 'mpg', 'mpeg', 'mov']);

export const getMetadataExtractor = (file: File): MetadataExtractor | undefined => {
  if (file.isDirectory) return undefined;
  if (images.has(file.extension.toLowerCase())) return extractImageMetadata;
  if (videos.has(file.extension.toLowerCase())) return extractVideoMetadata;
  return undefined;
};

export const getThumbnailGenerator = (file: File): ThumbnailGenerator | undefined => {
  if (file.isDirectory) return undefined;
  if (images.has(file.extension.toLowerCase())) return generateImageThumbnails;
  if (videos.has(file.extension.toLowerCase())) return generateVideoThumbnails;
  return undefined;
};
