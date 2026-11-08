import type { NextApiRequest, NextApiResponse } from 'next';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { extname } from 'path';

import mime from 'mime-types';

type ByteRange = { start: number; end: number } | 'unsatisfiable';

const matchesEtag = (header: string, etag: string): boolean => {
    if (header.trim() === '*') return true;
    // Entity tags may contain commas, but cannot contain spaces or quotes inside the opaque value.
    const normalized = header.replace(/[ \t]/g, '');
    const tags = header.match(/(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/g) ?? [];
    return tags.join(',') === normalized && tags.some((tag) => tag.replace(/^W\//, '') === etag.slice(2));
};

// Unsupported or malformed ranges are ignored; valid ranges outside the file are 416.
// BigInt avoids rounding or overflow for arbitrarily large decimal offsets.
const parseRange = (header: string | undefined, size: number): ByteRange | undefined => {
    if (header === undefined) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
    if (match === null || (match[1] === '' && match[2] === '')) return undefined;
    const length = BigInt(size);
    if (match[1] === '') {
        const suffix = BigInt(match[2]);
        if (suffix === BigInt(0) || size === 0) return 'unsatisfiable';
        return { start: Number(suffix >= length ? BigInt(0) : length - suffix), end: size - 1 };
    }
    const start = BigInt(match[1]);
    const requestedEnd = match[2] === '' ? undefined : BigInt(match[2]);
    if (requestedEnd !== undefined && requestedEnd < start) return undefined;
    if (start >= length) return 'unsatisfiable';
    return {
        start: Number(start),
        end: requestedEnd === undefined || requestedEnd >= length ? size - 1 : Number(requestedEnd),
    };
};

export const handleFileResponseByPath = async (
    req: NextApiRequest,
    res: NextApiResponse,
    path: string,
): Promise<void> => {
    if (req.aborted || res.destroyed) return;
    let file;
    try {
        file = await open(path, 'r');
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
        if (!res.destroyed) res.status(404).end('File not found');
        return;
    }

    try {
        // Metadata and bytes come from the same opened file, even if its path is replaced.
        const stat = await file.stat({ bigint: true });
        if (req.aborted || res.destroyed) return;
        if (!stat.isFile()) {
            res.status(404).end('File not found');
            return;
        }
        const size = Number(stat.size);
        if (!Number.isSafeInteger(size)) throw new Error('Unsupported file size');

        // Metadata is a cheap weak validator, not proof of byte-for-byte identity for If-Range.
        const etag = `W/"${createHash('sha256')
            .update(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`)
            .digest('base64url')}"`;
        const lastModified = stat.mtime.toUTCString();
        const existingVary = res.getHeader?.('Vary');
        const vary = (Array.isArray(existingVary) ? existingVary.join(',') : String(existingVary ?? ''))
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        if (!vary.some((value) => value === '*' || value.toLowerCase() === 'cookie')) vary.push('Cookie');
        const headers = {
            'Content-Type': mime.contentType(extname(path)) || 'application/octet-stream',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, no-cache',
            Vary: vary.join(', '),
            ETag: etag,
            'Last-Modified': lastModified,
        };
        const ifNoneMatch = req.headers['if-none-match'];
        const ifModifiedSince = req.headers['if-modified-since'];
        const unchanged =
            ifNoneMatch !== undefined
                ? matchesEtag(ifNoneMatch, etag)
                : ifModifiedSince !== undefined && Date.parse(lastModified) <= Date.parse(ifModifiedSince);
        // Both API callers authenticate and authorize before reaching this conditional response.
        if (unchanged) {
            res.writeHead(304, headers);
            res.end();
            return;
        }
        // Neither a weak ETag nor a filesystem date can safely validate partial recombination.
        const range = parseRange(req.headers['if-range'] === undefined ? req.headers.range : undefined, size);
        if (range === 'unsatisfiable') {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
            res.end();
            return;
        }
        res.writeHead(range === undefined ? 200 : 206, {
            ...headers,
            'Content-Length': range === undefined ? size : range.end - range.start + 1,
            ...(range === undefined ? {} : { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` }),
        });
        if (size === 0) {
            res.end();
            return;
        }

        const controller = new AbortController();
        const onClose = (): void => {
            if (!res.writableFinished) controller.abort();
        };
        res.once('close', onClose);
        try {
            await pipeline(file.createReadStream(range), res, { signal: controller.signal });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (
                !controller.signal.aborted ||
                !['ABORT_ERR', 'ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET'].includes(code ?? '')
            ) {
                throw error;
            }
        } finally {
            res.off('close', onClose);
        }
    } finally {
        // Also covers directories, 416/empty responses, and disconnects during open/stat.
        await file.close();
    }
};
