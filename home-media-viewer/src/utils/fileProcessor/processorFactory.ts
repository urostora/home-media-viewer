import { Album, File } from '@prisma/client';
import { noneFileProcessor } from './none';
import { directoryFileProcessor } from './directory';
import { fillProcessorList as fillImageProcessors } from './image';

export type FileProcessor = (file: File, fileAlbum?: Album) => Promise<boolean>;

const defaultFileProcessor: FileProcessor = noneFileProcessor;
const processors: { [key: string]: FileProcessor } = {};

// fill processors
fillImageProcessors(processors);

export const getFileProcessor = (file: File): FileProcessor => {
  if (file.isDirectory) {
    return directoryFileProcessor;
  }

  const processorFound = processors[file.extension] ?? null;

  return processorFound ?? defaultFileProcessor;
};
