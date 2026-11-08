import { retryRead } from '../prisma/retryRead';
import type { File } from '@prisma/client';
import prisma from '@/utils/prisma/prismaImporter';
import type { CurrentUser } from './currentUser';

export const isFileIdentifier = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export const resolveReadableFile = async (id: string, user: CurrentUser | undefined): Promise<File | null> => {
    if (user?.status !== 'Active' || !isFileIdentifier(user.id) || !isFileIdentifier(id)) return null;

    return retryRead(() =>
        prisma.file.findFirst({
            where: {
                id,
                status: { not: 'Deleted' },
                albums:
                    user.isAdmin === true
                        ? undefined
                        : {
                              some: { status: { not: 'Deleted' }, users: { some: { id: user.id } } },
                          },
            },
        }),
    );
};
