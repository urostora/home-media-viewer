import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/file/thumbnail/[...params]';
import prisma from '@/utils/prisma/prismaImporter';
import { getReadableThumbnailPath } from '@/utils/thumbnailHelper';
import { handleFileResponseByPath } from '@/utils/responseHelper';

jest.mock('../../../src/utils/auth/authenticatedRoute', () => ({
    withAuthenticatedRoute: (handler: unknown) => handler,
}));
jest.mock('../../../src/utils/prisma/prismaImporter', () => ({
    __esModule: true,
    default: { file: { findFirst: jest.fn() } },
}));
jest.mock('../../../src/utils/thumbnailHelper', () => ({ getReadableThumbnailPath: jest.fn() }));
jest.mock('../../../src/utils/responseHelper', () => ({ handleFileResponseByPath: jest.fn() }));

const file = { id: 'abcdef12-1234-1234-1234-123456789abc', status: 'Active' } as NonNullable<
    Awaited<ReturnType<typeof prisma.file.findFirst>>
>;
const reader = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Reader',
    email: 'reader@example.invalid',
    status: 'Active',
    isAdmin: false,
};
const response = () => ({ status: jest.fn().mockReturnThis(), end: jest.fn(), setHeader: jest.fn() });
const request = (params: unknown = [file.id, '200'], authenticatedUser: unknown = reader, method = 'GET') =>
    ({ method, query: { params }, authenticatedUser }) as unknown as NextApiRequest;

beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.file.findFirst).mockResolvedValue(file);
    jest.mocked(getReadableThumbnailPath).mockResolvedValue('/synthetic/thumbnail.jpg');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it.each(['200', '600', '1280'])('serves size %s after checking current reader membership', async (size) => {
    const res = response();
    await handler(request([file.id, size]), res as unknown as NextApiResponse);
    expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: {
            id: file.id,
            status: { not: 'Deleted' },
            albums: { some: { status: { not: 'Deleted' }, users: { some: { id: reader.id } } } },
        },
    });
    expect(getReadableThumbnailPath).toHaveBeenCalledWith(file.id, Number(size));
    expect(handleFileResponseByPath).toHaveBeenCalledTimes(1);
    expect(jest.mocked(prisma.file.findFirst).mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(getReadableThumbnailPath).mock.invocationCallOrder[0],
    );
});

it('allows the current administrator without a membership filter, still excluding deleted files', async () => {
    await handler(request([file.id, '600'], { ...reader, isAdmin: true }), response() as unknown as NextApiResponse);
    expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: file.id, status: { not: 'Deleted' }, albums: undefined },
    });
    expect(handleFileResponseByPath).toHaveBeenCalledTimes(1);
});

it('uses the database identifier for path resolution after case-insensitive UUID lookup', async () => {
    await handler(request([file.id.toUpperCase(), '200']), response() as unknown as NextApiResponse);
    expect(getReadableThumbnailPath).toHaveBeenCalledWith(file.id, 200);
});

it('does no filesystem work for an inaccessible, revoked, deleted or missing file', async () => {
    jest.mocked(prisma.file.findFirst).mockResolvedValue(null);
    const res = response();
    await handler(request(), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith('File not found');
    expect(getReadableThumbnailPath).not.toHaveBeenCalled();
    expect(handleFileResponseByPath).not.toHaveBeenCalled();
});

it.each([
    null,
    { status: 'Active' },
    { ...reader, id: '' },
    { ...reader, status: 'Disabled' },
    { ...reader, status: 'Deleted' },
])('rejects a missing/inactive principal before resource access (%#)', async (principal) => {
    const res = response();
    await handler(request([file.id, '200'], principal), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404); // The real auth wrapper returns 403 before the handler.
    expect(prisma.file.findFirst).not.toHaveBeenCalled();
    expect(getReadableThumbnailPath).not.toHaveBeenCalled();
    expect(handleFileResponseByPath).not.toHaveBeenCalled();
});

it.each([
    undefined,
    'invalid',
    [],
    [file.id],
    [file.id, '200', 'extra'],
    [null, '200'],
    ['../outside', '200'],
    ['%2e%2e%2foutside', '200'],
    [file.id + '/extra', '200'],
    [file.id + '%2fextra', '200'],
    ...['0', '-200', '201', 'NaN', 'Infinity', '200x', '200.0', '0200', '+200', '2e2', ' 200', '200 ', ''].map(
        (size) => [file.id, size],
    ),
])('rejects invalid IDs/size/segments without any resource or filesystem access (%#)', async (params) => {
    const res = response();
    await handler(
        { method: 'GET', query: { params }, authenticatedUser: reader } as unknown as NextApiRequest,
        res as unknown as NextApiResponse,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.end).toHaveBeenCalledWith('Invalid thumbnail parameters');
    expect(prisma.file.findFirst).not.toHaveBeenCalled();
    expect(getReadableThumbnailPath).not.toHaveBeenCalled();
    expect(handleFileResponseByPath).not.toHaveBeenCalled();
});

it('returns 404 for a missing, non-file or escaped thumbnail without streaming', async () => {
    jest.mocked(getReadableThumbnailPath).mockResolvedValue(null);
    const res = response();
    await handler(request(), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(handleFileResponseByPath).not.toHaveBeenCalled();
});

it.each(['lookup', 'filesystem'])('fails closed without exposing internal %s errors', async (stage) => {
    const error = new Error('/private/SYNTHETIC_SECRET_PATH');
    if (stage === 'lookup') jest.mocked(prisma.file.findFirst).mockRejectedValue(error);
    else jest.mocked(getReadableThumbnailPath).mockRejectedValue(error);
    const res = response();
    await handler(request(), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('Thumbnail unavailable');
    expect(handleFileResponseByPath).not.toHaveBeenCalled();
    if (stage === 'lookup') expect(getReadableThumbnailPath).not.toHaveBeenCalled();
    expect(JSON.stringify([res.end.mock.calls, jest.mocked(console.warn).mock.calls])).not.toContain(
        'SYNTHETIC_SECRET_PATH',
    );
});

it('rejects unsupported methods without accessing resources or disk', async () => {
    const res = response();
    await handler(request([file.id, '200'], reader, 'POST'), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', ['GET']);
    expect(prisma.file.findFirst).not.toHaveBeenCalled();
    expect(getReadableThumbnailPath).not.toHaveBeenCalled();
});
