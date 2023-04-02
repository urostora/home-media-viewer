import { Album, File, Prisma, PrismaClient, Status } from "@prisma/client";

const prisma = new PrismaClient();

export const addIntMeta = (file: File, metaKey: string, value: number) => {
    prisma.fileMeta.upsert({
        where: {
            fileId_metaKey: {
                fileId: file.id,
                metaKey: metaKey,
            },       
        },
        update: {
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
}

export const addStringMeta = (file: File, metaKey: string, value: string) => {
    prisma.fileMeta.upsert({
        where: {
            fileId_metaKey: {
                fileId: file.id,
                metaKey: metaKey,
            },       
        },
        update: {
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
}

export const addFloatMeta = (file: File, metaKey: string, value: number) => {
    prisma.fileMeta.upsert({
        where: {
            fileId_metaKey: {
                fileId: file.id,
                metaKey: metaKey,
            },       
        },
        update: {
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
}

export const addDateMeta = (file: File, metaKey: string, value: Date) => {
    prisma.fileMeta.upsert({
        where: {
            fileId_metaKey: {
                fileId: file.id,
                metaKey: metaKey,
            },       
        },
        update: {
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
}

export const addPositionMeta = (file: File, metaKey: string, latitude: number, longitude: number) => {
    prisma.fileMeta.upsert({
        where: {
            fileId_metaKey: {
                fileId: file.id,
                metaKey: metaKey,
            },       
        },
        update: {
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
            type: 'Float',
            intValue: null,
            floatValue: null,
            stringValue: null,
            dateValue: null,
            latitude,
            longitude,
        },
    });
}
