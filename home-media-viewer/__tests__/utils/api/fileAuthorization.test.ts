import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/file/[id]/index';
import { deleteFile, getFileById, updateFile } from '@/utils/fileHelper';

jest.mock('../../../src/utils/auth/authenticatedRoute', () => ({
    withAuthenticatedRoute: (handler: unknown) => handler,
}));
jest.mock('../../../src/utils/thumbnailHelper', () => ({ getFileThumbnailInBase64: () => null }));
jest.mock('../../../src/utils/fileHelper', () => ({
    getFileById: jest.fn(),
    updateFile: jest.fn(),
    deleteFile: jest.fn(),
    fileUpdateDataSchema: [{ field: 'status', valuesAllowed: ['Active', 'Disabled', 'Deleted'] }],
}));

const file = { id: 'shared-file', status: 'Active' } as NonNullable<Awaited<ReturnType<typeof getFileById>>>;
const reader = { id: 'reader', isAdmin: false };
const administrator = { id: 'administrator', isAdmin: true };

const response = () => {
    // Sending a response does not stop execution: mutations after denial must be detected.
    const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
    };
    return res;
};

const request = (method: string, authenticatedUser: unknown, body: unknown = { status: 'Deleted' }): NextApiRequest =>
    ({ method, query: { id: file.id }, authenticatedUser, body }) as unknown as NextApiRequest;

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getFileById).mockResolvedValue(file);
    jest.mocked(updateFile).mockResolvedValue({ ...file, status: 'Deleted' });
});

describe.each(['PATCH', 'DELETE'])('%s shared file authorization', (method) => {
    it.each([undefined, {}, { id: 'reader' }, reader, { id: 'reader', isAdmin: 'true' }])(
        'rejects a request without administrator authority (%j) without writing',
        async (session) => {
            const res = response();

            await handler(request(method, session), res as unknown as NextApiResponse);

            expect(res.status).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.send).toHaveBeenCalledWith('Only administrators allowed');
            expect(res.json).not.toHaveBeenCalled();
            expect(updateFile).not.toHaveBeenCalled();
            expect(deleteFile).not.toHaveBeenCalled();
        },
    );

    it('does not mutate an inaccessible or missing file', async () => {
        jest.mocked(getFileById).mockResolvedValueOnce(null);
        const res = response();

        await handler(request(method, reader), res as unknown as NextApiResponse);

        expect(getFileById).toHaveBeenCalledWith(file.id, reader.id);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(updateFile).not.toHaveBeenCalled();
        expect(deleteFile).not.toHaveBeenCalled();
    });
});

it.each(['Active', 'Disabled', 'Deleted'])('prevents an album reader from PATCHing status to %s', async (status) => {
    const res = response();

    await handler(request('PATCH', reader, { status }), res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
});

it.each(['Active', 'Disabled', 'Deleted'] as const)('allows an administrator to PATCH status to %s', async (status) => {
    jest.mocked(updateFile).mockResolvedValueOnce({ ...file, status });
    const res = response();

    await handler(request('PATCH', administrator, { status }), res as unknown as NextApiResponse);

    expect(getFileById).toHaveBeenCalledWith(file.id, undefined);
    expect(updateFile).toHaveBeenCalledTimes(1);
    expect(updateFile).toHaveBeenCalledWith(file.id, { status });
    expect(deleteFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, data: { ...file, status } }));
});

it('allows an administrator to DELETE a file', async () => {
    const res = response();

    await handler(request('DELETE', administrator), res as unknown as NextApiResponse);

    expect(getFileById).toHaveBeenCalledWith(file.id, undefined);
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith(file);
    expect(updateFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, id: file.id }));
});

it.each([reader, administrator])('preserves permitted GET access (%j)', async (session) => {
    const res = response();

    await handler(request('GET', session), res as unknown as NextApiResponse);

    expect(getFileById).toHaveBeenCalledWith(file.id, session.isAdmin ? undefined : session.id);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, data: { ...file, thumbnail: null } }));
    expect(updateFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
});
