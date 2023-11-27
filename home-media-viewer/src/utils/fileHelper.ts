import { Album, File, MetadataProcessingStatus, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getFileProcessor } from '@/utils/fileProcessor/processorFactory';
import { FileSearchType } from '@/types/api/fileTypes';
import { getDateTimeFilter } from '@/utils/utils';
import { getFileThumbnailInBase64 } from '@/utils/thumbnailHelper';

import prisma from '@/utils/prisma/prismaImporter';

export const ALBUM_PATH = process.env.APP_ALBUM_ROOT_PATH ?? '/mnt/albums';

export const syncFilesInAlbumAndFile = async (album: Album, parentFile?: File) => {
  let directoryPath = album.basePath;
  let outerParentFile: File | undefined = undefined;

  if (parentFile != null) {
    directoryPath = `${ALBUM_PATH}/${parentFile.path}`;
  }

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

  const dbFiles = await prisma.file.findMany({
    where: { parentFile: parentFile ?? outerParentFile ?? null, albums: { some: { id: album.id } } },
  });
  const dbFileNames = dbFiles.map((f: File) => f.name + (f.extension.length > 0 ? `.${f.extension}` : ''));
  const dirFiles = fs.readdirSync(directoryPath);

  const filesToDelete = dbFiles.filter((f: File) => {
    const fullName = f.name + (f.extension.length > 0 ? `.${f.extension}` : '');
    return !dirFiles.includes(fullName);
  });

  const filesToAdd = dirFiles.filter((name) => !dbFileNames.includes(name));

  for (const fileToDelete of filesToDelete) {
    console.log(`  Delete file ${fileToDelete.path}`);
    await prisma.file.update({ where: { id: fileToDelete.id }, data: { status: 'Deleted' } });
  }

  const newDirectories: File[] = [];

  for (const fileName of filesToAdd) {
    const fullPath = `${directoryPath}/${fileName}`;
    console.log(`  Add file ${fullPath}`);

    const fileCreated = await addFile(fullPath, albumsContainingThisDirectory, parentFile ?? outerParentFile);

    if (fileCreated.isDirectory) {
      newDirectories.push(fileCreated);
    }
  }

  console.log(
    'New directories',
    newDirectories.map((f) => f.path),
  );

  newDirectories.forEach(async (f: File) => {
    await syncFilesInAlbumAndFile(album, f);
  });
};

export const addFile = async (filePath: string, albums: Album[], parentFile?: File) => {
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
    name: name,
    size: isDirectory ? null : stats.size,
    isDirectory: isDirectory,
    albums: { connect: albums },
    createdAt: stats.ctime,
    modifiedAt: stats.mtime,
    parentFileId: parentFile?.id,
  };

  return await prisma.file.create({
    data: fileData,
  });
};

export const updateContentDate = async (file: File, date?: Date) => {
  await prisma.file.update({
    where: {
      id: file.id,
    },
    data: {
      contentDate: date ?? null,
    },
  });
};

export const updateThumbnailDate = async (file: File) => {
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

export const getFiles = async (params: FileSearchType, returnThumbnails: boolean = false) => {
  const albumSearchParams =
    typeof params?.user !== 'string'
      ? params?.album?.id
        ? {
            some: {
              id: params.album.id,
            },
          }
        : undefined
      : {
          some: {
            id: params?.album?.id ? params.album.id : undefined,
            users: {
              some: {
                id: params?.user ?? undefined,
              },
            },
          },
        };

  let parentFileIdFilter: string | Prisma.StringNullableFilter | null | undefined = params?.album?.id
    ? null
    : undefined;
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

  const filter: Prisma.FileWhereInput = {
    parentFileId: parentFileIdFilter,
    status: params?.status,
    isDirectory: params?.isDirectory,
    name: typeof params?.name !== 'string' ? undefined : { contains: params.name },
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

  const results = await prisma.$transaction([
    prisma.file.count({ where: filter }),
    prisma.file.findMany({
      where: filter,
      take: params?.take === 0 ? undefined : params.take ?? undefined,
      skip: params.skip ?? 0,
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
  const fileList = returnThumbnails
    ? results[1].map((fileData) => {
        const thumbnailData = getFileThumbnailInBase64(fileData);
        return {
          ...fileData,
          thumbnail: thumbnailData,
        };
      })
    : results[1].map((fileData) => {
        return {
          ...fileData,
          thumbnail: '',
        };
      });

  return {
    count: results[0],
    data: fileList,
    debug: {
      params,
      finalFilter: filter,
    },
  };
};

export const getPureExtension = (extension?: string): string => {
  if (typeof extension !== 'string') {
    return '';
  }

  return extension.startsWith('.') ? extension.substring(1) : extension;
};

export const loadMetadataById = async (fileId: string) => {
  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      status: { in: ['Active', 'Disabled'] },
    },
  });

  if (file === null) {
    throw Error(`File not found with id ${fileId}`);
  }

  loadMetadata(file);
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
