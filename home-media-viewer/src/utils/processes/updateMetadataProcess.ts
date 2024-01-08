import { syncAlbumFiles } from '@/utils/albumHelper';
import { loadMetadata } from '@/utils/fileHelper';

import prisma from '@/utils/prisma/prismaImporter';
import { isShuttingDownHandler } from '../isShuttingDown';

const isDevEnv = process.env.NODE_ENV !== 'production';

export interface MetadataProcessStatistics {
  isDeveloperEnvironment: boolean;
  threadCount: number;
  processTimeoutInSec: number;
  lastProcessedOn: Date;
  processedAlbumCount: number;
  processedDirectoryCount: number;
  processedFileCount: number;
  directorySyncTimeInMs: number;
  fullProcessingTimeSec: number;
}

export const lastStatistics = (() => {
  let lastStatistics: MetadataProcessStatistics | undefined;

  const getLastStatistics = (): MetadataProcessStatistics | undefined => lastStatistics;
  const setLastStatistics = (newStatistics: MetadataProcessStatistics): void => {
    lastStatistics = newStatistics;
  };

  return {
    getLastStatistics,
    setLastStatistics,
  };
})();

const updateMetadataProcess = {
  update: async (
    processTimeout: number = 50,
    threadCount: number = 2,
    albumToProcess: string | null = null,
  ): Promise<MetadataProcessStatistics | undefined> => {
    if (isDevEnv) {
      threadCount = 1;
    }

    const activeAlbums = await prisma.album.findMany({
      where: { id: albumToProcess ?? undefined, status: { in: ['Active', 'Disabled'] } },
      orderBy: { basePath: 'asc' },
    });

    const startedOn = Date.now();

    const parallelJobs: Array<Promise<boolean>> = [];

    // console.log(
    //   `[${new Date().toLocaleDateString('hu-HU')} ${new Date().toLocaleTimeString('hu-HU')}] updateMetadataProcess${
    //     isDevEnv ? ' (DEV settings)' : ''
    //   } started with ${threadCount} threads, time limit is ${processTimeout} (${activeAlbums.length} albums found)`,
    // );

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      try {
        await syncAlbumFiles(album.id);
      } catch (e) {
        console.error(`  ERROR while syncing album ${album.name} (${album.id}) files: ${e}`);
      }

      if (isShuttingDownHandler.isShuttingDown()) {
        console.log('Exit background process (1) - Shutting down');
        return;
      }
    }

    const directorySyncTimeInMs = Math.floor(Date.now() - startedOn);

    let processedFileCount = 0;
    let processedDirectoryCount = 0;

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

      if (startedOn + processTimeout * 1000 < Date.now()) {
        const timedOutAfter = Math.floor((Date.now() - startedOn) / 1000);
        console.log(`UpdateMetadataProcess timed out after ${timedOutAfter}s`);
        break;
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
        if (file.isDirectory) {
          processedDirectoryCount++;
        } else {
          processedFileCount++;
        }

        parallelJobs.push(loadMetadata(file));

        if (parallelJobs.length >= threadCount) {
          try {
            await Promise.all(parallelJobs);
          } catch (e) {
            console.error(`  ERROR while loading metadata: ${e}`);
          }

          parallelJobs.splice(0, parallelJobs.length);

          if (isShuttingDownHandler.isShuttingDown()) {
            console.log('Exit background process (2) - Shutting down');
            return;
          }

          if (startedOn + processTimeout * 1000 < Date.now()) {
            break;
          }

          if (isDevEnv) {
            // decrease load on dev environment
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
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

      if (isShuttingDownHandler.isShuttingDown()) {
        console.log('Exit background process (3) - Shutting down');
        return;
      }

      // console.log(`  Album ${album.name} processing finished`);
    }

    // const processingTimeInSec = Math.floor((Date.now() - startedOn) / 1000);
    // console.log(
    //   `[${new Date().toLocaleDateString('hu-HU')} ${new Date().toLocaleTimeString(
    //     'hu-HU',
    //   )}] updateMetadataProcess finished in ${processingTimeInSec}s`,
    // );

    const processStatistics = {
      isDeveloperEnvironment: isDevEnv,
      lastProcessedOn: new Date(),
      threadCount,
      processTimeoutInSec: processTimeout,
      processedAlbumCount: activeAlbums.length,
      processedDirectoryCount,
      processedFileCount,
      directorySyncTimeInMs,
      fullProcessingTimeSec: Math.floor((Date.now() - startedOn) / 1000),
    };

    lastStatistics.setLastStatistics(processStatistics);

    return processStatistics;
  },
};

export default updateMetadataProcess;
