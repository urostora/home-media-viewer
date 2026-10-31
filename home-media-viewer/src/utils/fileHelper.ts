import fs from 'fs';
import path from 'path';

import { processFileStage } from './processes/fileStages';
import { withProcessingLock } from './processes/processingLock';
import { sourceVersion } from './processes/sourceIdentity';
import { directoryFileProcessor } from './fileProcessor/directory';
import { getDateObject, getDateTimeFilter } from '@/utils/utils';
import { getFileThumbnailInBase64 } from '@/utils/thumbnailHelper';
import { getSimpleValueOrInFilter } from './api/searchParameterHelper';
import prisma from '@/utils/prisma/prismaImporter';
import { HmvError } from './apiHelpers';
import { getAlbums, getAlbumsContainingPath } from './albumHelper';
import { MetaType } from './metaUtils';
import { getSquareAroundCoordinate } from './geoUtils';

import type { FileMetaUpdateType, FileResultType, FileSearchType, FileUpdateType } from '@/types/api/fileTypes';
import type { $Enums, Album, File, Prisma, FileMeta } from '@prisma/client';
import type { EntityListResult } from '@/types/api/generalTypes';
import type { BrowseResult, BrowseResultFile } from '@/types/api/browseTypes';
import { statusValues, type DataValidatorSchema } from './dataValidator';
import { addDateMeta, addFloatMeta, addIntMeta, addPositionMeta, addStringMeta } from './metaHelper';

export const ALBUM_PATH = process.env.APP_ALBUM_ROOT_PATH ?? '/mnt/albums';

export const fileUpdateDataSchema: DataValidatorSchema = [{ field: 'status', valuesAllowed: statusValues }];

export const fileMetadataUpdateDataSchema: DataValidatorSchema = [
  { field: 'key' },
  { field: 'type', valuesAllowed: ['Int', 'String', 'Float', 'Date', 'Location'] },
];

