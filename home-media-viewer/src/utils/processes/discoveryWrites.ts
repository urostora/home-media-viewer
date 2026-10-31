import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import prisma from '../prisma/prismaImporter';

export interface DiscoveryWrites {
  created: Prisma.FileCreateManyInput[];
  updated: { id: string; data: Prisma.FileUpdateManyMutationInput }[];
  memberships: { albumId: string; fileId: string }[];
  directories: string[];
}

// Called for at most eight statted entries. A checkpoint never advances past an
// uncommitted group, and failed groups leave no partial rows or memberships.
export const writeDiscoveryBatch = async (batch: DiscoveryWrites): Promise<void> => {
  if (Object.values(batch).every((values) => values.length === 0)) return;
  await prisma.$transaction(async (transaction) => {
    if (batch.created.length > 0) await transaction.file.createMany({ data: batch.created });
    for (const { id, data } of batch.updated) {
      const result = await transaction.file.updateMany({ where: { id }, data });
      if (result.count !== 1) throw new Error('Discovery target disappeared');
    }
    for (let offset = 0; offset < batch.memberships.length; offset += 128) {
      const rows = batch.memberships
        .slice(offset, offset + 128)
        .map(({ albumId, fileId }) => Prisma.sql`(${albumId}, ${fileId})`);
      // This is the existing implicit AlbumFiles relation (A=Album, B=File).
      // Ignore only duplicate membership keys; other constraint errors must roll back.
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO \`_AlbumFiles\` (\`A\`, \`B\`) VALUES ${Prisma.join(rows)}
        ON DUPLICATE KEY UPDATE \`B\` = VALUES(\`B\`)
      `);
    }
    if (batch.directories.length > 0) {
      await transaction.discoveryDirectory.createMany({
        data: batch.directories.map((directory) => ({
          id: createHash('sha256').update(directory).digest('hex'),
          path: directory,
        })),
        skipDuplicates: true,
      });
    }
  });
};
