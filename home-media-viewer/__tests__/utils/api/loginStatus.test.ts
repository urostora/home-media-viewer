import type { NextApiRequest, NextApiResponse } from 'next';
import login from '@/pages/api/login';
import prisma from '@/utils/prisma/prismaImporter';
import { verifyPassword } from '@/utils/userHelper';

jest.mock('../../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../../src/utils/prisma/prismaImporter', () => ({
  __esModule: true,
  default: { user: { findFirst: jest.fn() } },
}));
jest.mock('../../../src/utils/userHelper', () => ({ verifyPassword: jest.fn() }));
jest.mock('../../../src/utils/sessionHelper', () => ({
  getIronSessionOptions: () => ({ cookieOptions: { maxAge: 1209600 } }),
}));

const user = {
  id: '12345678-1234-1234-1234-123456789abc',
  name: 'Synthetic user',
  email: 'user@example.invalid',
  password: 'synthetic-hash',
  status: 'Active' as const,
  isAdmin: true,
};
const response = () => ({ status: jest.fn().mockReturnThis(), end: jest.fn(), send: jest.fn() });
const request = () => ({
  body: { email: user.email, password: 'synthetic-password' },
  session: { user: { id: user.id, admin: true }, save: jest.fn(), destroy: jest.fn() },
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.mocked(verifyPassword).mockResolvedValue(true);
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
    expect(verifyPassword).not.toHaveBeenCalled();
  },
);

it('keeps the same failure for an active account with the wrong password', async () => {
  jest.mocked(prisma.user.findFirst).mockResolvedValue(user);
  jest.mocked(verifyPassword).mockResolvedValue(false);
  const req = request();
  const res = response();
  await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  expect(res.end).toHaveBeenCalledWith('Error in login: Invalid email or password');
  expect(req.session.save).not.toHaveBeenCalled();
  expect(req.session.destroy).toHaveBeenCalledTimes(1);
});

it.each([false, true])('authenticates an active account using its current role (%j)', async (isAdmin) => {
  jest.mocked(prisma.user.findFirst).mockResolvedValue({ ...user, isAdmin });
  const req = request();
  const res = response();
  await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  expect(req.session.save).toHaveBeenCalledTimes(1);
  expect(req.session.user).toEqual({ id: user.id, admin: isAdmin });
  expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isAdmin }) }));
});
