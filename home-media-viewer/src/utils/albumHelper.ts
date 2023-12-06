import {
  AlbumAddType,
  AlbumDataType,
  AlbumExtendedDataType,
  AlbumResultType,
  AlbumSearchType,
  AlbumUpdateType,
} from '@/types/api/albumTypes';
import { $Enums, Album, AlbumSourceType, Prisma } from '@prisma/client';
import fs from 'fs';
import pathModule from 'path';
import { ALBUM_PATH, loadMetadata, syncFilesInAlbumAndFile } from './fileHelper';

import prisma from '@/utils/prisma/prismaImporter';
import { getFileThumbnailInBase64 } from './thumbnailHelper';
import { DataValidatorSchema, statusValues, metadataProcessingStatusValues } from './dataValidator';
import { EntityListResult } from '@/types/api/generalTypes';
import { getSimpleValueOrInFilter } from './api/searchParameterHelper';
import { HmvError } from './apiHelpers';

let isAppExiting = false;

process.on('SIGTERM', () => {
  isAppExiting = true;
});

const ALBUM_SOURCE_TYPE_VALUES = ['File', 'Ftp'];

export const albumSearchDataSchema: DataValidatorSchema = [
  { field: 'name' },
  { field: 'basePathContains' },
  { field: 'basePath' },
  { field: 'user' },
  { field: 'status', valuesAllowed: statusValues, isArrayAllowed: true },
  { field: 'metadataStatus', valuesAllowed: metadataProcessingStatusValues, isArrayAllowed: true },
];

export const albumAddDataSchema: DataValidatorSchema = [
  { field: 'path', isRequired: true },
  { field: 'name' },
  { field: 'status', valuesAllowed: ALBUM_SOURCE_TYPE_VALUES },
];

export const albumUpdateDataSchema: DataValidatorSchema = [
  { field: 'name' },
  { field: 'status', valuesAllowed: statusValues },
];

export const getAlbum = async (id: string, onlyActive: boolean = true): Promise<AlbumExtendedDataType | null> => {
  const statusFilter = onlyActive ? { in: [$Enums.Status.Active, $Enums.Status.Disabled] } : undefined;
  const album = await prisma.album.findFirst({
    where: { id, status: statusFilter },
    select: {
      id: true,
      status: true,
      name: true,
      basePath: true,
      sourceType: true,
      connectionString: true,
      parentAlbumId: true,
      files: {
        where: {
          status: 'Active',
          metadataStatus: 'Processed',
          isDirectory: false,
        },
        take: 1,
        select: {
          id: true,
        },
      },
      users: { select: { id: true, name: true, isAdmin: true }, orderBy: { name: 'asc' } },
    },
  });

  if (album === null) {
    return null;
  }

  // collect file statistics
  // get file processing informations
  const fileStatus = await prisma.file.groupBy({
    where: {
      albums: {
        some: {
          id: album.id,
        },
      },
    },
    by: ['metadataStatus'],
    _count: {
      id: true,
    },
  });

  const fileStatusData = fileStatus.map((fs) => {
    return {
      metadataStatus: fs.metadataStatus,
      fileCount: fs._count.id,
    };
  });

  return {
    ...album,
    fileStatus: fileStatusData,
  };
};

