import type { NextApiRequest, NextApiResponse } from 'next';
import contentHandler from '@/pages/api/file/content/[id]';
import thumbnailHandler from '@/pages/api/file/thumbnail/[...params]';
import { handleFileResponseByPath } from '@/utils/responseHelper';
import { resolveReadableFile } from '@/utils/auth/readableFile';
import { getReadableThumbnailPath } from '@/utils/thumbnailHelper';
import { logApiFailure } from '@/utils/apiLogger';

jest.mock('@/utils/auth/authenticatedRoute', () => ({ withAuthenticatedRoute: (handler: unknown) => handler }));
jest.mock('@/utils/fileHelper', () => ({ getFullPath: () => '/synthetic/video.mov' }));
jest.mock('@/utils/auth/readableFile', () => ({
    isFileIdentifier: (id: unknown) => id === 'abcdef12-1234-1234-1234-123456789abc',
    resolveReadableFile: jest.fn(),
}));
jest.mock('@/utils/thumbnailHelper', () => ({ getReadableThumbnailPath: jest.fn() }));
jest.mock('@/utils/responseHelper', () => ({ handleFileResponseByPath: jest.fn() }));
jest.mock('@/utils/apiLogger', () => ({ logApiFailure: jest.fn() }));

const id = 'abcdef12-1234-1234-1234-123456789abc';
const routes = [
    { name: 'content', handler: contentHandler, query: { id }, target: '/synthetic/video.mov' },
    {
        name: 'thumbnail',
        handler: thumbnailHandler,
        query: { params: [id, '1280'] },
        target: '/synthetic/thumbnail.jpg',
    },
];
const response = () => ({
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
    destroy: jest.fn(),
    headersSent: false,
    destroyed: false,
});
beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(resolveReadableFile).mockResolvedValue({ id } as NonNullable<
        Awaited<ReturnType<typeof resolveReadableFile>>
    >);
    jest.mocked(getReadableThumbnailPath).mockResolvedValue('/synthetic/thumbnail.jpg');
    jest.mocked(handleFileResponseByPath).mockResolvedValue(undefined);
});

describe.each(routes)('$name delivery', ({ handler, query, target }) => {
    const request = () => ({ method: 'GET', query, authenticatedUser: { id } }) as unknown as NextApiRequest;

    it('awaits streaming completion', async () => {
        let complete!: () => void;
        jest.mocked(handleFileResponseByPath).mockReturnValueOnce(
            new Promise<void>((resolve) => {
                complete = resolve;
            }),
        );
        const res = response();
        let finished = false;
        const pending = Promise.resolve(handler(request(), res as unknown as NextApiResponse)).then(() => {
            finished = true;
        });
        // Both routes await authorization; thumbnail also awaits path resolution.
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(handleFileResponseByPath).toHaveBeenCalledWith(expect.any(Object), res, target);
        expect(finished).toBe(false);
        complete();
        await pending;
        expect(finished).toBe(true);
    });

    it('returns a safe 500 for errors before headers', async () => {
        jest.mocked(handleFileResponseByPath).mockRejectedValueOnce(new Error('synthetic'));
        const res = response();
        await handler(request(), res as unknown as NextApiResponse);
        expect(logApiFailure).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.end).toHaveBeenCalledTimes(1);
        expect(res.destroy).not.toHaveBeenCalled();
    });

    it('destroys a failed response after headers without sending a second body', async () => {
        jest.mocked(handleFileResponseByPath).mockRejectedValueOnce(new Error('synthetic'));
        const res = { ...response(), headersSent: true };
        await handler(request(), res as unknown as NextApiResponse);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.end).not.toHaveBeenCalled();
        expect(res.destroy).toHaveBeenCalledTimes(1);
    });

    it('does not write to an already destroyed response', async () => {
        jest.mocked(handleFileResponseByPath).mockRejectedValueOnce(new Error('synthetic'));
        const res = { ...response(), destroyed: true };
        await handler(request(), res as unknown as NextApiResponse);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.end).not.toHaveBeenCalled();
        expect(res.destroy).not.toHaveBeenCalled();
    });

    it('never starts delivery without readable-file authorization', async () => {
        jest.mocked(resolveReadableFile).mockResolvedValueOnce(null);
        const res = response();
        await handler(request(), res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(handleFileResponseByPath).not.toHaveBeenCalled();
    });
});
