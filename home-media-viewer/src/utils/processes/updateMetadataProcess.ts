import { syncAlbumFiles } from '@/utils/albumHelper';
import { loadMetadata } from '@/utils/fileHelper';

import prisma from '@/utils/prisma/prismaImporter';

const updateMetadataProcess = {
  update: async (processTimeout: number = 50, threadCount: number = 2, albumToProcess: string | null = null) => {
    const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active'] } } });
    const startedOn = Date.now();

    const parallelJobs: Promise<boolean>[] = [];

    console.log(`[${(new Date()).toLocaleDateString('hu-HU')} ${(new Date()).toLocaleTimeString('hu-HU')}] updateMetadataProcess started with ${threadCount} threads, time limit is ${processTimeout} (${activeAlbums.length} albums found)`);

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      try {
        await syncAlbumFiles(album.id);
      } catch(e) {
        console.error(`  ERROR while syncing album ${album.name} (${album.id}) files: ${e}`);
      }
    }

    console.log('  Album files syncronized, loading metadata');

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      const filesUnprocessed = await prisma.file.findMany({
        where: { AND: [{ albumId: album.id, status: 'Active' }, { OR: [{ metadataStatus: 'New' }, { isDirectory: true }] }] },
      });

      if (filesUnprocessed.length === 0) {
        continue;
      }

      console.log(`  ${filesUnprocessed.length} unprocessed files found in album ${album.name} (${album.id})`);

      let fileIndex = 0;
      for (const file of filesUnprocessed) {
        parallelJobs.push(loadMetadata(file, album));

        if (parallelJobs.length >= threadCount) {
          try {
            await Promise.all(parallelJobs);
          } catch(e) {
            console.error(`  ERROR whole loading metadata: ${e}`);
          }

          parallelJobs.splice(0, parallelJobs.length);

          if (startedOn + processTimeout * 1000 < Date.now()) {
            break;
          }
        }

        fileIndex++;
      }

      if (parallelJobs.length > 0) {
        try {
          await Promise.all(parallelJobs);
        } catch(e) {
          console.error(`  ERROR whole loading metadata: ${e}`);
        }
        
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
    console.log(`[${(new Date()).toLocaleDateString('hu-HU')} ${(new Date()).toLocaleTimeString('hu-HU')}] updateMetadataProcess finished in ${processingTimeInSec}s`);
  },
};

export default updateMetadataProcess;
