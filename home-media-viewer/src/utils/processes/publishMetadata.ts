import { randomUUID } from 'node:crypto';
import { Prisma, type File } from '@prisma/client';
import prisma from '../prisma/prismaImporter';
import type { ExtractedMetadata } from '../fileProcessor/metadata';
import { MetaType } from '../metaUtils';
import { assertSourceVersion } from './sourceIdentity';
import { retryMetadataTransaction } from './retryMetadataTransaction';
import type { Stats } from 'node:fs';

const batchSize = 128;
// Fixed identifiers only. All metadata values, keys and IDs are bound parameters.
const valueColumns = ['type', 'intValue', 'floatValue', 'stringValue', 'dateValue', 'latitude', 'longitude'];
const assignments = Prisma.join(
  valueColumns.map((column) =>
    Prisma.raw(`\`${column}\` = IF(\`origin\` = 'Extracted', VALUES(\`${column}\`), \`${column}\`)`),
  ),
);

export const publishMetadata = async (
  file: File,
  source: { stat: Stats; version: string },
  extracted: ExtractedMetadata | undefined,
): Promise<void> => {
  // Media extraction and the initial source check happen before opening a transaction.
  await assertSourceVersion(file, source.version);
  await retryMetadataTransaction(async () =>
    prisma.$transaction(async (transaction) => {
      const existing = await transaction.fileMeta.findMany({
        where: { fileId: file.id },
        select: { id: true, metaKey: true, origin: true, dateValue: true },
      });
      const protectedValues = existing.filter((value) => value.origin !== 'Extracted');
      const protectedKeys = new Set(protectedValues.map((value) => value.metaKey));
      const entries = [...(extracted?.entries ?? [])].filter(([key]) => !protectedKeys.has(key));
      const keys = new Set(entries.map(([key]) => key));
      const ids = new Map(existing.map((value) => [value.metaKey, value.id]));
      // Concrete primary keys avoid broad/empty range locks between different files.
      const removed = existing.filter((value) => value.origin === 'Extracted' && !keys.has(value.metaKey));
      for (let offset = 0; offset < removed.length; offset += batchSize) {
        await transaction.fileMeta.deleteMany({
          where: { id: { in: removed.slice(offset, offset + batchSize).map((value) => value.id) } },
        });
      }
      for (let offset = 0; offset < entries.length; offset += batchSize) {
        const rows = entries.slice(offset, offset + batchSize).map(
          ([key, value]) =>
            Prisma.sql`(${ids.get(key) ?? randomUUID()}, ${file.id}, ${key}, ${value.type}, 'Extracted',
            ${value.intValue}, ${value.floatValue}, ${value.stringValue}, ${value.dateValue}, ${value.latitude}, ${value.longitude})`,
        );
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO \`FileMeta\` (\`id\`, \`fileId\`, \`metaKey\`, \`type\`, \`origin\`,
            \`intValue\`, \`floatValue\`, \`stringValue\`, \`dateValue\`, \`latitude\`, \`longitude\`)
          VALUES ${Prisma.join(rows)} ON DUPLICATE KEY UPDATE ${assignments}
        `);
      }
      const protectedDate = protectedValues.find((value) => value.metaKey === MetaType.DateTime);
      // Recheck source identity before publication; no decoding/probing holds DB locks.
      await assertSourceVersion(file, source.version);
      const result = await transaction.file.updateMany({
        where: { id: file.id },
        data: {
          size: source.stat.size,
          createdAt: source.stat.ctime,
          modifiedAt: source.stat.mtime,
          contentDate:
            protectedDate !== undefined
              ? (protectedDate.dateValue ?? file.contentDate)
              : (extracted?.contentDate ?? null),
          metadataStatus: extracted === undefined ? 'NotSupported' : 'Processed',
          metadataProcessedAt: new Date(),
          metadataProcessingError: null,
          metadataSourceVersion: source.version,
        },
      });
      if (result.count !== 1) throw new Error('Metadata target disappeared');
    }),
  );
};
