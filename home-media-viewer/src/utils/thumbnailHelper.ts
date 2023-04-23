import { File } from '@prisma/client';
import { existsSync, mkdirSync } from 'node:fs';

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

  if (match && match.groups) {
    ret += `/${match.groups['dir1']}/${match.groups['dir2']}/${match.groups['dir3']}/${match.groups['dir4']}`;
  }

  if (!existsSync(ret)) {
    mkdirSync(ret, { recursive: true });
  }

  return ret;
};

export const getFileThumbnailDirectory = (file: File): string => {
  return getThumbnailDirectory(file.id);
}

export const getFileThumbnailPath = (file: File, size: number): string => {
  let ret = getThumbnailDirectory(file.id);

  ret += `/${file.id}_${Math.round(size)}.jpg`;

  return ret;
}

export const thumbnailSize = {
  small: 200,
  medium: 600,
  large: 1280
};

export const thumbnailSizes = [
  thumbnailSize.small,
  thumbnailSize.medium, thumbnailSize.large
];