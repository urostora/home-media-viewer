import { admitLogin, admitLoginAccount, enterLogin } from '@/utils/auth/loginLimiter';
import type { NextApiRequest, NextApiResponse } from 'next';
import createUser from '@/pages/api/user/index';
import editUser from '@/pages/api/user/[id]';
import { verifyLoginPassword } from '@/utils/auth/loginProof';
import login from '@/pages/api/login';
import { issueSession } from '@/utils/auth/serverSession';
import prisma from '@/utils/prisma/prismaImporter';
import { getHashedPassword } from '@/utils/passwordHelper';

jest.mock('../../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../../src/utils/auth/authenticatedRoute', () => ({
    withAuthenticatedRoute: (handler: unknown) => handler,
}));
jest.mock('@/utils/auth/loginProof', () => ({ verifyLoginPassword: jest.fn() }));
jest.mock('../../../src/utils/passwordHelper', () => ({ getHashedPassword: jest.fn(), verifyPassword: jest.fn() }));
jest.mock('../../../src/utils/prisma/prismaImporter', () => ({
    __esModule: true,
    default: {
        $transaction: jest.fn(),
        $queryRaw: jest.fn(),
        authSession: { updateMany: jest.fn() },
        user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    },
}));
jest.mock('@/utils/auth/serverSession', () => ({
    ...jest.requireActual('@/utils/auth/serverSession'),
    issueSession: jest.fn(),
    revokeSession: jest.fn(),
    cleanupSessions: jest.fn(),
}));
jest.mock('../../../src/utils/sessionHelper', () => ({
    getIronSessionOptions: () => ({ cookieOptions: { maxAge: 1209600 } }),
}));

const password = 'Synthetic-P4ssword!_SECRET';
const hash = 'SYNTHETIC_PASSWORD_HASH';
const token = 'SYNTHETIC_SESSION_PROCESS_SECRET';

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
    status: 'Active' as const,
    isAdmin: true,
    name: 'Synthetic user',
    email: 'synthetic@example.invalid',
    password: hash,
    sessionVersion: 0,
};
const body = { name: user.name, email: user.email, password };

const response = () => ({
    status: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
});
const request = (method: string, data: unknown): NextApiRequest =>
    ({
        method,
        body: data,
        query: { id: user.id },
        session: { user: { id: user.id, admin: true }, save: jest.fn(), destroy: jest.fn() },
        authenticatedUser: user,
        socket: { remoteAddress: '127.0.0.1' },
        headers: { cookie: token, authorization: `Bearer ${token}` },
    }) as unknown as NextApiRequest;

let warn: jest.SpyInstance;
let log: jest.SpyInstance;
beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(enterLogin).mockReturnValue(true);
    jest.mocked(admitLogin).mockResolvedValue({ allowed: true, permit: { slot: 0, owner: 'test' } });
    jest.mocked(admitLoginAccount).mockResolvedValue({ allowed: true, retryAfter: 0 });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.mocked(getHashedPassword).mockResolvedValue(hash);
    jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
    jest.mocked(prisma.user.create).mockResolvedValue(user);
    jest.mocked(prisma.user.update).mockResolvedValue(user);
    jest.mocked(prisma.user.findUnique).mockResolvedValue(user);
    jest.mocked(prisma.$queryRaw).mockResolvedValue([{ id: user.id }]);
    jest.mocked(prisma.$transaction).mockImplementation(async (operation: unknown) =>
        (operation as (tx: typeof prisma) => Promise<never>)(prisma),
    );
    jest.mocked(issueSession).mockResolvedValue({ token: 'b'.repeat(64), expiresOn: Date.now() + 1000, user });
});
afterEach(() => jest.restoreAllMocks());

const expectNoCredentials = (res: ReturnType<typeof response>) => {
    const output = JSON.stringify([
        warn.mock.calls,
        log.mock.calls,
        res.end.mock.calls,
        res.send.mock.calls,
        res.json.mock.calls,
    ]);
    for (const secret of [password, hash, token]) expect(output).not.toContain(secret);
};

describe.each([
    { method: 'POST', handler: createUser },
    { method: 'PUT', handler: createUser },
    { method: 'PATCH', handler: editUser },
    { method: 'PUT', handler: editUser },
])('$method user credential handling (%#)', ({ method, handler }) => {
    it('does not log credentials on duplicate-user failure', async () => {
        const res = response();
        await handler(request(method, body), res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.end).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        expect(warn).toHaveBeenCalledTimes(1);
        expectNoCredentials(res);
    });

    it('does not echo submitted name/email values in duplicate-user errors', async () => {
        const res = response();
        await handler(request(method, { ...body, name: password, email: token }), res as unknown as NextApiResponse);
        expect(res.end).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        expectNoCredentials(res);
    });

    it.each([
        { ...body, password: 'weak', extra: { password, hash, token } },
        { ...body, password: { nested: password, toString: (): string => password } },
        { ...body, password: [password] },
        { ...body, isAdmin: password },
        { ...body, status: password },
        '{"password":"' + password,
    ])('omits malformed/invalid payload values (%#)', async (data) => {
        const res = response();
        await handler(request(method, data), res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
        expectNoCredentials(res);
    });

    it('omits exception messages from persistence failures', async () => {
        if (handler === createUser) jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
        const error = new Error(`${password} ${hash} ${token}`);
        jest.mocked(prisma.user.create).mockRejectedValue(error);
        jest.mocked(prisma.user.update).mockRejectedValue(error);
        const res = response();
        await handler(request(method, handler === createUser ? body : { password }), res as unknown as NextApiResponse);
        expect(res.end).toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expectNoCredentials(res);
    });

    it('returns safe account data after a successful write', async () => {
        if (handler === createUser) jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
        const res = response();
        await handler(request(method, handler === createUser ? body : { password }), res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ id: user.id }) }),
        );
        expect(warn).not.toHaveBeenCalled();
        expectNoCredentials(res);
    });
});

it.each(['unknown', 'wrong password', 'database error', 'invalid type', 'malformed JSON'])(
    'keeps login failure safe: %s',
    async (scenario) => {
        if (scenario === 'unknown') jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
        if (scenario === 'database error')
            jest.mocked(prisma.user.findFirst).mockRejectedValue(new Error(`${password} ${hash} ${token}`));
        const res = response();
        const data =
            scenario === 'invalid type'
                ? { email: password, password: { nested: password } }
                : scenario === 'malformed JSON'
                  ? '{"password":"' + password
                  : { email: user.email, password };
        await login(request('POST', data), res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(scenario === 'database error' ? 503 : 400);
        expect(warn).toHaveBeenCalledTimes(1);
        expectNoCredentials(res);
    },
);

it('logs successful login without names, headers, credentials or session contents', async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue({ ...user, name: token });
    jest.mocked(verifyLoginPassword).mockResolvedValue(true);
    const res = response();
    await login(request('POST', { email: user.email, password }), res as unknown as NextApiResponse);
    expect(log).toHaveBeenCalledWith({ event: 'auth.login.success', userId: user.id });
    // Display names are intentionally returned to the logged-in user, but never logged.
    expect(JSON.stringify([log.mock.calls, warn.mock.calls])).not.toMatch(/SYNTHETIC_|Synthetic-P4ssword/);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
});
