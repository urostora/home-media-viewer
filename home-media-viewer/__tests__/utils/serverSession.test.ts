import { createHash } from 'node:crypto';
import prisma from '@/utils/prisma/prismaImporter';
import {
    cleanupSessions,
    issueSession,
    resolveServerSession,
    revokeSession,
    revokeAllSessions,
    sessionExpiryData,
} from '@/utils/auth/serverSession';
import { SESSION_ABSOLUTE_SECONDS, SESSION_IDLE_SECONDS } from '@/utils/auth/sessionPolicy';
import logout from '@/pages/api/logout';
import type { NextApiRequest, NextApiResponse } from 'next';
jest.mock('@/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('@/utils/prisma/prismaImporter', () => ({
    __esModule: true,
    default: {
        $transaction: jest.fn(),
        $queryRaw: jest.fn(),
        user: { findUnique: jest.fn(), update: jest.fn() },
        authSession: {
            findUnique: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
            findMany: jest.fn(),
            deleteMany: jest.fn(),
        },
    },
}));
const token = 'a'.repeat(64);
const cookie = { version: 1 as const, token };
const user = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Synthetic',
    email: 'reader@example.invalid',
    password: 'SYNTHETIC_PASSWORD_HASH',
    isAdmin: false,
    status: 'Active' as const,
    sessionVersion: 4,
};
const now = new Date('2026-11-01T12:00:00Z');
const record = {
    id: 'session-id',
    tokenHash: createHash('sha256').update(token).digest('hex'),
    userId: user.id,
    userVersion: 4,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_SECONDS * 1000),
    idleExpiresAt: new Date(now.getTime() + 10000),
};
beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    jest.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
        (fn as (tx: typeof prisma) => Promise<never>)(prisma),
    );
    jest.mocked(prisma.$queryRaw).mockImplementation((async (query: unknown) => {
        const sql = (query as TemplateStringsArray).join('?');
        if (sql.includes('FROM AuthSession')) return [record];
        if (sql.includes('LOCK IN SHARE MODE')) return [user];
        return [{ id: user.id }];
    }) as unknown as typeof prisma.$queryRaw);
    jest.mocked(prisma.user.findUnique).mockResolvedValue(user);
    jest.mocked(prisma.authSession.findUnique).mockResolvedValue(record);
    jest.mocked(prisma.authSession.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(prisma.authSession.create).mockImplementation(((args: unknown) =>
        Promise.resolve({
            ...record,
            ...(args as { data: object }).data,
        })) as unknown as typeof prisma.authSession.create);
    jest.mocked(prisma.authSession.findMany).mockResolvedValue([]);
});
afterEach(() => {
    jest.restoreAllMocks();
});
it.each([
    undefined,
    {},
    { user: { id: user.id, admin: true } },
    { version: 0, token },
    { version: 1, token: 'invalid' },
    { version: 1, token: 'A'.repeat(64) },
    { version: 1, token: [token] },
])('rejects invalid/legacy seals before database access (%#)', async (data) => {
    expect(await resolveServerSession(data as never)).toBeNull();
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
});
it('stores only token digest, applies both limits and omits secrets from principal', async () => {
    const result = await issueSession(user);
    expect(result?.token).toMatch(/^[a-f0-9]{64}$/);
    const data = jest.mocked(prisma.authSession.create).mock.calls[0][0].data;
    expect(data.tokenHash).toBe(createHash('sha256').update(result!.token).digest('hex'));
    expect(data.expiresAt).toEqual(record.expiresAt);
    expect(data.idleExpiresAt).toEqual(new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000));
    expect(JSON.stringify(result?.user)).not.toMatch(/password|sessionVersion|token/i);
});
it.each([
    { ...user, status: 'Disabled' as const },
    { ...user, status: 'Deleted' as const },
    { ...user, password: 'changed' },
    { ...user, sessionVersion: 5 },
    null,
])('rechecks verified login under account lock (%#)', async (current) => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(current);
    expect(await issueSession(user)).toBeNull();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
});
it.each([
    { ...record, revokedAt: now },
    { ...record, userVersion: 3 },
    { ...record, expiresAt: now },
    { ...record, idleExpiresAt: now },
    null,
])('cannot touch revoked/expired/stale-generation sessions (%#)', async (stored) => {
    jest.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([user])
        .mockResolvedValueOnce(stored === null ? [] : [stored]);
    expect(await resolveServerSession(cookie)).toBeNull();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
});
it('refreshes idle expiry under the lock, retains absolute limit and reports actual expiry', async () => {
    const result = await resolveServerSession(cookie);
    expect(result?.expiresOn).toBe(now.getTime() + SESSION_IDLE_SECONDS * 1000);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: expect.objectContaining({
                revokedAt: null,
                userVersion: user.sessionVersion,
                expiresAt: { gt: now },
                idleExpiresAt: { gt: now },
            }),
        }),
    );
    expect(JSON.stringify(result)).not.toContain(user.password);
});
it('caps idle extension at absolute expiry', async () => {
    const expiresAt = new Date(now.getTime() + 5000);
    jest.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([user])
        .mockResolvedValueOnce([{ ...record, expiresAt }]);
    expect((await resolveServerSession(cookie))?.expiresOn).toBe(expiresAt.getTime());
});
it.each([0, 1])('normalizes a MySQL raw boolean value %s in the current principal', async (isAdmin) => {
    jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ ...user, isAdmin }]);
    expect((await resolveServerSession(cookie))?.user.isAdmin).toBe(isAdmin === 1);
});

it.each(['Disabled', 'Deleted'])('denies %s accounts before locking or refreshing a session', async (status) => {
    jest.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ ...user, status }]);
    expect(await resolveServerSession(cookie)).toBeNull();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
});
it('denies a zero-row conditional activity update', async () => {
    jest.mocked(prisma.authSession.updateMany).mockResolvedValue({ count: 0 });
    expect(await resolveServerSession(cookie)).toBeNull();
});
it('explicit revoke-all increments generation and revokes under the account lock', async () => {
    await revokeAllSessions(user.id);
    expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
    });
});
it('logout revokes only the presented session', async () => {
    await revokeSession(cookie);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: now },
    });
});
it('failed database logout never clears cookie or reports success', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(prisma.authSession.findUnique).mockRejectedValue(new Error('SYNTHETIC_TOKEN_SECRET'));
    const req = { method: 'POST', session: { ...cookie, destroy: jest.fn() } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await logout(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(req.session.destroy).not.toHaveBeenCalled();
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('SYNTHETIC_TOKEN_SECRET');
});
it('cleanup caps selection/deletion and rechecks expiry to protect refreshed rows', async () => {
    jest.mocked(prisma.authSession.findMany).mockResolvedValue([{ id: record.id }] as never);
    await cleanupSessions();
    expect(prisma.authSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, select: { id: true } }),
    );
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: expect.objectContaining({
                id: { in: [record.id] },
                OR: expect.any(Array),
            }),
        }),
    );
});
it('remaining lifetime is actual and never negative', () => {
    expect(sessionExpiryData(now.getTime() + 4500).sessionExpiresInSeconds).toBe(4);
    expect(sessionExpiryData(now.getTime() - 1000).sessionExpiresInSeconds).toBe(0);
});
