import type { NextApiRequest, NextApiResponse } from 'next';
import login from '@/pages/api/login';
import { admitLogin, admitLoginAccount, enterLogin, leaveLogin, releaseLogin } from '@/utils/auth/loginLimiter';
import { verifyLoginPassword } from '@/utils/auth/loginProof';
import prisma from '@/utils/prisma/prismaImporter';
import { issueSession } from '@/utils/auth/serverSession';
jest.mock('@/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('@/utils/prisma/prismaImporter', () => ({ __esModule: true, default: { user: { findFirst: jest.fn() } } }));
jest.mock('@/utils/auth/loginProof', () => ({ verifyLoginPassword: jest.fn() }));
jest.mock('@/utils/auth/loginLimiter', () => ({
  admitLogin: jest.fn(),
  admitLoginAccount: jest.fn(),
  releaseLogin: jest.fn(),
  enterLogin: jest.fn(),
  leaveLogin: jest.fn(),
  cleanupLoginBudgets: jest.fn(),
}));
jest.mock('@/utils/auth/serverSession', () => ({
  issueSession: jest.fn(),
  revokeSession: jest.fn(),
  cleanupSessions: jest.fn(),
  sessionExpiryData: jest.fn(),
}));
const request = () => ({
  method: 'POST',
  headers: {},
  socket: { remoteAddress: '127.0.0.1' },
  body: { email: 'reader@example.invalid', password: 'SYNTHETIC_PASSWORD' },
  session: { destroy: jest.fn(), save: jest.fn() },
});
const response = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
  send: jest.fn(),
  end: jest.fn(),
  setHeader: jest.fn(),
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.mocked(enterLogin).mockReturnValue(true);
  jest.mocked(admitLogin).mockResolvedValue({ allowed: true, permit: { slot: 0, owner: 'synthetic' } });
  jest.mocked(admitLoginAccount).mockResolvedValue({ allowed: true, retryAfter: 0 });
  jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());
const run = async (req = request(), res = response()): Promise<ReturnType<typeof response>> => {
  await login(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
it.each(['GET', 'HEAD', 'PUT', 'DELETE'])('rejects method %s before admission', async (method) => {
  const req = request();
  req.method = method;
  const res = await run(req);
  expect(res.status).toHaveBeenCalledWith(405);
  expect(enterLogin).not.toHaveBeenCalled();
});
it.each(['local', 'client', 'account'])(
  'rate-limits %s with Retry-After and no credential/session work',
  async (layer) => {
    if (layer === 'local') jest.mocked(enterLogin).mockReturnValue(false);
    if (layer === 'client') jest.mocked(admitLogin).mockResolvedValue({ allowed: false, retryAfter: 60 });
    if (layer === 'account') jest.mocked(admitLoginAccount).mockResolvedValue({ allowed: false, retryAfter: 300 });
    const req = request();
    const res = await run(req);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(verifyLoginPassword).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
    expect(req.session.destroy).not.toHaveBeenCalled();
    expect(releaseLogin).toHaveBeenCalledTimes(layer === 'account' ? 1 : 0);
    expect(leaveLogin).toHaveBeenCalledTimes(layer === 'local' ? 0 : 1);
  },
);
it.each(['admission', 'account', 'proof', 'release'])(
  'fails closed on %s error with safe 503 and retained session',
  async (layer) => {
    const error = new Error('SYNTHETIC_PASSWORD_TOKEN_SECRET');
    if (layer === 'admission') jest.mocked(admitLogin).mockRejectedValue(error);
    if (layer === 'account') jest.mocked(admitLoginAccount).mockRejectedValue(error);
    if (layer === 'proof') jest.mocked(verifyLoginPassword).mockRejectedValue(error);
    if (layer === 'release') jest.mocked(releaseLogin).mockRejectedValue(error);
    const req = request();
    const res = await run(req);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(req.session.destroy).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
    expect(leaveLogin).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify([res.json.mock.calls, jest.mocked(console.warn).mock.calls, jest.mocked(console.log).mock.calls]),
    ).not.toContain('SYNTHETIC_');
  },
);
it('releases global permit after failed credential work', async () => {
  const req = request();
  await run(req);
  expect(verifyLoginPassword).toHaveBeenCalledTimes(1);
  expect(releaseLogin).toHaveBeenCalledTimes(1);
  expect(req.session.destroy).toHaveBeenCalledTimes(1);
});
it.each([
  { email: 'x'.repeat(1025), password: 'secret' },
  { email: 'reader@example.invalid', password: 'x'.repeat(1048577) },
])('checks lengths before DB or bcrypt (%#)', async (body) => {
  const req = request();
  req.body = body;
  const res = await run(req);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(admitLogin).not.toHaveBeenCalled();
  expect(verifyLoginPassword).not.toHaveBeenCalled();
});
