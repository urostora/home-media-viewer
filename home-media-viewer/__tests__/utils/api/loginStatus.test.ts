import { admitLogin, admitLoginAccount, enterLogin } from '@/utils/auth/loginLimiter';
import type { NextApiRequest, NextApiResponse } from 'next';
import login from '@/pages/api/login';
import { issueSession, revokeSession } from '@/utils/auth/serverSession';
import prisma from '@/utils/prisma/prismaImporter';
import { verifyLoginPassword } from '@/utils/auth/loginProof';

jest.mock('../../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../../src/utils/prisma/prismaImporter', () => ({
    __esModule: true,
    default: { user: { findFirst: jest.fn() } },
}));
jest.mock('@/utils/auth/loginProof', () => ({ verifyLoginPassword: jest.fn() }));
jest.mock('@/utils/auth/serverSession', () => ({
    issueSession: jest.fn(),
    revokeSession: jest.fn(),
    cleanupSessions: jest.fn(),
    sessionExpiryData: () => ({ sessionExpiresOn: 1, sessionExpiresInSeconds: 1 }),
}));
jest.mock('../../../src/utils/sessionHelper', () => ({
    getIronSessionOptions: () => ({ cookieOptions: { maxAge: 1209600 } }),
}));

jest.mock('@/utils/auth/loginLimiter', () => ({
    admitLogin: jest.fn(),
    admitLoginAccount: jest.fn(),
    releaseLogin: jest.fn(),
    cleanupLoginBudgets: jest.fn(),
    enterLogin: jest.fn(),
    leaveLogin: jest.fn(),
}));

const user = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Synthetic user',
    email: 'user@example.invalid',
    password: 'synthetic-hash',
    status: 'Active' as const,
    isAdmin: true,
    sessionVersion: 0,
};
const response = () => ({
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
    send: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
});
const request = () => ({
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    body: { email: user.email, password: 'synthetic-password' },
    session: { user: { id: user.id, admin: true }, save: jest.fn(), destroy: jest.fn() },
});
beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(enterLogin).mockReturnValue(true);
    jest.mocked(admitLogin).mockResolvedValue({ allowed: true, permit: { slot: 0, owner: 'test' } });
    jest.mocked(admitLoginAccount).mockResolvedValue({ allowed: true, retryAfter: 0 });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.mocked(verifyLoginPassword).mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

it.each([null, { ...user, status: 'Disabled' as const }, { ...user, status: 'Deleted' as const }])(
    'does not create a new session for unknown/inactive accounts (%j)',
    async (record) => {
        jest.mocked(prisma.user.findFirst).mockResolvedValue(record);
        const req = request();
        const res = response();
        await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.end).toHaveBeenCalledWith('Error in login: Invalid email or password');
        expect(req.session.destroy).toHaveBeenCalledTimes(1);
        expect(req.session.save).not.toHaveBeenCalled();
        expect(verifyLoginPassword).toHaveBeenCalledTimes(1);
    },
);

it('keeps the same failure for an active account with the wrong password', async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
    jest.mocked(verifyLoginPassword).mockResolvedValue(false);
    const req = request();
    const res = response();
    await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.end).toHaveBeenCalledWith('Error in login: Invalid email or password');
    expect(req.session.save).not.toHaveBeenCalled();
    expect(req.session.destroy).toHaveBeenCalledTimes(1);
});

it.each([false, true])('authenticates an active account using its current role (%j)', async (isAdmin) => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue({ ...user, isAdmin });
    jest.mocked(issueSession).mockResolvedValue({ token: 'a'.repeat(64), expiresOn: 1, user: { ...user, isAdmin } });
    const req = request();
    const res = response();
    await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(req.session.save).toHaveBeenCalledTimes(1);
    expect(req.session.user).toBeUndefined();
    expect((req.session as unknown as { token: string }).token).toBe('a'.repeat(64));
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isAdmin }) }));
});

it('rejects a verification invalidated before session issuance', async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
    jest.mocked(issueSession).mockResolvedValue(null);
    const req = request();
    const res = response();
    await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(req.session.save).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith('Error in login: Invalid email or password');
});
it('revokes an issued session if its browser cookie cannot be saved', async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
    jest.mocked(issueSession).mockResolvedValue({ token: 'c'.repeat(64), expiresOn: 1, user });
    const req = request();
    const res = response();
    req.session.save.mockRejectedValue(new Error('SYNTHETIC_SAVE_SECRET'));
    await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(revokeSession).toHaveBeenCalledWith({ version: 1, token: 'c'.repeat(64) });
    expect(res.send).not.toHaveBeenCalled();
    expect(JSON.stringify(res.end.mock.calls)).not.toContain('SYNTHETIC_SAVE_SECRET');
});
