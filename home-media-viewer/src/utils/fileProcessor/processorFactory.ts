import { type File } from '@prisma/client';

import { noneFileProcessor } from './none';
import { directoryFileProcessor } from './directory';
import { fillProcessorList as fillImageProcessors } from './image';
import { fillProcessorList as fillVideoProcessors } from './video';
import { fileProcessorHoc } from './fileProcessorHoc';

export type FileProcessor = (file: File) => Promise<boolean>;

const defaultFileProcessor: FileProcessor = noneFileProcessor;
const processors: Record<string, FileProcessor> = {};

// fill processors
fillImageProcessors(processors);
fillVideoProcessors(processors);

export const getFileProcessor = (file: File): FileProcessor => {
  if (file.isDirectory) {
    return directoryFileProcessor;
  }

  const processorFound = processors[file.extension.toLowerCase()] ?? null;

  return fileProcessorHoc(processorFound ?? defaultFileProcessor);
};
