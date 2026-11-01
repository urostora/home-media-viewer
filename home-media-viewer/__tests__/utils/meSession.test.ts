import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/me';
import { resolveServerSession } from '@/utils/auth/serverSession';
jest.mock('@/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('@/utils/auth/serverSession', () => ({
  ...jest.requireActual('@/utils/auth/serverSession'),
  resolveServerSession: jest.fn(),
}));
beforeEach(() => jest.resetAllMocks());
it('rejects absent session', async () => {
  jest.mocked(resolveServerSession).mockResolvedValue(null);
  const req = { session: { destroy: jest.fn() } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(req.session.destroy).toHaveBeenCalled();
});
it('uses current principal and actual expiry without renewing the absolute lifetime', async () => {
  const user = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Current',
    email: 'reader@example.invalid',
    isAdmin: false,
    status: 'Active' as const,
  };
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    jest.mocked(resolveServerSession).mockResolvedValue({ user, expiresOn: now + 45000 });
    const res = { send: jest.fn() };
    await handler(
      { session: { version: 1, token: 'a'.repeat(64) } } as unknown as NextApiRequest,
      res as unknown as NextApiResponse,
    );
    expect(resolveServerSession).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: user.name,
          email: user.email,
          isAdmin: false,
          sessionExpiresOn: now + 45000,
          sessionExpiresInSeconds: 45,
        },
      }),
    );
  } finally {
    clock.mockRestore();
  }
});
