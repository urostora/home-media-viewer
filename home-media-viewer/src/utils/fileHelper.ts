import fs from 'fs';
import path from 'path';

import { getFileProcessor } from '@/utils/fileProcessor/processorFactory';
import { getDateTimeFilter } from '@/utils/utils';
import { getFileThumbnailInBase64 } from '@/utils/thumbnailHelper';
import { getSimpleValueOrInFilter } from './api/searchParameterHelper';
import prisma from '@/utils/prisma/prismaImporter';

import type { FileResultType, FileSearchType } from '@/types/api/fileTypes';
import type { $Enums, Album, File, MetadataProcessingStatus, Prisma, FileMeta } from '@prisma/client';
import type { EntityListResult } from '@/types/api/generalTypes';

export const ALBUM_PATH = process.env.APP_ALBUM_ROOT_PATH ?? '/mnt/albums';

export const syncFilesInAlbumAndFile = async (album: Album, parentFile?: File): Promise<void> => {
  let directoryPath = album.basePath;
  let outerParentFile: File | undefined;

  if (parentFile != null) {
    directoryPath = `${ALBUM_PATH}/${parentFile.path}`;
  }

  const relativeBasePath = directoryPath.substring(ALBUM_PATH.length + 1);

  if (!fs.existsSync(directoryPath)) {
    throw new Error(`Element not exists at path ${directoryPath}`);
  }

  const dirStat = fs.statSync(directoryPath);
  if (!dirStat.isDirectory()) {
    throw new Error(`Element at path ${directoryPath} is not a directory`);
  }

  if (parentFile == null) {
    // find parent directory outside the current album
    outerParentFile =
      (await prisma.file.findFirst({ where: { path: directoryPath.substring(ALBUM_PATH.length + 1) } })) ?? undefined;
  }

  const effectiveParentFile: File | undefined = parentFile ?? outerParentFile ?? undefined;

  // console.log(
  //   `Effective parent file: ${effectiveParentFile ? `${effectiveParentFile.path} [${effectiveParentFile.id}]` : '-'}`,
  // );

  // get all albums containing this directory
  const pathList = directoryPath.split('/').reduce((carry: string[], part: string) => {
    if (carry.length === 0) {
      carry.push(part);
    } else {
      carry.push(`${carry[carry.length - 1]}/${part}`);
    }

    return carry;
  }, []);

  const albumsContainingThisDirectory = await prisma.album.findMany({ where: { basePath: { in: pathList } } });

  const dbFiles = (
    await prisma.file.findMany({
      where: {
        OR: [
          {
            path: { startsWith: relativeBasePath + '/' },
          },
          {
            parentFile: parentFile ?? outerParentFile ?? null,
            albums: { some: { id: album.id } },
          },
        ],
      },
    })
  ).filter((f) => !f.path.substring(relativeBasePath.length + 1).includes('/'));

  const dbFileNames = dbFiles.map((f: File) => f.name + (f.extension.length > 0 ? `.${f.extension}` : ''));
  const dirFiles = fs.readdirSync(directoryPath);

  // console.log('Directory files', dirFiles);
  // console.log(
  //   'DB files',
  //   dbFiles.map((f) => `${f.path} [${f.id}]`),
  // );

  const filesToDelete = dbFiles.filter((f: File) => {
    const fullName = f.name + (f.extension.length > 0 ? `.${f.extension}` : '');
    return !dirFiles.includes(fullName);
  });

  const filesToAdd = dirFiles.filter((name) => !dbFileNames.includes(name));

  // console.log('Files to add', filesToAdd);
  // console.log(
  //   'Files to delete',
  //   filesToDelete.map((f) => `${f.path} [${f.isDirectory ? 'DIR' : ''}] ${f.id}`),
  // );

  for (const fileToDelete of filesToDelete) {
    console.log(`  Delete file ${fileToDelete.path} [${fileToDelete.id}]`);
    await prisma.file.update({ where: { id: fileToDelete.id }, data: { status: 'Deleted' } });
  }

  const newDirectories: File[] = [];

  // connect db files to parent if not connected
  if (effectiveParentFile !== undefined) {
    for (const dbFile of dbFiles) {
      if (!dbFile.isDirectory && dbFile.parentFileId !== effectiveParentFile.id) {
        console.log(
          `  Attach file ${dbFile.path} [${dbFile.id}] to parent ${effectiveParentFile.path} [${effectiveParentFile.id}]`,
        );

        await prisma.file.update({ where: { id: dbFile.id }, data: { parentFileId: effectiveParentFile.id } });
      }
    }
  }

  for (const fileName of filesToAdd) {
    const fullPath = `${directoryPath}/${fileName}`;

    const fileCreated = await addFile(fullPath, albumsContainingThisDirectory, effectiveParentFile);

    console.log(`  Add file ${fullPath} [${fileCreated.id}]`);
    if (fileCreated.isDirectory) {
      newDirectories.push(fileCreated);
    }
  }

  for (const newDirectory of newDirectories) {
    await syncFilesInAlbumAndFile(album, newDirectory);
  }
};

