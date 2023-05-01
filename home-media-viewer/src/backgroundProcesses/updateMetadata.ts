import { PrismaClient } from '@prisma/client';
import { loadMetadata } from '../utils/fileHelper';
import os from 'os';

const prisma = new PrismaClient();
const threadCount = os.cpus().length;

const doJob = async () => {
  console.log(`Processing metadata (${threadCount} threads available)`);
  const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active'] } } });

  const parallelJobs = [];

  for (const album of activeAlbums) {
    console.log(`Processing album ${album.name} (${album.id})`);

    const filesUnprocessed = await prisma.file.findMany({ where: { AND: [
      { album, status: 'Active' },
      { OR: [
        { metadataStatus: 'New' },
        { isDirectory: true } ]
      }
    ]}});
    console.log(`  ${filesUnprocessed.length} unprocessed files found`);

    let fileIndex = 0;
    for (const file of filesUnprocessed) {
      console.log(`  (${fileIndex}/${filesUnprocessed.length}) processing ${file.isDirectory ? 'directory' : 'file'} ${file.path} (${file.id})`);

      parallelJobs.push(loadMetadata(file, album));

      if (parallelJobs.length >= threadCount) {
        await Promise.all(parallelJobs);
        parallelJobs.splice(0, parallelJobs.length);
      }

      fileIndex++;
    }

    if (parallelJobs.length > 0) {
      await Promise.all(parallelJobs);
      parallelJobs.splice(0, parallelJobs.length);
    }

    console.log(`  Album FINISHED`);
  }
};

doJob().then(() => {
  console.log('PROCESSING FINISHED');
});
