import { readdir, stat, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Album, Prisma } from '@prisma/client';
import prisma from '../prisma/prismaImporter';
import { sourceVersion } from './sourceIdentity';
import type { DiscoveryProgress } from './runProgress';
import { writeDiscoveryBatch, type DiscoveryWrites } from './discoveryWrites';
import { emptyStageStatistics, type StageStatistics } from '@/types/processingTypes';

const root = process.env.APP_ALBUM_ROOT_PATH ?? '/mnt/albums';
const batchSize = 64;
const relative = (value: string): string => path.relative(root, value);
const directoryId = (value: string): string => createHash('sha256').update(value).digest('hex');

const removeSubtree = async (filePath: string): Promise<void> => {
  await prisma.file.updateMany({
    where: { path: { startsWith: `${filePath}/` }, status: { not: 'Deleted' } },
    data: { status: 'Deleted' },
  });
  const absolute = path.join(root, filePath);
  await prisma.discoveryDirectory.deleteMany({
    where: { OR: [{ path: absolute }, { path: { startsWith: `${absolute}/` } }] },
  });
};

interface Snapshot {
  names: string[];
  present: Set<string>;
  version: string;
}

// A run caches one complete async enumeration per physical directory. Entry work and
// deletion checks are separately checkpointed; an incomplete/failed read never deletes.
export const discover = async (
  albums: Album[],
  stopped: () => boolean,
  directoryPath?: string,
  progress?: DiscoveryProgress,
): Promise<{ statistics: StageStatistics; directories: number }> => {
  const statistics = emptyStageStatistics();
  const allAlbums = await prisma.album.findMany({ where: { status: { in: ['Active', 'Disabled'] } } });
  const albumsByPath = new Map<string, Album[]>();
  for (const album of allAlbums) {
    const base = path.resolve(album.basePath);
    const bucket = albumsByPath.get(base) ?? [];
    bucket.push(album);
    albumsByPath.set(base, bucket);
  }
  const albumCache = new Map<string, Album[]>();
  const snapshots = new Map<string, Snapshot>();
  const finished = new Set<string>();
  const attempted = new Set<string>();
  let directories = 0;
  let clock = Date.now();
  const roots =
    directoryPath === undefined ? albums.map((album) => path.resolve(album.basePath)) : [path.resolve(directoryPath)];
  for (let offset = 0; offset < roots.length; offset += batchSize) {
    await prisma.discoveryDirectory.createMany({
      data: roots
        .slice(offset, offset + batchSize)
        .map((directory) => ({ id: directoryId(directory), path: directory })),
      skipDuplicates: true,
    });
  }
  const eligible: Prisma.DiscoveryDirectoryWhereInput = {
    OR: roots.flatMap((directory) => [{ path: directory }, { path: { startsWith: `${directory}/` } }]),
  };

  if (progress !== undefined)
    await progress(statistics, directories, 'initial', await prisma.discoveryDirectory.count({ where: eligible }));
  while (!stopped() && roots.length > 0) {
    const nextTask = await prisma.discoveryDirectory.findFirst({
      where: { ...eligible, id: { notIn: [...finished] } },
      orderBy: [{ lastServedAt: 'asc' }, { id: 'asc' }],
    });
    if (nextTask === null) break;
    let task = nextTask;
    attempted.add(task.id);
    statistics.attempted = attempted.size;
    await progress?.(statistics, directories, 'started');
    // Rotate before I/O so a failing or interrupted directory cannot monopolize runs.
    await prisma.discoveryDirectory.updateMany({
      where: { id: task.id },
      data: { lastServedAt: new Date((clock = Math.max(clock + 1, Date.now()))) },
    });
    try {
      const physical = await realpath(task.path);
      let snapshot = snapshots.get(physical);
      if (snapshot === undefined) {
        const before = await stat(task.path);
        if (!before.isDirectory()) throw new Error('Discovery source is not a directory');
        const entries = await readdir(task.path, { withFileTypes: true });
        const after = await stat(task.path);
        if (sourceVersion(before) !== sourceVersion(after)) throw new Error('Directory changed during enumeration');
        // Do not traverse directory symlinks: avoid cycles and escaping the source tree.
        const names = entries
          .filter((entry) => !entry.isSymbolicLink())
          .map((entry) => entry.name)
          .sort();
        snapshot = { names, present: new Set(entries.map((entry) => entry.name)), version: sourceVersion(after) };
        snapshots.set(physical, snapshot);
        directories++;
      }
      if (stopped()) break;
      // Cursors are valid only for the listing they were started against. In
      // particular, a restart must not reconcile a newly changed directory from
      // an older entry cursor (new names could sort before that cursor).
      if (task.scanVersion !== snapshot.version) {
        await prisma.discoveryDirectory.updateMany({
          where: { id: task.id },
          data: { scanVersion: snapshot.version, entryCursor: null, cleanupCursor: null },
        });
        task = { ...task, scanVersion: snapshot.version, entryCursor: null, cleanupCursor: null };
      }
      let parent = await prisma.file.findFirst({ where: { path: relative(task.path) } });
      let containing = albumCache.get(task.path);
      if (containing === undefined) {
        containing = [];
        for (let current = task.path; ; current = path.dirname(current)) {
          containing.push(...(albumsByPath.get(current) ?? []));
          if (current === path.dirname(current)) break;
        }
        albumCache.set(task.path, containing);
      }
      if (parent !== null && (!parent.isDirectory || parent.status === 'Deleted')) {
        parent = await prisma.file.update({
          where: { id: parent.id },
          data: {
            isDirectory: true,
            name: path.basename(task.path),
            extension: '',
            size: null,
            sourceVersion: null,
            metadataStatus: 'New',
            thumbnailStatus: 'New',
            ...(parent.status === 'Deleted' ? { status: 'Active' } : {}),
          },
        });
      }
      // A nested album may receive its turn before its containing album. Materialize
      // its directory record first so children immediately get the correct parent.
      if (parent === null) {
        const outer = containing.filter((album) => path.resolve(album.basePath) !== task.path);
        if (outer.length > 0) {
          const value = await stat(task.path);
          parent = await prisma.file.create({
            data: {
              path: relative(task.path),
              name: path.basename(task.path),
              extension: '',
              isDirectory: true,
              size: null,
              createdAt: value.ctime,
              modifiedAt: value.mtime,
              albums: { connect: outer.map(({ id }) => ({ id })) },
            },
          });
        }
      }
      if (task.cleanupCursor === null) {
        // Binary search avoids rescanning the prefix for every checkpoint batch.
        let low = 0;
        let high = snapshot.names.length;
        if (task.entryCursor !== null) {
          while (low < high) {
            const middle = (low + high) >>> 1;
            if (snapshot.names[middle] <= task.entryCursor) low = middle + 1;
            else high = middle;
          }
        }
        const names = snapshot.names.slice(low, low + batchSize);
        const existing = await prisma.file.findMany({
          where: { path: { in: names.map((name) => relative(path.join(task.path, name))) } },
          include: { albums: { select: { id: true } } },
        });
        const byPath = new Map(existing.map((file) => [file.path, file]));
        let cursor = task.entryCursor;
        for (let offset = 0; offset < names.length && !stopped(); offset += 8) {
          const group = names.slice(offset, offset + 8);
          // Bound filesystem concurrency and collect every rejection before publishing.
          const values = await Promise.allSettled(
            group.map(async (name) => ({ name, value: await lstat(path.join(task.path, name)) })),
          );
          const failure = values.find((value) => value.status === 'rejected');
          if (failure?.status === 'rejected') throw failure.reason;
          const writes: DiscoveryWrites = { created: [], updated: [], memberships: [], directories: [] };
          for (const result of values) {
            if (result.status !== 'fulfilled') continue;
            const { name, value } = result.value;
            if (stopped()) break;
            const absolute = path.join(task.path, name);
            const filePath = relative(absolute);
            const old = byPath.get(filePath);
            const isDirectory = value.isDirectory();
            if (isDirectory || value.isFile()) {
              const version = isDirectory ? null : sourceVersion(value);
              const members = new Set(old?.albums.map((album) => album.id));
              const connect = containing.filter((album) => !members.has(album.id)).map(({ id }) => ({ id }));
              const changed =
                old !== undefined &&
                !isDirectory &&
                (old.sourceVersion === null
                  ? old.size !== value.size || old.modifiedAt.getTime() !== value.mtime.getTime()
                  : old.sourceVersion !== version);
              const restored = old?.status === 'Deleted';
              const typeChanged = old !== undefined && old.isDirectory !== isDirectory;
              const parsed = path.parse(name);
              const data: Prisma.FileUpdateManyMutationInput = {
                ...(typeChanged
                  ? {
                      name: isDirectory ? name : parsed.name,
                      extension: isDirectory ? '' : parsed.ext.slice(1),
                      ...(isDirectory ? { size: null } : {}),
                    }
                  : {}),
                ...(old?.parentFileId === (parent?.id ?? null) ? {} : { parentFileId: parent?.id ?? null }),
                ...(changed || restored || typeChanged
                  ? { metadataStatus: 'New', thumbnailStatus: 'New', sourceVersion: version, isDirectory }
                  : old?.sourceVersion === null && version !== null
                    ? { sourceVersion: version }
                    : {}),
                ...(restored ? { status: 'Active' } : {}),
              };
              if (typeChanged && old.isDirectory) await removeSubtree(filePath);
              if (old === undefined) {
                const id = randomUUID();
                writes.created.push({
                  id,
                  path: filePath,
                  name: isDirectory ? name : parsed.name,
                  extension: isDirectory ? '' : parsed.ext.slice(1),
                  isDirectory,
                  size: isDirectory ? null : value.size,
                  createdAt: value.ctime,
                  modifiedAt: value.mtime,
                  sourceVersion: version,
                  parentFileId: parent?.id,
                });
                writes.memberships.push(...containing.map((album) => ({ albumId: album.id, fileId: id })));
              } else {
                if (Object.keys(data).length > 0) writes.updated.push({ id: old.id, data });
                writes.memberships.push(...connect.map((album) => ({ albumId: album.id, fileId: old.id })));
              }
              if (isDirectory) writes.directories.push(absolute);
            }
            cursor = name;
          }
          await writeDiscoveryBatch(writes);
        }
        const complete = names.length === 0 || cursor === snapshot.names[snapshot.names.length - 1];
        await prisma.discoveryDirectory.updateMany({
          where: { id: task.id },
          data: { entryCursor: cursor, cleanupCursor: complete ? '' : null },
        });
      } else {
        // Only a complete, stable listing authorizes absence checks. A changing
        // directory restarts the scan without deleting any unvisited records.
        if (sourceVersion(await stat(task.path)) !== snapshot.version)
          throw new Error('Directory changed before reconciliation');
        const files = await prisma.file.findMany({
          where: {
            parentFileId: parent?.id ?? null,
            status: { not: 'Deleted' },
            path: { startsWith: relative(task.path) === '' ? '' : `${relative(task.path)}/` },
            id: { gt: task.cleanupCursor },
          },
          orderBy: { id: 'asc' },
          take: batchSize,
        });
        const removed: string[] = [];
        let cleanupCursor = task.cleanupCursor;
        for (const file of files) {
          if (stopped()) break;
          cleanupCursor = file.id;
          if (
            path.dirname(file.path) !== (relative(task.path) || '.') ||
            snapshot.present.has(path.basename(file.path))
          )
            continue;
          if (file.isDirectory) {
            await removeSubtree(file.path);
          }
          removed.push(file.id);
        }
        if (removed.length > 0)
          await prisma.file.updateMany({ where: { id: { in: removed } }, data: { status: 'Deleted' } });
        const complete =
          files.length < batchSize && (files.length === 0 || cleanupCursor === files[files.length - 1].id);
        await prisma.discoveryDirectory.updateMany({
          where: { id: task.id },
          data: {
            entryCursor: complete ? null : task.entryCursor,
            cleanupCursor: complete ? null : cleanupCursor,
            scanVersion: complete ? null : snapshot.version,
          },
        });
        if (complete) {
          finished.add(task.id);
          statistics.succeeded++;
        }
      }
    } catch {
      statistics.failed++;
      finished.add(task.id);
      await prisma.discoveryDirectory.updateMany({
        where: { id: task.id },
        data: { entryCursor: null, cleanupCursor: null, scanVersion: null },
      });
    }
    await progress?.(statistics, directories, 'progress');
  }
  statistics.deferred = await prisma.discoveryDirectory.count({ where: { ...eligible, id: { notIn: [...finished] } } });
  await progress?.(statistics, directories, 'complete');
  return { statistics, directories };
};
