import { validateProcessingOptions, type ProcessingOptions } from '@/types/processingTypes';

export const parseProcessingCli = (args: string[]): ProcessingOptions => {
  const options: Record<string, unknown> = {};
  const flags: Record<string, string> = {
    '--stages': 'stages',
    '--mode': 'mode',
    '--album': 'albumId',
    '--file': 'fileId',
    '--timeout': 'timeoutSec',
    '--workers': 'workers',
  };
  for (let index = 0; index < args.length; index += 2) {
    const key = flags[args[index]];
    const value = args[index + 1];
    if (key === undefined || value === undefined || value.startsWith('--') || options[key] !== undefined) {
      throw new Error('Invalid or repeated processing argument');
    }
    options[key] =
      key === 'stages' ? value.split(',') : ['timeoutSec', 'workers'].includes(key) ? Number(value) : value;
  }
  if (options.fileId !== undefined && options.stages === undefined) options.stages = ['metadata', 'thumbnails'];
  return validateProcessingOptions(options);
};
