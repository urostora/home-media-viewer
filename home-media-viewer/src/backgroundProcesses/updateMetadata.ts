import { PrismaClient } from '@prisma/client';
import { loadMetadata } from '../utils/fileHelper';

const prisma = new PrismaClient();

const doJob = async () => {
  const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active'] } } });

  for (const album of activeAlbums) {
    console.log(`Processing album ${album.name} (${album.id})`);

    const filesUnprocessed = await prisma.file.findMany({ where: { album, status: 'Active', metadataStatus: 'New' } });
    console.log(`  ${filesUnprocessed.length} unprocessed files found`);

    let fileIndex = 0;
    for (const file of filesUnprocessed) {
      console.log(`  (${fileIndex}/${filesUnprocessed.length}) processing file ${file.path} (${file.id})`);

      await loadMetadata(file, album);

      fileIndex++;
    }
    console.log(`  Album FINISHED`);
  }
};

doJob().then(() => {
  console.log('PROCESSING FINISHED');
});
