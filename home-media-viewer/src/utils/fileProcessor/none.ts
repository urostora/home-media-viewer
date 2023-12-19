import { type FileProcessor } from './processorFactory';

export const noneFileProcessor: FileProcessor = async () => true;
