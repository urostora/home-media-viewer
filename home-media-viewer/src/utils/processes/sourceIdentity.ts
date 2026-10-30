import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import type { File } from '@prisma/client';
import { getFullPath } from '../fileHelper';

export const sourceVersion = (value: Stats): string =>
  createHash('sha256')
    .update(`${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`)
    .digest('hex');

export const readSource = async (file: File): Promise<{ stat: Stats; version: string }> => {
  const value = await stat(getFullPath(file));
  if (!value.isFile()) throw new Error('Source is not a regular file');
  return { stat: value, version: sourceVersion(value) };
};

export class SourceChangedError extends Error {}

export const assertSourceVersion = async (file: File, version: string): Promise<void> => {
  if ((await readSource(file)).version !== version) throw new SourceChangedError('Source changed during processing');
};
