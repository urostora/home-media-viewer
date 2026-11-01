import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/me';
import prisma from '@/utils/prisma/prismaImporter';

jest.mock('../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../src/utils/prisma/prismaImporter', () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: jest.fn(),
    },
  },
}));

beforeEach(() => jest.resetAllMocks());

it('rejects an absent session before querying users', async () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const destroy = jest.fn();
  const request = { session: { destroy } };
  const response = { status, json };
  await handler(request as unknown as NextApiRequest, response as unknown as NextApiResponse);
  expect(status).toHaveBeenCalledWith(403);
  expect(prisma.user.findFirst).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalled();
});

it('uses one lookup for current identity and ignores a stale admin claim', async () => {
  const user = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Current name',
    email: 'current@example.invalid',
    status: 'Active' as const,
    isAdmin: false,
    password: 'not-selected',
  };
  jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
  const res = { send: jest.fn() };
  await handler(
    { session: { user: { id: user.id, admin: true } } } as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  expect(res.send).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ name: user.name, email: user.email, isAdmin: false }),
    }),
  );
  expect(JSON.stringify(res.send.mock.calls)).not.toContain('not-selected');
});
