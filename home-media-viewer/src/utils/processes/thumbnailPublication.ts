import { copyFile, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { File } from '@prisma/client';
import type { ThumbnailGenerator } from '../fileProcessor/processorFactory';
import { thumbnailSizes } from '../frontend/thumbnailUtils';
import { getFileThumbnailPath } from '../thumbnailHelper';
import { assertSourceVersion } from './sourceIdentity';

// Decode into private outputs first. Restore previous previews if publishing or DB state fails.
export const publishThumbnails = async (
  file: File,
  version: string,
  generate: ThumbnailGenerator,
  commit: () => Promise<void>,
): Promise<void> => {
  const finals = new Map(thumbnailSizes.map((size) => [size, getFileThumbnailPath(file, size)]));
  const directory = await mkdtemp(path.join(path.dirname(finals.get(thumbnailSizes[0])!), '.generation-'));
  const outputs = new Map(thumbnailSizes.map((size) => [size, path.join(directory, `${size}.jpg`)]));
  const backups = new Map<number, string>();
  const published: number[] = [];
  try {
    await generate(file, outputs);
    for (const [size, output] of outputs) {
      if ((await stat(output)).size === 0) throw new Error('Empty thumbnail output');
      const backup = path.join(directory, `${size}.previous`);
      try {
        await copyFile(finals.get(size)!, backup);
        backups.set(size, backup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    await assertSourceVersion(file, version);
    for (const [size, output] of outputs) {
      await rename(output, finals.get(size)!);
      published.push(size);
    }
    await assertSourceVersion(file, version);
    await commit();
  } catch (error) {
    for (const size of published.reverse()) {
      const backup = backups.get(size);
      if (backup === undefined) await rm(finals.get(size)!, { force: true });
      else await rename(backup, finals.get(size)!);
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
