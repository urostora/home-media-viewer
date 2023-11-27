import { File } from '@prisma/client';
import { FileProcessor } from './processorFactory';
import { syncFilesInAlbumAndFile } from '../fileHelper';

import prisma from '@/utils/prisma/prismaImporter';

export const directoryFileProcessor: FileProcessor = async (file: File) => {
  if (!file.isDirectory) {
    throw Error(`File ${file.name} is not directory`);
  }

  const albums = await prisma.album.findMany({
    where: { status: { in: ['Active', 'Disabled'] }, files: { some: { id: file.id } } },
  });

  if (albums.length === 0) {
    throw Error('Album not found');
  }

  await syncFilesInAlbumAndFile(albums[0], file);

  return true;
};
