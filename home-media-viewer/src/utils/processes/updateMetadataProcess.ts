import { syncAlbumFiles } from '@/utils/albumHelper';
import { loadMetadata } from '@/utils/fileHelper';

import prisma from '@/utils/prisma/prismaImporter';

const updateMetadataProcess = {
  update: async (processTimeout: number = 50, threadCount: number = 2, albumToProcess: string | null = null) => {
    const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active'] } } });
    const startedOn = Date.now();

    const parallelJobs: Promise<boolean>[] = [];

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      await syncAlbumFiles(album.id);

      const filesUnprocessed = await prisma.file.findMany({
        where: { AND: [{ album, status: 'Active' }, { OR: [{ metadataStatus: 'New' }, { isDirectory: true }] }] },
      });

      if (filesUnprocessed.length === 0) {
        continue;
      }

      // console.log(`  ${filesUnprocessed.length} unprocessed files found in album ${album.name}`);

      let fileIndex = 0;
      for (const file of filesUnprocessed) {
        parallelJobs.push(loadMetadata(file, album));

        if (parallelJobs.length >= threadCount) {
          await Promise.all(parallelJobs);
          parallelJobs.splice(0, parallelJobs.length);

          if (startedOn + processTimeout * 1000 < Date.now()) {
            break;
          }
        }

        fileIndex++;
      }

      if (parallelJobs.length > 0) {
        await Promise.all(parallelJobs);
        parallelJobs.splice(0, parallelJobs.length);
      }

      if (startedOn + processTimeout * 1000 < Date.now()) {
        const timedOutAfter = Math.floor((Date.now() - startedOn) / 1000);
        console.log(`UpdateMetadataProcess timed out after ${timedOutAfter}s`)
        break;
      }

      // console.log(`  Album ${album.name} processing finished`);
    }

    const processingTimeInSec = Math.floor((Date.now() - startedOn) / 1000);
    console.log(`[${(new Date()).toLocaleDateString()}] updateMetadataProcess finished in ${processingTimeInSec}s with ${threadCount} threads`);
  },
};

export default updateMetadataProcess;
