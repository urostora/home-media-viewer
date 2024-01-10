import fs from 'fs';

import { getFullPath, updateFileMetadata } from '@/utils/fileHelper';

import type { File } from '@prisma/client';

export const fileProcessorHoc = (
  fileProcessorFunction: (file: File) => Promise<boolean>,
): ((file: File) => Promise<boolean>) => {
  const baseFileProcessor = async (file: File): Promise<boolean> => {
    const path = getFullPath(file);

    if (!fs.existsSync(path)) {
      throw new Error(`File not found at path ${path}`);
    }

    // update file metadata
    const fileStats = fs.statSync(path);
    if (fileStats.isFile()) {
      await updateFileMetadata(file, fileStats.ctime, fileStats.mtime, fileStats.size);
    }

    return await fileProcessorFunction(file);
  };

  return baseFileProcessor;
};
