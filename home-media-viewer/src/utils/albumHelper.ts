import { AlbumAddType, AlbumResultType, AlbumSearchType, AlbumUpdateType } from '@/types/api/albumTypes';
import { $Enums, Album, AlbumSourceType, Prisma, User } from '@prisma/client';
import fs from 'fs';
import pathModule from 'path';
import { ALBUM_PATH, loadMetadata, syncFilesInAlbumAndFile } from './fileHelper';

import prisma from '@/utils/prisma/prismaImporter';
import { getFileThumbnailInBase64 } from './thumbnailHelper';

let isAppExiting = false;

process.on('SIGTERM', () => {
  isAppExiting = true;
});

export const getAlbums = async (params: AlbumSearchType) => {
  const usersFilter =
    typeof params.user !== 'string'
      ? undefined
      : {
          some: {
            id: params.user,
          },
        };

  const filter: Prisma.AlbumWhereInput = {
    id: params.id ?? undefined,
    name: typeof params?.name === 'string' ? { contains: params?.name } : undefined,
    basePath:
      typeof params.basePath === 'string'
        ? { equals: params.basePath }
        : typeof params.basePathContains === 'string'
        ? { contains: params.basePath }
        : undefined,
    sourceType: params.sourceType ?? undefined,
    status: params.status ?? { in: ['Active', 'Disabled'] },
    users: usersFilter,
  };

  const results = await prisma.$transaction([
    prisma.album.count({ where: filter }),
    prisma.album.findMany({
      where: filter,
      take: params.take === 0 ? undefined : (params.take ?? 10),
      skip: params.skip ?? 0,
      select: {
        id: true,
        status: true,
        name: true,
        sourceType: true,
        basePath: true,
        files: {
          where: {
            status: 'Active',
            metadataStatus: 'Processed',
            isDirectory: false,
          },
          take: 1,
          select: {
            id: true,
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
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
  };
};

export const checkAlbumData = async (data: AlbumUpdateType, currentId: string | null = null): Promise<void> => {
  const { name = null, status = null } = data;

  const uniqueFilters: Prisma.AlbumWhereInput[] = [];
  if (typeof name === 'string') {
    if (name.length === 0) {
      throw Error('Parameter "name" is empty');
    }
    uniqueFilters.push({ name });
  }

  const notFilter: { id?: string } = {};
  if (currentId != null) {
    notFilter.id = currentId;
  }

  let statusFilter: $Enums.Status[] = [ 'Active', 'Disabled' ];
  if (typeof status === 'string') {
    statusFilter = [status];
  } else if (Array.isArray(status)) {
    statusFilter = status;
  }

  statusFilter = Prisma.validator<$Enums.Status[]>()(statusFilter);

  // check if user exists with same name or email
  if (uniqueFilters.length > 0) {
    const existingUser = await prisma.album.findFirst({
      where: {
        AND: [
          {
            status: {
              in: statusFilter,
            },
          },
        ],
        OR: uniqueFilters,
        NOT: notFilter,
      },
    });

    if (existingUser != null) {
      throw Error(`Album with name ${name} already exists`);
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
  const pathList = path.split('/').reduce(
    (carry: string[], part: string) => {
      if (carry.length === 0) {
        carry.push(part);
      } else {
        carry.push(`${carry[carry.length - 1]}/${part}`);
      }

      return carry;
    },
    []
  );

  const albumsContainingThisDirectory = await prisma.album
    .findMany({ where: { basePath: { in: pathList }}});

  return albumsContainingThisDirectory.sort((a, b) => {
    if (a.basePath.length < b.basePath.length) {
      return -1;
    } else if (a.basePath.length > b.basePath.length) {
      return 1;
    }

    return 0;
  });
}

export const addAlbum = async (data: AlbumAddType): Promise<Album> => {
  if (typeof data?.path !== 'string') {
    throw Error('Parameter "path" must be a non-empty string');
  }

  const finalPath = data.path.startsWith('/') ? data.path : `${process.env.APP_ALBUM_ROOT_PATH}/${data.path}`;
  const relativePath = finalPath.substring(ALBUM_PATH.length + 1);

  let directoryName = '';
  try {
    const stat = fs.statSync(finalPath);

    if (!stat.isDirectory()) {
      throw Error(`"path" (${finalPath}) is not directory`);
    }

    directoryName = pathModule.basename(finalPath);
  } catch {
    throw Error(`"path" (${finalPath}) not found`);
  }

  const existingAlbum = await prisma.album.findFirst({ where: { basePath: finalPath } });
  if (existingAlbum != null) {
    throw Error(`Album with "path" (${finalPath}) already exists`);
  }

  // get parent album
  const albumsContainingThisDirectory = await getAlbumsContainingPath(finalPath);

  const albumName = typeof data?.name === 'string' ? data.name : directoryName;

  const albumWithSameName = await prisma.album.findFirst({ where: { name: albumName } });
  if (albumWithSameName != null) {
    throw Error(`Album with name "${albumName}" already exists`);
  }

  const newAlbum = await prisma.album.create({
    data: {
      name: albumName,
      basePath: finalPath,
      connectionString: `file://${finalPath}`,
      sourceType: AlbumSourceType.File,
      parentAlbumId: albumsContainingThisDirectory.length === 0
        ? null
        : albumsContainingThisDirectory[albumsContainingThisDirectory.length - 1].id
    },
  });

  // attach all files in path to the created album
  const filesInAlbum = await prisma.file.findMany({ where: { path: { startsWith: `${relativePath}/` }} });

  for (const file of filesInAlbum) {
    await prisma.file.update({ where: { id: file.id }, data: { albums: { connect: { id: newAlbum.id }}}});
  }

  return newAlbum;
};

export const updateAlbum = async (data: AlbumUpdateType) => {
  const { id = null } = data;

  if (typeof id !== 'string') {
    throw Error('Parameter "id" must be a non-empty string');
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

export const deleteAlbum = async (id: string) => {
  const album = await prisma.album.findFirst({ where: { id, status: { in: ['Active', 'Disabled'] } } });

  if (album == null) {
    throw Error(`Album not found with id ${id}`);
  }

  await prisma.album.update({ where: { id }, data: { status: 'Deleted' } });
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

export const addUserToAlbum = async (album: string | Album, user: string | User) => {
  const albumEntity =
    typeof album === 'string'
      ? await prisma.album.findFirst({
          where: { id: album, status: { in: ['Active', 'Disabled'] } },
          include: { users: true },
        })
      : album;

  if (albumEntity == null) {
    throw Error(`Album not found with id ${album}`);
  }

  const userEntity =
    typeof user === 'string'
      ? await prisma.user.findFirst({ where: { id: user, status: { in: ['Active', 'Disabled'] } } })
      : user;

  if (userEntity == null) {
    throw Error(`User not found with id ${user}`);
  }

  await prisma.album.update({ where: { id: albumEntity.id }, data: { users: { connect: { id: userEntity.id } } } });
};

export const removeUserFromAlbum = async (album: string | Album, user: string | User) => {
  const albumEntity =
    typeof album === 'string'
      ? await prisma.album.findFirst({
          where: { id: album, status: { in: ['Active', 'Disabled'] } },
          include: { users: true },
        })
      : album;

  if (albumEntity == null) {
    throw Error(`Album not found with id ${album}`);
  }

  const userEntity =
    typeof user === 'string'
      ? await prisma.user.findFirst({ where: { id: user, status: { in: ['Active', 'Disabled'] } } })
      : user;

  if (userEntity == null) {
    throw Error(`User not found with id ${user}`);
  }

  await prisma.album.update({ where: { id: albumEntity.id }, data: { users: { disconnect: { id: userEntity.id } } } });
};
