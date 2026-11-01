import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getFileIdThumbnailPath, getFileThumbnailInBase64, getReadableThumbnailPath } from '@/utils/thumbnailHelper';
import { handleFileResponseByPath } from '@/utils/responseHelper';
import { thumbnailRoot } from '@/utils/storagePaths';

const id = 'abcdef12-1234-1234-1234-123456789abc';
let temporary: string;
let previousStorage: string | undefined;
let previousSubdirectory: string | undefined;
beforeEach(() => {
  previousStorage = process.env.APP_STORAGE_PATH;
  previousSubdirectory = process.env.APP_THUMBNAIL_SUBDIRECTORY;
  temporary = mkdtempSync(path.join(os.tmpdir(), 'hmv-thumbnail-unit-'));
  process.env.APP_STORAGE_PATH = path.join(temporary, 'storage');
  process.env.APP_THUMBNAIL_SUBDIRECTORY = 'thumbnail';
});
afterEach(() => {
  rmSync(temporary, { recursive: true, force: true });
  if (previousStorage === undefined) delete process.env.APP_STORAGE_PATH;
  else process.env.APP_STORAGE_PATH = previousStorage;
  if (previousSubdirectory === undefined) delete process.env.APP_THUMBNAIL_SUBDIRECTORY;
  else process.env.APP_THUMBNAIL_SUBDIRECTORY = previousSubdirectory;
});

it('never creates storage during missing thumbnail reads or inline-preview reads', async () => {
  expect(getFileIdThumbnailPath(id, 200, false)).toBe(path.join(thumbnailRoot(), 'ab/cd/ef/12', `${id}_200.jpg`));
  expect(await getReadableThumbnailPath(id, 200)).toBeNull();
  expect(getFileThumbnailInBase64({ id })).toBeNull();
  expect(existsSync(process.env.APP_STORAGE_PATH!)).toBe(false);
});

it.each([200, 600, 1280])('preserves generation layout and resolves a regular size %s file', async (size) => {
  const expected = getFileIdThumbnailPath(id, size);
  writeFileSync(expected, 'synthetic thumbnail');
  expect(await getReadableThumbnailPath(id, size)).toBe(expected);
});

it('rejects a file symlink outside thumbnail storage', async () => {
  const candidate = getFileIdThumbnailPath(id, 200);
  const outside = path.join(temporary, 'outside.jpg');
  writeFileSync(outside, 'not a thumbnail');
  symlinkSync(outside, candidate);
  expect(await getReadableThumbnailPath(id, 200)).toBeNull();
});

it('rejects a shard-directory symlink outside thumbnail storage', async () => {
  const outside = path.join(temporary, 'outside');
  mkdirSync(path.join(outside, 'cd/ef/12'), { recursive: true });
  writeFileSync(path.join(outside, 'cd/ef/12', `${id}_200.jpg`), 'not a thumbnail');
  mkdirSync(thumbnailRoot(), { recursive: true });
  symlinkSync(outside, path.join(thumbnailRoot(), 'ab'));
  expect(await getReadableThumbnailPath(id, 200)).toBeNull();
});

it('does not stream directories or escape the configured root', async () => {
  const candidate = getFileIdThumbnailPath(id, 200);
  mkdirSync(candidate);
  expect(await getReadableThumbnailPath(id, 200)).toBeNull();
  expect(() => getFileIdThumbnailPath('../../outside', 200, false)).toThrow('Invalid thumbnail path');
});

it('ends a missing-file response before attempting stat or stream', () => {
  const res = { status: jest.fn().mockReturnThis(), end: jest.fn(), writeHead: jest.fn() };
  expect(() =>
    handleFileResponseByPath(
      { headers: {} } as NextApiRequest,
      res as unknown as NextApiResponse,
      path.join(temporary, 'missing.jpg'),
    ),
  ).not.toThrow();
  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.end).toHaveBeenCalledWith('File not found');
  expect(res.writeHead).not.toHaveBeenCalled();
});
