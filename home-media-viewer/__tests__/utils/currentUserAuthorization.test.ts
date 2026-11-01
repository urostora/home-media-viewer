import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';
import { apiOnlyWithAdminUsers } from '@/utils/auth/apiHoc';
import { resolveCurrentUser } from '@/utils/auth/currentUser';
import prisma from '@/utils/prisma/prismaImporter';

jest.mock('../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../src/utils/prisma/prismaImporter', () => ({
  __esModule: true,
  default: { user: { findFirst: jest.fn() } },
}));

const user = {
  id: '12345678-1234-1234-1234-123456789abc',
  name: 'Synthetic reader',
  email: 'reader@example.invalid',
  status: 'Active' as const,
  isAdmin: false,
  password: 'not-selected',
};
const response = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
});
const request = (sessionUser: unknown) => ({
  session: { user: sessionUser, destroy: jest.fn() },
  authenticatedUser: { ...user, isAdmin: true },
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it.each([undefined, null, false, 1, 'user', [], {}, { id: '' }, { id: ['id'] }, { id: 'not-a-uuid', admin: true }])(
  'rejects malformed session identity without a query (%j)',
  async (sessionUser) => {
    const req = request(sessionUser);
    const res = response();
    const protectedHandler = jest.fn();
    await withAuthenticatedRoute(protectedHandler)(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(req.session.destroy).toHaveBeenCalledTimes(1);
    expect(req.authenticatedUser).toBeUndefined();
    expect(protectedHandler).not.toHaveBeenCalled();
  },
);

it.each([null, { ...user, status: 'Disabled' as const }, { ...user, status: 'Deleted' as const }])(
  'rejects a missing/inactive user with an old administrator cookie (%j)',
  async (currentUser) => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(currentUser);
    const req = request({ id: user.id, admin: true });
    const res = response();
    const protectedHandler = jest.fn();
    await apiOnlyWithAdminUsers(protectedHandler)(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(req.session.destroy).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(protectedHandler).not.toHaveBeenCalled();
  },
);

it.each([withAuthenticatedRoute, apiOnlyWithAdminUsers])(
  'fails closed on lookup errors without disclosing details (%#)',
  async (wrap) => {
    jest.mocked(prisma.user.findFirst).mockRejectedValue(new Error('SYNTHETIC_SESSION_SECRET'));
    const req = request({ id: user.id, admin: true });
    const res = response();
    const protectedHandler = jest.fn();
    await wrap(protectedHandler)(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(protectedHandler).not.toHaveBeenCalled();
    expect(req.authenticatedUser).toBeUndefined();
    expect(req.session.destroy).not.toHaveBeenCalled();
    expect(JSON.stringify([res.json.mock.calls, jest.mocked(console.warn).mock.calls])).not.toContain(
      'SYNTHETIC_SESSION_SECRET',
    );
  },
);

it('denies a demoted administrator before invoking the protected handler', async () => {
  const protectedHandler = jest.fn();
  const res = response();
  await apiOnlyWithAdminUsers(protectedHandler)(
    request({ id: user.id, admin: true }) as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(res.status).toHaveBeenCalledWith(403);
  expect(protectedHandler).not.toHaveBeenCalled();
});

it.each([false, undefined, 'true'])(
  'allows current administrator authority despite stale cookie role (%j)',
  async (admin) => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue({ ...user, isAdmin: true });
    const protectedHandler = jest.fn();
    const req = request({ id: user.id, admin });
    await apiOnlyWithAdminUsers(protectedHandler)(
      req as unknown as NextApiRequest,
      response() as unknown as NextApiResponse,
    );
    expect(protectedHandler).toHaveBeenCalledTimes(1);
    expect(req.authenticatedUser?.isAdmin).toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  },
);

it('allows an active reader and selects only the needed account fields', async () => {
  const protectedHandler = jest.fn();
  const req = request({ id: user.id, admin: true });
  await withAuthenticatedRoute(protectedHandler)(
    req as unknown as NextApiRequest,
    response() as unknown as NextApiResponse,
  );
  expect(protectedHandler).toHaveBeenCalledTimes(1);
  expect(req.authenticatedUser?.isAdmin).toBe(false);
  expect(prisma.user.findFirst).toHaveBeenCalledWith({
    where: { id: user.id },
    select: { id: true, name: true, email: true, isAdmin: true, status: true },
  });
});

it('does not reuse user authority between requests', async () => {
  const session = { user: { id: user.id, admin: true } };
  expect(await resolveCurrentUser(session)).toEqual(user);
  jest.mocked(prisma.user.findFirst).mockResolvedValue({ ...user, status: 'Disabled' });
  expect(await resolveCurrentUser(session)).toBeNull();
  expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  expect(await resolveCurrentUser(undefined)).toBeNull();
});
