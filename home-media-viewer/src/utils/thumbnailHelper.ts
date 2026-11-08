import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { thumbnailRoot } from './storagePaths';

import type { EntityType } from '@/types/api/generalTypes';
import { thumbnailSize } from '@/utils/frontend/thumbnailUtils';

export const getThumbnailDirectory = (fileId: string, createDirectory: boolean = true): string => {
    let ret = thumbnailRoot();

    // fileId is uuid like 75d29234-a251-4d83-bce4-99ca3db7e984
    const dirRegex = /^(?<dir1>[a-f0-9]{2})(?<dir2>[a-f0-9]{2})(?<dir3>[a-f0-9]{2})(?<dir4>[a-f0-9]{2})/i;
    const match = dirRegex.exec(fileId);

    if (match?.groups !== undefined) {
        ret += `/${match.groups.dir1}/${match.groups.dir2}/${match.groups.dir3}/${match.groups.dir4}`;
    }

    if (createDirectory && !existsSync(ret)) {
        mkdirSync(ret, { recursive: true });
    }

    return ret;
};

export const getFileThumbnailDirectory = (file: EntityType): string => {
    return getThumbnailDirectory(file.id);
};

export const getFileIdThumbnailPath = (fileId: string, size: number, createDirectory: boolean = true): string => {
    const root = thumbnailRoot();
    const result = path.resolve(getThumbnailDirectory(fileId, createDirectory), `${fileId}_${Math.round(size)}.jpg`);
    if (!result.startsWith(`${root}${path.sep}`)) throw new Error('Invalid thumbnail path');
    return result;
};

export const getReadableThumbnailPath = async (fileId: string, size: number): Promise<string | null> => {
    const candidate = getFileIdThumbnailPath(fileId, size, false);
    try {
        const [root, resolved] = await Promise.all([realpath(thumbnailRoot()), realpath(candidate)]);
        if (!resolved.startsWith(`${root}${path.sep}`)) return null;
        return (await stat(resolved)).isFile() ? resolved : null;
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        )
            return null;
        throw error;
    }
};

export const getFileThumbnailPath = (file: EntityType, size: number): string => {
    return getFileIdThumbnailPath(file.id, size);
};

export const getFileThumbnailInBase64 = (file: EntityType): string | null => {
    const path = getFileIdThumbnailPath(file.id, thumbnailSize.small, false);

    if (existsSync(path)) {
        // read binary data from file
        const bitmap = readFileSync(path);
        // convert the binary data to base64 encoded string
        return bitmap.toString('base64');
    }

    return null;
};
