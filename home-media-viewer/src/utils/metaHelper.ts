import prisma from '@/utils/prisma/prismaImporter';

import type { File } from '@prisma/client';

export const addIntMeta = async (file: File, metaKey: string, value: number): Promise<void> => {
  await prisma.fileMeta.upsert({
    where: {
      fileId_metaKey: {
        fileId: file.id,
        metaKey,
      },
    },
    update: {
      type: 'Int',
      intValue: Math.round(value),
      floatValue: null,
      stringValue: null,
      dateValue: null,
      latitude: null,
      longitude: null,
    },
    create: {
      fileId: file.id,
      metaKey,
      type: 'Int',
      intValue: Math.round(value),
      floatValue: null,
      stringValue: null,
      dateValue: null,
      latitude: null,
      longitude: null,
    },
  });
};

export const addStringMeta = async (file: File, metaKey: string, value: string): Promise<void> => {
  await prisma.fileMeta.upsert({
    where: {
      fileId_metaKey: {
        fileId: file.id,
        metaKey,
      },
    },
    update: {
      type: 'String',
      intValue: null,
      floatValue: null,
      stringValue: value,
      dateValue: null,
      latitude: null,
      longitude: null,
    },
    create: {
      fileId: file.id,
      metaKey,
      type: 'String',
      intValue: null,
      floatValue: null,
      stringValue: value,
      dateValue: null,
      latitude: null,
      longitude: null,
    },
  });
};

export const addFloatMeta = async (file: File, metaKey: string, value: number): Promise<void> => {
  await prisma.fileMeta.upsert({
    where: {
      fileId_metaKey: {
        fileId: file.id,
        metaKey,
      },
    },
    update: {
      type: 'Float',
      intValue: null,
      floatValue: value,
      stringValue: null,
      dateValue: null,
      latitude: null,
      longitude: null,
    },
    create: {
      fileId: file.id,
      metaKey,
      type: 'Float',
      intValue: null,
      floatValue: value,
      stringValue: null,
      dateValue: null,
      latitude: null,
      longitude: null,
    },
  });
};

export const addDateMeta = async (file: File, metaKey: string, value: Date): Promise<void> => {
  await prisma.fileMeta.upsert({
    where: {
      fileId_metaKey: {
        fileId: file.id,
        metaKey,
      },
    },
    update: {
      type: 'DateTime',
      intValue: null,
      floatValue: null,
      stringValue: null,
      dateValue: value,
      latitude: null,
      longitude: null,
    },
    create: {
      fileId: file.id,
      metaKey,
      type: 'Float',
      intValue: null,
      floatValue: null,
      stringValue: null,
      dateValue: value,
      latitude: null,
      longitude: null,
    },
  });
};

export const addPositionMeta = async (
  file: File,
  metaKey: string,
  latitude: number,
  longitude: number,
): Promise<void> => {
  await prisma.fileMeta.upsert({
    where: {
      fileId_metaKey: {
        fileId: file.id,
        metaKey,
      },
    },
    update: {
      type: 'Location',
      intValue: null,
      floatValue: null,
      stringValue: null,
      dateValue: null,
      latitude,
      longitude,
    },
    create: {
      fileId: file.id,
      metaKey,
      type: 'Location',
      intValue: null,
      floatValue: null,
      stringValue: null,
      dateValue: null,
      latitude,
      longitude,
    },
  });
};