export const syncFilesInAlbumAndFile = async (album: Album, parentFile?: File): Promise<void> =>
  await withProcessingLock(async () => {
    const { discover } = await import('./processes/discovery');
    const deadline = Date.now() + 50_000;
    const result = await discover(
      [album],
      () => Date.now() >= deadline,
      parentFile === undefined ? undefined : getFullPath(parentFile),
    );
    if (result.statistics.failed > 0) throw new Error('Directory discovery failed');
  });

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

  const file = await prisma.file.findFirst({
    where: { id, albums: albumWhere },
    include: { metas: true, albums: true },
  });

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
    // if it was deleted, reactivate file and reload metadata
    if (existingFile.status === 'Deleted') {
      await prisma.file.update({
        where: { id: existingFile.id },
        data: { status: 'Active', metadataStatus: 'New', thumbnailStatus: 'New', sourceVersion: sourceVersion(stats) },
      });
    }

    if (parentFile !== undefined && existingFile.parentFileId !== parentFile.id) {
      // set parent file if doesn't match
      console.log(`    Existing file [${relativePath}] connected to parent file [${parentFile.path}]`);
      await prisma.file.update({ where: { id: existingFile.id }, data: { parentFileId: parentFile.id } });
    }

    return existingFile;
  }

  const fileData = {
    sourceVersion: isDirectory ? null : sourceVersion(stats),
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

export const updateFile = async (id: string, data: FileUpdateType): Promise<File> => {
  return await prisma.file.update({
    where: {
      id,
    },
    data: {
      status: data.status,
    },
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

export const updateFileMetadata = async (
  file: File,
  createdAt: Date,
  modifiedAt: Date,
  size: number,
): Promise<void> => {
  await prisma.file.update({
    where: {
      id: file.id,
    },
    data: {
      createdAt,
      modifiedAt,
      size,
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

export const getFiles = async (params: FileSearchType): Promise<EntityListResult<FileResultType>> => {
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

  let parentFileIdFilter: string | Prisma.StringNullableFilter | null | undefined = params?.parentFileId;
  const parentFilePathFilter =
    typeof params?.parentFilePath === 'string'
      ? {
          path: params.parentFilePath,
        }
      : undefined;

  if (params?.parentFileId === null && typeof params?.album?.id === 'string') {
    // album root requested - get directory file representing the album root (if any)
    const album = await prisma.album.findFirst({ where: { id: params?.album?.id } });

    if (album != null) {
      const relativePath = album.basePath.substring(ALBUM_PATH.length + 1);
      const parentFile = await prisma.file.findFirst({ where: { path: relativePath } });

      if (parentFile != null) {
        parentFileIdFilter = parentFile.id;
      }
    }
  }

  let metaFilter: Prisma.FileMetaListRelationFilter | undefined;
  if (params?.location !== undefined) {
    const { latitude, longitude, distance, latitudeTreshold, longitudeTreshold } = params.location;

    const square:
      | {
          latMin: number;
          latMax: number;
          lonMin: number;
          lonMax: number;
        }
      | undefined =
      typeof distance === 'number'
        ? getSquareAroundCoordinate(latitude, longitude, distance)
        : typeof latitudeTreshold === 'number' && typeof longitudeTreshold === 'number'
          ? {
              latMin: latitude - latitudeTreshold,
              latMax: latitude + latitudeTreshold,
              lonMin: longitude - longitudeTreshold,
              lonMax: longitude + longitudeTreshold,
            }
          : undefined;

    metaFilter =
      square === undefined
        ? undefined
        : {
            some: {
              metaKey: MetaType.GpsCoordinates,
              latitude: {
                gt: square.latMin,
                lt: square.latMax,
              },
              longitude: {
                gt: square.lonMin,
                lt: square.lonMax,
              },
            },
          };
  }

  const take = params?.take === 0 ? undefined : (params.take ?? undefined);
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
    parentFile: parentFilePathFilter,
    metas: metaFilter,
  };

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
      thumbnail: params?.returnThumbnails === true ? getFileThumbnailInBase64(fileData) : null,
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

// Compatibility helper: full media refresh, or discovery for a directory.
export const loadMetadata = async (file: File): Promise<boolean> =>
  await withProcessingLock(async () => {
    if (file.isDirectory) return await directoryFileProcessor(file);
    const metadata = await processFileStage(file, 'metadata');
    const thumbnails = await processFileStage(file, 'thumbnails');
    return ![metadata, thumbnails].some((result) => result === 'failed' || result === 'deferred');
  });

export const deleteMetadata = async (file: File): Promise<void> =>
  await withProcessingLock(async () => {
    const metaIds = (await prisma.fileMeta.findMany({ where: { fileId: file.id }, select: { id: true } })).map(
      (r) => r.id,
    );

    const deleteOperations = metaIds.map((metaId) => prisma.fileMeta.delete({ where: { id: metaId } }));

    await prisma.$transaction([
      ...deleteOperations,
      prisma.file.update({
        where: { id: file.id },
        data: { metadataStatus: 'New', metadataProcessedAt: null, metadataProcessingError: '' },
      }),
    ]);
  });

export const getFullPath = (file: File): string => {
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

export const getBrowseResult = async (directoryPath: string): Promise<BrowseResult> => {
  const baseDir: string = ALBUM_PATH;
  const fullPath = directoryPath.startsWith('/') ? directoryPath : path.join(baseDir, directoryPath);
  const relativePath = fullPath.substring(baseDir.length + 1);

  if (!fs.existsSync(fullPath)) {
    throw new HmvError(`${relativePath} not found`, { isPublic: true, httpStatus: 404 });
  }

  const fullPathStats = fs.statSync(fullPath);
  if (!fullPathStats.isDirectory()) {
    throw new HmvError(`${relativePath} is not a directory`, { isPublic: true, httpStatus: 404 });
  }

  // check if current directory is an album root
  const albumsContainingThisDirectory = await getAlbumsContainingPath(fullPath);

  const [albumExactly = null] = albumsContainingThisDirectory.filter((a) => a.basePath === fullPath);
  const albumContains = await getAlbumsContainingPath(fullPath);

  const album = albumExactly ?? (albumContains.length > 0 ? albumContains[albumContains.length - 1] : null);

  // console.log(`Browse GET API for path ${fullPath}, Album:`, album);

  const albumBasePath = album?.basePath ?? null;

  // load albums in this directory
  const albumsInCurrentDirectory = (await getAlbums({ basePathContains: fullPath })).data.filter(
    (a) => a.basePath.startsWith(fullPath) && a.basePath.substring(fullPath.length + 1).indexOf('/') <= 0,
  );

  // check if current directory is a file object
  const storedDirectoryObjectResult =
    relativePath.length === 0
      ? null
      : await getFiles({
          pathIsExactly: relativePath,
          isDirectory: true,
          take: 0,
        });

  const storedDirectoryObject =
    storedDirectoryObjectResult === null || storedDirectoryObjectResult.count === 0
      ? null
      : storedDirectoryObjectResult.data[0];

  let storedFilesInDirectory: EntityListResult<FileResultType> | null = null;
  if (storedDirectoryObject !== null) {
    storedFilesInDirectory = await getFiles({
      parentFileId: storedDirectoryObject.id,
      returnThumbnails: false,
    });
  } else if (albumExactly !== null) {
    storedFilesInDirectory = await getFiles({
      album: { id: albumExactly.id },
      parentFileId: null,
      returnThumbnails: false,
    });
  }

  // console.log(
  //   'Stored files in directory: ',
  //   storedFilesInDirectory === null ? '-' : storedFilesInDirectory.data.map((f) => `${f.path} (id: ${f.id})`),
  // );

  const directoryContentNames = fs.readdirSync(fullPath);

  const contentList = directoryContentNames
    .map((name: string): BrowseResultFile => {
      const filePathFull = path.join(fullPath, name);
      const fileStats = fs.statSync(filePathFull);

      const filePathRelativeToAlbum = albumBasePath === null ? null : filePathFull.substring(albumBasePath.length + 1);
      const filePathRelativeToContentDir = filePathFull.substring(baseDir.length + 1);

      const storedAlbumList =
        fileStats.isDirectory() && albumsInCurrentDirectory.length > 0
          ? albumsInCurrentDirectory.filter((a) => a.basePath === filePathFull)
          : [];

      const storedAlbum = storedAlbumList === null || storedAlbumList.length === 0 ? null : storedAlbumList[0];

      const storedFilesMatchingName =
        storedFilesInDirectory === null
          ? null
          : storedFilesInDirectory.data.filter(
              (f) => name === `${f.name}${f.extension.length > 0 ? `.${f.extension}` : ''}`,
            );

      const storedFile =
        storedFilesMatchingName === null || storedFilesMatchingName.length === 0 ? null : storedFilesMatchingName[0];

      const album = albumsInCurrentDirectory.find((a) => a.basePath === filePathFull);

      return {
        name,
        path: filePathRelativeToContentDir,
        pathRelativeToAlbum: filePathRelativeToAlbum,
        isDirectory: fileStats.isDirectory(),
        size: fileStats.size,
        dateCreatedOn: fileStats.ctime,
        dateModifiedOn: fileStats.mtime,
        storedFile,
        storedAlbum,
        exactAlbum: album ?? null,
      };
    })
    .sort((brf1, brf2) => {
      if (brf1.isDirectory && !brf2.isDirectory) {
        return -1;
      }
      if (!brf1.isDirectory && brf2.isDirectory) {
        return 1;
      }

      return brf1.name.localeCompare(brf2.name);
    });

  const results = {
    relativePath,
    storedDirectory: storedDirectoryObject,
    albumExactly,
    albumContains,
    content: contentList,
  };

  return results;
};

export const updateFileMetaEntry = async (file: File, data: FileMetaUpdateType): Promise<void> =>
  await withProcessingLock(async () => {
    switch (data.type) {
      case 'String':
        if (typeof data.value === 'string') {
          await addStringMeta(file, data.key, data.value);
        } else {
          throw new HmvError('Value must be a string', { isPublic: true });
        }
        break;
      case 'Int':
        if (typeof data.value === 'number') {
          await addIntMeta(file, data.key, data.value);
        } else {
          throw new HmvError('Value must be a number', { isPublic: true });
        }
        break;
      case 'Float':
        if (typeof data.value === 'number') {
          await addFloatMeta(file, data.key, data.value);
        } else {
          throw new HmvError('Value must be a number', { isPublic: true });
        }
        break;
      case 'Date':
        if (typeof data.value === 'string' && getDateObject(data.value) !== null) {
          const date = getDateObject(data.value);
          if (date !== null) {
            await addDateMeta(file, data.key, date);
          }
        } else {
          throw new HmvError('Value must be a date string', { isPublic: true });
        }
        break;
      case 'Location':
        if (
          typeof data.value === 'object' &&
          typeof data.value.latitude === 'number' &&
          typeof data.value.longitude === 'number'
        ) {
          await addPositionMeta(file, data.key, data.value.latitude, data.value.longitude);
        } else {
          throw new HmvError('Value has invalid latitude or longitude value', { isPublic: true });
        }
        break;
      default:
        throw new HmvError(`Invalid data type specified`, { isPublic: true });
    }
  });
