import { existsSync, mkdirSync } from 'node:fs';

const getThumbnailBaseDirectory = () => {
  const dir = process.env.APP_STORAGE_PATH ?? '/mnt/storage/thumbnail';

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
};

export const getThumbnailDirectory = (fileId: string) => {
  let ret = getThumbnailBaseDirectory();

  // fileId is uuid like 75d29234-a251-4d83-bce4-99ca3db7e984
  const dirRegex = /^(?<dir1>[a-f0-9]{2})(?<dir2>[a-f0-9]{2})(?<dir3>[a-f0-9]{2})(?<dir4>[a-f0-9]{2})/i;
};
