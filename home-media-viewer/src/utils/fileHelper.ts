import { Album, File, MetadataProcessingStatus, PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getFileProcessor } from './fileProcessor/processorFactory';

const prisma = new PrismaClient();

export const syncFilesInAlbumAndFile = async (album: Album, parentFile?: File) => {
  let directoryPath = album.basePath;
  if (parentFile != null) {
    directoryPath += `/${parentFile.path}`;
  }

  if (!fs.existsSync(directoryPath)) {
    throw new Error(`Directory not exists at path ${path}`);
  }

  const dirStat = fs.statSync(directoryPath);
  if (!dirStat.isDirectory()) {
    throw new Error(`Element at path ${path} is not a directory`);
  }

  const dbFiles = await prisma.file.findMany({ where: { albumId: album.id, parentFile: parentFile } });
  const dbFileNames = dbFiles.map((f: File) => f.name + (f.extension.length > 0 ? `.${f.extension}` : ''));
  const dirFiles = fs.readdirSync(directoryPath);

  const filesToDelete = dbFiles.filter((f: File) => {
    const fullName = f.name + (f.extension.length > 0 ? `.${f.extension}` : '');
    return !dirFiles.includes(fullName);
  });

  const filesToAdd = dirFiles.filter((name) => !dbFileNames.includes(name));

  filesToDelete.forEach(async (f: File) => {
    await prisma.file.update({ where: { id: f.id }, data: { status: 'Deleted' } });
  });

  filesToAdd.forEach(async (fileName: string) => {
    const fullPath = `${directoryPath}/${fileName}`;
    await addFile(fullPath, album, parentFile);
  });
};

export const addFile = async (filePath: string, album: Album, parentFile?: File) => {
  const stats = fs.statSync(filePath);
  const { name, ext } = path.parse(filePath);
  const isDirectory = stats.isDirectory();

  const relativePath = filePath.substring(album.basePath.length + 1);

  const fileData = {
    path: relativePath,
    extension: isDirectory ? '' : getPureExtension(ext),
    name: name,
    size: isDirectory ? null : stats.size,
    isDirectory: isDirectory,
    albumId: album.id,
    createdAt: stats.ctime,
    modifiedAt: stats.mtime,
    parentFileId: parentFile?.id,
  };

  return await prisma.file.create({
    data: fileData,
  });
};

export const getPureExtension = (extension?: string): string => {
  if (typeof extension !== 'string') {
    return '';
  }

  return extension.startsWith('.') ? extension.substring(1) : extension;
};

export const loadMetadata = async (file: File, fileAlbum?: Album): Promise<boolean> => {
  const metadataProcessor = getFileProcessor(file);

  let ok: boolean = true;
  let error: string = '';
  if (typeof metadataProcessor === 'function') {
    try {
      ok = await metadataProcessor(file, fileAlbum);
    } catch (e) {
      ok = false;
      error = `${e}`;
      console.log('Metadata processor error', e);
    }

    if (!file.isDirectory) {
      const metadataStatus: MetadataProcessingStatus = ok ? 'Processed' : 'Error';

      await prisma.file.update({
        where: { id: file.id },
        data: {
          metadataProcessedAt: new Date(),
          metadataStatus,
          metadataProcessingError: error,
        },
      });
    }
  } else {
    await prisma.file.update({
      where: { id: file.id },
      data: {
        metadataProcessedAt: new Date(),
        metadataStatus: 'NotSupported',
      },
    });
  }

  return ok;
};

export const deleteMetadata = async (file: File) => {
  const metaIds = (await prisma.fileMeta.findMany({ where: { fileId: file.id }, select: { id: true } })).map(
    (r) => r.id,
  );

  await prisma.$transaction([
    ...metaIds.map((metaId) => prisma.fileMeta.delete({ where: { id: metaId } })),
    prisma.file.update({
      where: { id: file.id },
      data: { metadataStatus: 'New', metadataProcessedAt: null, metadataProcessingError: '' },
    }),
  ]);
};

export const getFullPath = async (file: File, fileAlbum?: Album): Promise<string> => {
  const album = (fileAlbum ?? (await prisma.album.findFirst({ where: { id: file.albumId } }))) as Album;

  if (album == null) {
    throw Error('Album not found');
  }

  return `${album.basePath}/${file.path}`;
};