export const getFileById = async (
  id: string,
  userId: string | undefined = undefined,
): Promise<(File & { metas: FileMeta[] }) | null> => {
  const albumWhere: Prisma.AlbumListRelationFilter | undefined =
    userId === undefined
      ? undefined
      : {
          some: {
            users: {
              some: {
                id: userId,
              },
            },
          },
        };

  const file = await prisma.file.findFirst({ where: { id, albums: albumWhere }, include: { metas: true } });

  if (file === null) {
    return null;
  }

  return file;
};

export const addFile = async (filePath: string, albums: Album[], parentFile?: File): Promise<File> => {
  const stats = fs.statSync(filePath);
  const { name, ext } = path.parse(filePath);
  const isDirectory = stats.isDirectory();

  const relativePath = filePath.substring(ALBUM_PATH.length + 1);

  // check if file already exists
  const existingFile = await prisma.file.findFirst({ where: { path: relativePath, isDirectory } });
  if (existingFile !== null) {
    return existingFile;
  }

  const fileData = {
    path: relativePath,
    extension: isDirectory ? '' : getPureExtension(ext),
    name,
    size: isDirectory ? null : stats.size,
    isDirectory,
    albums: { connect: albums },
    createdAt: stats.ctime,
    modifiedAt: stats.mtime,
    parentFileId: parentFile?.id,
  };

  return await prisma.file.create({
    data: fileData,
  });
};

export const updateContentDate = async (file: File, date?: Date): Promise<void> => {
  await prisma.file.update({
    where: {
      id: file.id,
    },
    data: {
      contentDate: date ?? null,
    },
  });
};

export const updateThumbnailDate = async (file: File): Promise<void> => {
  await prisma.file.update({
    where: {
      id: file.id,
    },
    data: {
      thumbnailProcessedAt: new Date(),
      thumbnailStatus: 'Processed',
    },
  });
};

