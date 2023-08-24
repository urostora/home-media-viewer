import { PrismaClient } from '@prisma/client';
import os from 'os';
import { loadMetadata } from '@/utils/fileHelper';
import { syncAlbumFiles } from '@/utils/albumHelper';

const prisma = new PrismaClient();
const threadCount = Math.max(1, os.cpus().length - 2);
const processTimeout = Number.parseInt(process.env?.LONG_PROCESS_TIMEOUT_SEC ?? '50');

const doJob = async () => {
  console.log(`Processing metadata (${threadCount} threads available, timeout ${processTimeout}s)`);
  const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active'] } } });
  const startedOn = Date.now();

  const parallelJobs: Promise<boolean>[] = [];

  for (const album of activeAlbums) {
    console.log(`Processing album ${album.name} (${album.id})`);

    console.log('  Sync root files');
    await syncAlbumFiles(album.id);

    console.log('  Getting directories or files with unprocessed metadata');

    const filesUnprocessed = await prisma.file.findMany({
      where: { AND: [{ album, status: 'Active' }, { OR: [{ metadataStatus: 'New' }, { isDirectory: true }] }] },
    });
    console.log(`  ${filesUnprocessed.length} unprocessed files found`);

    let fileIndex = 0;
    for (const file of filesUnprocessed) {
      console.log(
        `  (${fileIndex}/${filesUnprocessed.length}) processing ${file.isDirectory ? 'directory' : 'file'} ${
          file.path
        } (${file.id})`,
      );

      parallelJobs.push(loadMetadata(file, album));

      if (parallelJobs.length >= threadCount) {
        await Promise.all(parallelJobs);
        parallelJobs.splice(0, parallelJobs.length);
      }

      if (startedOn + processTimeout * 1000 < Date.now()) {
        break;
      }

      fileIndex++;
    }

    if (startedOn + processTimeout * 1000 < Date.now()) {
      break;
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
