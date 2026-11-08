import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { resolveServerSession } from '@/utils/auth/serverSession';
import { resolveCurrentUser } from '@/utils/auth/currentUser';
jest.mock('@/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('@/utils/auth/serverSession', () => ({ resolveServerSession: jest.fn() }));
const resolve = jest.mocked(resolveServerSession);
const user = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Reader',
    email: 'reader@example.invalid',
    status: 'Active' as const,
    isAdmin: false,
};
const request = () => ({
    session: { version: 1, token: 'a'.repeat(64), destroy: jest.fn() },
    authenticatedUser: { ...user, isAdmin: true },
    sessionExpiresOn: 99,
});
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() });
beforeEach(() => {
    jest.resetAllMocks();
});
afterEach(() => jest.restoreAllMocks());
it.each([withAuthenticatedRoute, apiOnlyWithAdminUsers])(
    'denies invalid/revoked sessions and discards stale request authority (%#)',
    async (wrap) => {
        resolve.mockResolvedValue(null);
        const req = request();
        const res = response();
        const handler = jest.fn();
        await wrap(handler)(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(req.session.destroy).toHaveBeenCalled();
        expect(req.authenticatedUser).toBeUndefined();
        expect(req.sessionExpiresOn).toBeUndefined();
        expect(handler).not.toHaveBeenCalled();
    },
);
it.each([withAuthenticatedRoute, apiOnlyWithAdminUsers])(
    'fails closed with safe 503 and preserves cookie on outage (%#)',
    async (wrap) => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        resolve.mockRejectedValue(new Error('SYNTHETIC_TOKEN_SECRET'));
        const req = request();
        const res = response();
        const handler = jest.fn();
        await wrap(handler)(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(req.session.destroy).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
        expect(JSON.stringify([res.json.mock.calls, warn.mock.calls])).not.toContain('SYNTHETIC_TOKEN_SECRET');
    },
);
it.each([false, true])('enforces current administrator role %s', async (isAdmin) => {
    resolve.mockResolvedValue({ user: { ...user, isAdmin }, expiresOn: 123 });
    const req = request();
    const res = response();
    const handler = jest.fn();
    await apiOnlyWithAdminUsers(handler)(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(handler).toHaveBeenCalledTimes(isAdmin ? 1 : 0);
    if (!isAdmin) expect(res.status).toHaveBeenCalledWith(403);
});
it('attaches current principal and actual expiry once per request', async () => {
    resolve.mockResolvedValue({ user, expiresOn: 123 });
    const req = request();
    const handler = jest.fn();
    await withAuthenticatedRoute(handler)(req as unknown as NextApiRequest, response() as unknown as NextApiResponse);
    expect(req.authenticatedUser).toEqual(user);
    expect(req.sessionExpiresOn).toBe(123);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalled();
});
it('current-user helper never caches resolved authority', async () => {
    resolve.mockResolvedValueOnce({ user, expiresOn: 123 }).mockResolvedValueOnce(null);
    const cookie = { version: 1 as const, token: 'a'.repeat(64) };
    expect(await resolveCurrentUser(cookie)).toEqual(user);
    expect(await resolveCurrentUser(cookie)).toBeNull();
});
it('handler exceptions are not converted into authentication failures', async () => {
    resolve.mockResolvedValue({ user, expiresOn: 123 });
    await expect(
        withAuthenticatedRoute(async () => {
            throw new Error('handler');
        })(request() as unknown as NextApiRequest, response() as unknown as NextApiResponse),
    ).rejects.toThrow('handler');
});
