import { access, mkdir, mkdtemp, rmdir, statfs, writeFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/utils/prisma/prismaImporter';
import { storageRoot, thumbnailRoot } from '@/utils/storagePaths';

// Coalesce overlapping probes and cache briefly; readiness never starts indexing.
let pending: Promise<void> | undefined;
let checkedAt = 0;
const check = async (): Promise<void> => {
  await Promise.all([
    prisma.album.findFirst(),
    prisma.user.findFirst(),
    prisma.file.findFirst(),
    prisma.fileMeta.findFirst(),
    prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`.then(
      (failed) => {
        if ((failed as unknown[]).length > 0) throw new Error('Unfinished migration');
      },
    ),
    access(process.env.APP_ALBUM_ROOT_PATH ?? '/mnt/albums', constants.R_OK | constants.X_OK),
  ]);
  await mkdir(thumbnailRoot(), { recursive: true });
  const probe = await mkdtemp(path.join(thumbnailRoot(), '.readiness-'));
  try {
    const file = path.join(probe, 'write');
    await writeFile(file, 'ready');
    await unlink(file);
  } finally {
    await rmdir(probe);
  }
  const space = await statfs(storageRoot());
  const minimum = Number(process.env.MIN_STORAGE_FREE_BYTES ?? 268435456);
  if (!Number.isFinite(minimum) || minimum < 0 || space.bavail * space.bsize < minimum) {
    throw new Error('Insufficient storage');
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (process.env.HMV_SHUTTING_DOWN === '1') throw new Error('Shutting down');
    if (Date.now() - checkedAt > 5000) {
      if (pending === undefined)
        pending = check()
          .then(() => {
            checkedAt = Date.now();
          })
          .finally(() => {
            pending = undefined;
          });
      await pending;
    }
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
}
