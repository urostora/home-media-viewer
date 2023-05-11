import { Album, File, MetadataProcessingStatus, PrismaClient, Prisma, Status } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getFileProcessor } from '@/utils/fileProcessor/processorFactory';
import { FileSearchType } from '@/types/api/fileTypes';
import { getDateTimeFilter } from '@/utils/utils';
import { getFileThumbnailInBase64 } from '@/utils/thumbnailHelper';

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

  console.log(`Syncronize directory ${directoryPath}`);

  const dbFiles = await prisma.file.findMany({ where: { albumId: album.id, parentFile: parentFile } });
  const dbFileNames = dbFiles.map((f: File) => f.name + (f.extension.length > 0 ? `.${f.extension}` : ''));
  const dirFiles = fs.readdirSync(directoryPath);

  console.log('Files in directory', dirFiles);
  console.log('Stored files in db', dbFileNames);

  const filesToDelete = dbFiles.filter((f: File) => {
    const fullName = f.name + (f.extension.length > 0 ? `.${f.extension}` : '');
    console.log(`  Check if album file (${fullName}) exists in directory`);
    return !dirFiles.includes(fullName);
  });

  const filesToAdd = dirFiles.filter((name) => !dbFileNames.includes(name));

  if (filesToAdd.length > 0) {
    console.log('Files to add:', filesToAdd);
  }

  filesToDelete.forEach(async (f: File) => {
    console.log(`  Delete file ${f.path}`);
    await prisma.file.update({ where: { id: f.id }, data: { status: 'Deleted' } });
  });

  filesToAdd.forEach(async (fileName: string) => {
    const fullPath = `${directoryPath}/${fileName}`;
    console.log(`  Add file ${fullPath}`);
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

export const updateThumbnailDate = async (file: File, date?: Date) => {
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

export const getFiles = async (params: FileSearchType) => {
  const filter: Prisma.FileWhereInput = {
    albumId: params?.album?.id,
    parentFileId: params?.parentFileId,
    name: typeof params?.name !== 'string' ? undefined : { contains: params.name },
    extension: params?.extension,
    modifiedAt: getDateTimeFilter(params?.fileDate),
    contentDate: getDateTimeFilter(params?.contentDate),
    metadataStatus: params.metadataStatus,
  };

  console.log(filter);

  const results = await prisma.$transaction([
    prisma.file.count({ where: filter }),
    prisma.file.findMany({
      where: filter,
      take: params.take ?? 10,
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

  const fileList = results[1].map((fileData) => {
    const thumbnailData = getFileThumbnailInBase64(fileData);
    return {
      ...fileData,
      thumbnail: thumbnailData,
    };
  });

  return {
    count: results[0],
    data: fileList,
  };
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
      console.log(`    Processing metadata for file ${file.path}`);
      ok = await metadataProcessor(file, fileAlbum);
      console.log('    Metadata processed');
    } catch (e) {
      ok = false;
      error = `${e}`;
      console.log('Metadata processor error', e);
    }

    console.log('    Updating file data');

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
      
      console.log('    File data updated');
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