export const getFiles = async (
  params: FileSearchType,
  returnThumbnails: boolean = false,
): Promise<EntityListResult<FileResultType>> => {
  const albumIdSearchParameter: Prisma.AlbumWhereInput | undefined =
    params.album !== undefined
      ? typeof params.album.id === 'string'
        ? { id: params.album.id }
        : { id: { in: params.album.id } }
      : undefined;

  const albumSearchParams =
    typeof params?.user !== 'string'
      ? params?.album?.id !== undefined
        ? {
            some: albumIdSearchParameter,
          }
        : undefined
      : {
          some: {
            ...albumIdSearchParameter,
            users: {
              some: {
                id: params?.user ?? undefined,
              },
            },
          },
        };

  let parentFileIdFilter: string | Prisma.StringNullableFilter | null | undefined =
    params?.album?.id !== undefined ? null : undefined;
  if (typeof params?.parentFileId === 'string') {
    // exact parent
    parentFileIdFilter = params?.parentFileId;
  } else if (params?.parentFileId == null && typeof params?.album?.id === 'string') {
    // album root - get directory file representing the album root
    const album = await prisma.album.findFirst({ where: { id: params?.album?.id } });

    if (album != null) {
      const relativePath = album.basePath.substring(ALBUM_PATH.length + 1);
      const parentFile = await prisma.file.findFirst({ where: { path: relativePath } });

      if (parentFile != null) {
        parentFileIdFilter = parentFile.id;
      }
    }
  }

  const take = params?.take === 0 ? undefined : params.take ?? undefined;
  const skip = params.skip ?? 0;

  const filter: Prisma.FileWhereInput = {
    parentFileId: parentFileIdFilter,
    status: getSimpleValueOrInFilter<$Enums.Status>(params?.status) ?? { in: ['Active', 'Disabled'] },
    isDirectory: params?.isDirectory,
    name: getSimpleValueOrInFilter<string>(params.name),
    extension:
      params?.extension ??
      (params?.contentType === undefined || params.contentType === 'all'
        ? undefined
        : params.contentType === 'video'
          ? { in: ['mpeg', 'avi', 'mp4', 'mkv', 'mov', 'MPEG', 'AVI', 'MP4', 'MKV', 'MOV'] }
          : { in: ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG'] }),
    modifiedAt: getDateTimeFilter(params?.fileDate),
    contentDate: getDateTimeFilter(params?.contentDate),
    metadataStatus: params.metadataStatus,
    albums: albumSearchParams,
    path:
      typeof params?.pathBeginsWith !== 'string'
        ? typeof params?.pathIsExactly !== 'string'
          ? undefined
          : { equals: params.pathIsExactly }
        : { startsWith: params.pathBeginsWith },
  };

  // console.log('getFiles final filter:', JSON.stringify(filter));

  const results = await prisma.$transaction([
    prisma.file.count({ where: filter }),
    prisma.file.findMany({
      where: filter,
      take,
      skip,
      include: {
        metas: {
          select: {
            type: true,
            metaKey: true,
            stringValue: true,
            intValue: true,
            floatValue: true,
            dateValue: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: [{ isDirectory: 'desc' }, { contentDate: 'asc' }],
    }),
  ]);

  // add thumbnails if required
  const fileList = results[1].map((fileData) => {
    return {
      ...fileData,
      thumbnail: returnThumbnails ? getFileThumbnailInBase64(fileData) : '',
      // convert dates to strings for output
      createdAt: fileData.createdAt.toString(),
      modifiedAt: fileData.modifiedAt.toString(),
      metadataProcessedAt: fileData.metadataProcessedAt?.toString() ?? null,
      contentDate: fileData.contentDate?.toString() ?? null,
    };
  });

  return {
    count: results[0],
    data: fileList,
    take,
    skip,
    debug: {
      filter,
    },
  };
};

export const getPureExtension = (extension?: string): string => {
  if (typeof extension !== 'string') {
    return '';
  }

  return extension.startsWith('.') ? extension.substring(1) : extension;
};

export const loadMetadataById = async (fileId: string): Promise<void> => {
  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      status: { in: ['Active', 'Disabled'] },
    },
  });

  if (file === null) {
    throw Error(`File not found with id ${fileId}`);
  }

  await loadMetadata(file);
};

export const loadMetadata = async (file: File): Promise<boolean> => {
  const metadataProcessor = getFileProcessor(file);

  let ok: boolean = true;
  let error: string = '';
  if (typeof metadataProcessor === 'function') {
    try {
      if (!file.isDirectory) {
        console.log(`    Processing metadata for file ${file.path}`);
      }

      ok = await metadataProcessor(file);

      if (!file.isDirectory) {
        console.log('      Metadata processed');
      }
    } catch (e) {
      ok = false;
      error = `${e}`;
      console.log('Metadata processor error', e);
    }

    const metadataStatus: MetadataProcessingStatus = ok ? 'Processed' : 'Error';

    await prisma.file.update({
      where: { id: file.id },
      data: {
        metadataProcessedAt: new Date(),
        metadataStatus,
        metadataProcessingError: error,
      },
    });
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

export const deleteMetadata = async (file: File): Promise<void> => {
  const metaIds = (await prisma.fileMeta.findMany({ where: { fileId: file.id }, select: { id: true } })).map(
    (r) => r.id,
  );

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const deleteOperations = metaIds.map((metaId) => prisma.fileMeta.delete({ where: { id: metaId } }));

  await prisma.$transaction([
    ...deleteOperations,
    prisma.file.update({
      where: { id: file.id },
      data: { metadataStatus: 'New', metadataProcessedAt: null, metadataProcessingError: '' },
    }),
  ]);
};

export const getFullPath = async (file: File): Promise<string> => {
  return `${ALBUM_PATH}/${file.path}`;
};

export const deleteFile = async (file: File): Promise<void> => {
  if (file.status === 'Deleted') {
    return;
  }

  await prisma.file.update({
    where: { id: file.id },
    data: { status: 'Deleted' },
  });
};
