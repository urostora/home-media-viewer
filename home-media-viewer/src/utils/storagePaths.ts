import path from 'node:path';

// APP_STORAGE_PATH is always the mounted persistence root; thumbnails have a separate setting.
export const storageRoot = (): string => path.resolve(process.env.APP_STORAGE_PATH ?? '/mnt/storage');
export const thumbnailRoot = (): string => {
  const root = storageRoot();
  const thumbnail = path.resolve(root, process.env.APP_THUMBNAIL_SUBDIRECTORY ?? 'thumbnail');
  if (thumbnail === root || !thumbnail.startsWith(`${root}${path.sep}`)) {
    throw new Error('APP_THUMBNAIL_SUBDIRECTORY must stay beneath APP_STORAGE_PATH');
  }
  return thumbnail;
};