export const getAlbums = async (params: AlbumSearchType): Promise<EntityListResult<AlbumDataType>> => {
  const usersFilter =
    typeof params.user !== 'string'
      ? undefined
      : {
          some: {
            id: params.user,
          },
        };

  const filter: Prisma.AlbumWhereInput = {
    id: getSimpleValueOrInFilter<string>(params?.id),
    name: getSimpleValueOrInFilter<string>(params?.name),
    basePath:
      typeof params.basePath === 'string'
        ? { equals: params.basePath }
        : typeof params.basePathContains === 'string'
        ? { contains: params.basePath }
        : undefined,
    status: getSimpleValueOrInFilter<$Enums.Status>(params?.status) ?? { in: ['Active', 'Disabled'] },
    users: usersFilter,
  };

  const take = params.take === 0 ? undefined : params.take ?? 10;
  const skip = params.skip ?? 0;

  const results = await prisma.$transaction([
    prisma.album.count({ where: filter }),
    prisma.album.findMany({
      where: filter,
      take,
      skip,
      select: {
        id: true,
        status: true,
        name: true,
        sourceType: true,
        basePath: true,
        parentAlbumId: true,
        files: {
          where: {
            status: 'Active',
            metadataStatus: 'Processed',
            isDirectory: false,
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
  ]);

  results[1].forEach((res: AlbumResultType) => {
    if (Array.isArray(res?.files) && res.files.length > 0) {
      const thumbnail = getFileThumbnailInBase64(res.files[0]);

      if (thumbnail !== null) {
        res.files[0].thumbnailImage = thumbnail;
      }
    }
  });

  return {
    data: results[1],
    count: results[0],
    take,
    skip,
  };
};

export const checkAlbumData = async (
  data: AlbumUpdateType & { basePath?: string },
  currentId: string | null = null,
): Promise<void> => {
  const { name = null, basePath } = data;

  const uniqueFilters: Prisma.AlbumWhereInput[] = [];
  if (typeof name === 'string') {
    if (name.length === 0) {
      throw new HmvError('Parameter "name" is empty', { isPublic: true });
    }
    uniqueFilters.push({ name });
  }

  if (typeof basePath === 'string') {
    if (basePath.length === 0) {
      throw new HmvError('Parameter "basePath" is empty', { isPublic: true });
    }
    uniqueFilters.push({ basePath });
  }

  if (uniqueFilters.length === 0) {
    return;
  }

  const notFilter: { id?: string } = {};
  if (currentId != null) {
    notFilter.id = currentId;
  }

  // check if user exists with same name or email
  if (uniqueFilters.length > 0) {
    const existingOtherAlbum = await prisma.album.findFirst({
      where: {
        AND: [
          {
            status: {
              in: ['Active', 'Disabled'],
            },
          },
        ],
        OR: uniqueFilters,
        NOT: notFilter,
      },
      select: { id: true },
    });

    if (existingOtherAlbum != null) {
      throw new HmvError(`Album with same name or path already exists (id: ${existingOtherAlbum.id})`, {
        isPublic: true,
      });
    }
  }
};

export const syncAlbums = async (id: string | undefined = undefined) => {
  const baseDirectory = process.env.APP_ALBUM_ROOT_PATH;
  if (typeof baseDirectory !== 'string') {
    throw new Error('Base directory is not set in env variable "APP_ALBUM_ROOT_PATH"');
  }

  if (!fs.existsSync(baseDirectory)) {
    throw new Error(`Base directory not exists at path ${baseDirectory}`);
  }

  const activeAlbums = await prisma.album.findMany({ where: { id, status: { in: ['Active', 'Disabled'] } } });
  const directories = fs.readdirSync(baseDirectory).filter((path) => {
    const stat = fs.statSync(`${baseDirectory}/${path}`);
    return stat.isDirectory();
  });
  const directoriesWithFullPath = directories.map((dir) => `${baseDirectory}/${dir}`);

  const directoriesWithoutAlbum = directories.filter(
    (path) => activeAlbums.filter((a) => a.basePath === `${baseDirectory}/${path}`).length === 0,
  );
  const albumsWithoutDirectory = activeAlbums.filter((a) => !directoriesWithFullPath.includes(a.basePath));
  const existingAlbums = activeAlbums.filter((a) => directoriesWithFullPath.includes(a.basePath));

  directoriesWithoutAlbum.forEach(async (path) => {
    const newAlbum = await prisma.album.create({
      data: {
        basePath: `${baseDirectory}/${path}`,
        name: path,
        sourceType: 'File',
        connectionString: `file://${baseDirectory}/${path}`,
      },
    });

    await syncFilesInAlbumAndFile(newAlbum);
  });

  existingAlbums.forEach(async (album: Album) => {
    await syncFilesInAlbumAndFile(album);
  });

  albumsWithoutDirectory.forEach(async (a) => {
    await prisma.album.update({
      data: {
        status: 'Deleted',
      },
      where: {
        id: a.id,
      },
    });
  });

  return {
    baseDirectory,
    allDirectories: directories,
    allDirectoriesWithFullPath: directoriesWithFullPath,
    allDirectoriesCount: directories.length,
    activeAlbumsCount: activeAlbums.length,
    albumsAdded: directoriesWithoutAlbum.length,
    albumsDeleted: albumsWithoutDirectory.length,
  };
};

export const getAlbumsContainingPath = async (path: string): Promise<Album[]> => {
  // get all albums containing this directory
  const pathList = path.split('/').reduce((carry: string[], part: string) => {
    if (carry.length === 0) {
      carry.push(part);
    } else {
      carry.push(`${carry[carry.length - 1]}/${part}`);
    }

    return carry;
  }, []);

  const albumsContainingThisDirectory = await prisma.album.findMany({ where: { basePath: { in: pathList } } });

  return albumsContainingThisDirectory.sort((a, b) => {
    if (a.basePath.length < b.basePath.length) {
      return -1;
    } else if (a.basePath.length > b.basePath.length) {
      return 1;
    }

    return 0;
  });
};

export const addAlbum = async (data: AlbumAddType): Promise<Album> => {
  if (typeof data?.path !== 'string' || data.path.length === 0) {
    throw new HmvError('Parameter "path" must be a non-empty string', { isPublic: true });
  }

  const finalPath = data.path.startsWith('/') ? data.path : `${process.env.APP_ALBUM_ROOT_PATH}/${data.path}`;
  const relativePath = finalPath.substring(ALBUM_PATH.length + 1);

  let directoryName = '';
  try {
    const stat = fs.statSync(finalPath);

    if (!stat.isDirectory()) {
      throw new HmvError(`"path" (${finalPath}) is not directory`, { isPublic: true });
    }

    directoryName = pathModule.basename(finalPath);
  } catch {
    throw new HmvError(`"path" (${finalPath}) not found`, { isPublic: true });
  }

  // const existingAlbum = await prisma.album.findFirst({ where: { basePath: finalPath } });
  // if (existingAlbum != null) {
  //   throw new HmvError(`Album with "path" (${finalPath}) already exists`, { isPublic: true });
  // }

  // get parent album
  const albumsContainingThisDirectory = await getAlbumsContainingPath(finalPath);

  const albumName = typeof data?.name === 'string' ? data.name : directoryName;

  await checkAlbumData({ name: albumName, basePath: finalPath });

  const newAlbum = await prisma.album.create({
    data: {
      name: albumName,
      basePath: finalPath,
      connectionString: `file://${finalPath}`,
      sourceType: AlbumSourceType.File,
      parentAlbumId:
        albumsContainingThisDirectory.length === 0
          ? null
          : albumsContainingThisDirectory[albumsContainingThisDirectory.length - 1].id,
    },
  });

  // attach all files in path to the created album
  const filesInAlbum = await prisma.file.findMany({ where: { path: { startsWith: `${relativePath}/` } } });

  for (const file of filesInAlbum) {
    await prisma.file.update({ where: { id: file.id }, data: { albums: { connect: { id: newAlbum.id } } } });
  }

  return newAlbum;
};

export const updateAlbum = async (id: string, data: AlbumUpdateType) => {
  if (typeof id !== 'string' || id.length === 0) {
    throw new HmvError('Parameter "id" must be a non-empty string');
  }

  const user = await prisma.album.findFirst({ where: { id } });

  if (user == null) {
    throw Error(`Album not found with id ${id}`);
  }

  await checkAlbumData(data, id);

  const { name = null, status = null } = data;
  const updateData: AlbumUpdateType = {};

  if (typeof name === 'string') {
    updateData.name = name;
  }

  if (typeof status === 'string') {
    updateData.status = status;
  }

  if (updateData.name == null && updateData.status == null) {
    return null;
  }

  const updatedAlbum = await prisma.album.update({
    where: {
      id,
    },
    data: updateData,
  });

  return updatedAlbum;
};

export const deleteAlbum = async (id: string): Promise<AlbumDataType | null> => {
  return await prisma.album.update({ where: { id }, data: { status: 'Deleted' } });
};

export const syncAlbumFiles = async (albumId: string) => {
  const album = await prisma.album.findFirst({ where: { id: albumId, status: { in: ['Active', 'Disabled'] } } });

  if (album == null) {
    throw Error(`Album not found with id ${albumId}`);
  }

  await syncFilesInAlbumAndFile(album);
};

export const processAlbumFilesMetadata = async (
  albumId: string,
  timeoutSec: number = Number.parseInt(process.env.LONG_PROCESS_TIMEOUT_SEC ?? '20'),
) => {
  const startedOn = process.hrtime();
  const album = await prisma.album.findFirst({ where: { id: albumId, status: { in: ['Active', 'Disabled'] } } });

  if (album == null) {
    throw Error(`Album not found with id ${albumId}`);
  }

  const filesUnprocessed = await prisma.file.findMany({
    where: {
      albums: { some: album },
      metadataStatus: 'New',
    },
  });

  // this may be a long process
  for (const f of filesUnprocessed) {
    console.log(`Create metadata to file ${f.path}`);
    await loadMetadata(f);

    const currentTime = process.hrtime(startedOn);
    if (isAppExiting || currentTime[0] > timeoutSec) {
      break;
    }
  }
};

export const addUserToAlbum = async (album: string, user: string) => {
  const albumEntity = await prisma.album.findFirst({
    where: { id: album, status: { in: ['Active', 'Disabled'] } },
    include: { users: true },
  });

  if (albumEntity == null) {
    throw new HmvError(`Album not found with id ${album}`, { isPublic: true });
  }

  const userEntity = await prisma.user.findFirst({ where: { id: user, status: { in: ['Active', 'Disabled'] } } });

  if (userEntity == null) {
    throw new HmvError(`User not found with id ${user}`, { isPublic: true });
  }

  if (albumEntity.users.find((u) => u.id === user)) {
    return;
  }

  await prisma.album.update({ where: { id: albumEntity.id }, data: { users: { connect: { id: userEntity.id } } } });
};

export const removeUserFromAlbum = async (album: string, user: string) => {
  const albumEntity = await prisma.album.findFirst({
    where: { id: album, status: { in: ['Active', 'Disabled'] } },
    include: { users: true },
  });

  if (albumEntity == null) {
    throw new HmvError(`Album not found with id ${album}`, { isPublic: true });
  }

  const userEntity = await prisma.user.findFirst({ where: { id: user, status: { in: ['Active', 'Disabled'] } } });

  if (userEntity == null) {
    throw new HmvError(`User not found with id ${user}`, { isPublic: true });
  }

  if (!albumEntity.users.find((u) => u.id === user)) {
    return;
  }

  await prisma.album.update({ where: { id: albumEntity.id }, data: { users: { disconnect: { id: userEntity.id } } } });
};
