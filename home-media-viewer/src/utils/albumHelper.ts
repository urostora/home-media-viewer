import { AlbumSearchType, AlbumUpdateType } from '@/types/api/albumTypes';
import { Album, Prisma, PrismaClient, Status } from '@prisma/client';
import fs from 'fs';
import { loadMetadata, syncFilesInAlbumAndFile } from './fileHelper';

const prisma = new PrismaClient();

let isAppExiting = false;

process.on('SIGTERM', () => {
  isAppExiting = true;
});

export const getAlbums = async (params: AlbumSearchType) => {
  const filter: Prisma.AlbumWhereInput = {
    id: params.id ?? undefined,
    name: typeof params?.name === 'string' ? { contains: params?.name } : undefined,
    basePath: typeof params.basePath === 'string' ? { contains: params.basePath } : undefined,
    sourceType: params.sourceType ?? undefined,
    status: params.status ?? { in: ['Active', 'Disabled'] },
  };

  const results = await prisma.$transaction([
    prisma.album.count({ where: filter }),
    prisma.album.findMany({
      where: filter,
      take: params.take ?? 10,
      skip: params.skip ?? 0,
      select: {
        id: true,
        status: true,
        name: true,
        sourceType: true,
        basePath: true,
      },
    }),
  ]);

  return {
    data: results[1],
    count: results[0],
  };
};

export const checkAlbumData = async (data: AlbumUpdateType, currentId: string | null = null): Promise<void> => {
  const { name = null, status = null } = data;

  let uniqueFilters: Prisma.AlbumWhereInput[] = [];
  if (typeof name === 'string') {
    if (name.length === 0) {
      throw Error('Parameter "name" is empty');
    }
    uniqueFilters.push({ name });
  }

  let notFilter: any = {};
  if (currentId != null) {
    notFilter.id = currentId;
  }

  let statusFilter: Status[] = [];
  if (typeof status === 'string') {
    statusFilter = [status];
  } else if (Array.isArray(status)) {
    statusFilter = status;
  }

  statusFilter = Prisma.validator<Status[]>()(statusFilter);

  // check if user exists with same name or email
  if (uniqueFilters.length > 0) {
    const existingUser = await prisma.album.findFirst({
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
    });

    if (existingUser != null) {
      throw Error(`Album with name ${name} already exists`);
    }
  }
};

export const syncAlbums = async () => {
  const baseDirectory = process.env.APP_ALBUM_ROOT_PATH;
  if (typeof baseDirectory !== 'string') {
    throw new Error('Base directory is not set in env variable "APP_ALBUM_ROOT_PATH"');
  }

  if (!fs.existsSync(baseDirectory)) {
    throw new Error(`Base directory not exists at path ${baseDirectory}`);
  }

  const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active', 'Disabled'] } } });
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
  const updateData: any = {};

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
      album,
      metadataStatus: 'New',
    },
  });

  // this may be a long process
  for (const f of filesUnprocessed) {
    console.log(`Create metadata to file ${f.path}`);
    await loadMetadata(f, album);

    const currentTime = process.hrtime(startedOn);
    if (isAppExiting || currentTime[0] > timeoutSec) {
      break;
    }
  }
};
