import { syncAlbumFiles } from '@/utils/albumHelper';
import { loadMetadata } from '@/utils/fileHelper';

import prisma from '@/utils/prisma/prismaImporter';

const isDevEnv = process.env.NODE_ENV !== 'production';

const updateMetadataProcess = {
  update: async (processTimeout: number = 50, threadCount: number = 2, albumToProcess: string | null = null) => {
    if (isDevEnv) {
      threadCount = 1;
    }

    const activeAlbums = await prisma.album.findMany({
      where: { id: albumToProcess ?? undefined, status: { in: ['Active', 'Disabled'] } },
      orderBy: { basePath: 'asc' },
    });

    const startedOn = Date.now();

    const parallelJobs: Promise<boolean>[] = [];

    console.log(
      `[${new Date().toLocaleDateString('hu-HU')} ${new Date().toLocaleTimeString('hu-HU')}] updateMetadataProcess${
        isDevEnv ? ' (DEV settings)' : ''
      } started with ${threadCount} threads, time limit is ${processTimeout} (${activeAlbums.length} albums found)`,
    );

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      try {
        await syncAlbumFiles(album.id);
      } catch (e) {
        console.error(`  ERROR while syncing album ${album.name} (${album.id}) files: ${e}`);
      }
    }

    console.log('  Album files syncronized, loading metadata');

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      const filesUnprocessed = await prisma.file.findMany({
        where: {
          AND: [
            { albums: { some: { id: album.id } }, status: 'Active' },
            { OR: [{ metadataStatus: 'New' }, { isDirectory: true }] },
          ],
        },
      });

      if (filesUnprocessed.length === 0) {
        continue;
      }

      if (filesUnprocessed.filter((f) => !f.isDirectory).length > 0) {
        console.log(`  ${filesUnprocessed.length} unprocessed files found in album ${album.name} (${album.id})`);
      }

      for (const file of filesUnprocessed) {
        parallelJobs.push(loadMetadata(file));

        if (parallelJobs.length >= threadCount) {
          try {
            await Promise.all(parallelJobs);
          } catch (e) {
            console.error(`  ERROR while loading metadata: ${e}`);
          }

          parallelJobs.splice(0, parallelJobs.length);

          if (startedOn + processTimeout * 1000 < Date.now()) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (parallelJobs.length > 0) {
        try {
          await Promise.all(parallelJobs);
        } catch (e) {
          console.error(`  ERROR whole loading metadata: ${e}`);
        }

        parallelJobs.splice(0, parallelJobs.length);
      }

      if (startedOn + processTimeout * 1000 < Date.now()) {
        const timedOutAfter = Math.floor((Date.now() - startedOn) / 1000);
        console.log(`UpdateMetadataProcess timed out after ${timedOutAfter}s`);
        break;
      }

      // console.log(`  Album ${album.name} processing finished`);
    }

    const processingTimeInSec = Math.floor((Date.now() - startedOn) / 1000);
    console.log(
      `[${new Date().toLocaleDateString('hu-HU')} ${new Date().toLocaleTimeString(
        'hu-HU',
      )}] updateMetadataProcess finished in ${processingTimeInSec}s`,
    );
  },
};

export default updateMetadataProcess;
