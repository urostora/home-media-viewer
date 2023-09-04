import { syncAlbumFiles } from '@/utils/albumHelper';
import { loadMetadata } from '@/utils/fileHelper';

import prisma from '@/utils/prisma/prismaImporter';

const updateMetadataProcess = {
  update: async (processTimeout: number = 50, threadCount: number = 2, albumToProcess: string | null = null) => {
    console.log(`Processing metadata (${threadCount} threads available, timeout ${processTimeout}s)`);
    const activeAlbums = await prisma.album.findMany({ where: { status: { in: ['Active'] } } });
    const startedOn = Date.now();

    const parallelJobs: Promise<boolean>[] = [];

    for (const album of activeAlbums) {
      if (typeof albumToProcess === 'string' && albumToProcess !== album.id) {
        continue;
      }

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
  },
};

export default updateMetadataProcess;
