import { existsSync, mkdirSync, readFileSync } from 'node:fs';

import type { EntityType } from '@/types/api/generalTypes';
import { thumbnailSize } from '@/utils/frontend/thumbnailUtils';

const getThumbnailBaseDirectory = (): string => {
  const dir = process.env.APP_STORAGE_PATH ?? '/mnt/storage/thumbnail';

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
};

export const getThumbnailDirectory = (fileId: string): string => {
  let ret = getThumbnailBaseDirectory();

  // fileId is uuid like 75d29234-a251-4d83-bce4-99ca3db7e984
  const dirRegex = /^(?<dir1>[a-f0-9]{2})(?<dir2>[a-f0-9]{2})(?<dir3>[a-f0-9]{2})(?<dir4>[a-f0-9]{2})/i;
  const match = dirRegex.exec(fileId);

  if (match?.groups !== undefined) {
    ret += `/${match.groups.dir1}/${match.groups.dir2}/${match.groups.dir3}/${match.groups.dir4}`;
  }

  if (!existsSync(ret)) {
    mkdirSync(ret, { recursive: true });
  }

  return ret;
};

export const getFileThumbnailDirectory = (file: EntityType): string => {
  return getThumbnailDirectory(file.id);
};

export const getFileIdThumbnailPath = (fileId: string, size: number): string => {
  let ret = getThumbnailDirectory(fileId);

  ret += `/${fileId}_${Math.round(size)}.jpg`;

  return ret;
};

export const getFileThumbnailPath = (file: EntityType, size: number): string => {
  return getFileIdThumbnailPath(file.id, size);
};

export const getFileThumbnailInBase64 = (file: EntityType): string | null => {
  const path = getFileThumbnailPath(file, thumbnailSize.small);

  if (existsSync(path)) {
    // read binary data from file
    const bitmap = readFileSync(path);
    // convert the binary data to base64 encoded string
    return bitmap.toString('base64');
  }

  return null;
};
