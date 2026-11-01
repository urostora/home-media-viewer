import handler from '@/pages/api/logout';
import type { NextApiRequest, NextApiResponse } from 'next';
jest.mock('@/utils/sessionRoute', () => ({ withSessionRoute: (fn: unknown) => fn }));
test.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', undefined, 'POST'])(
  'logout method %s',
  async (method) => {
    const destroy = jest.fn();
    const req = { method, session: { destroy } } as unknown as NextApiRequest;
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };
    await handler(req, res as unknown as NextApiResponse);
    expect(destroy).toHaveBeenCalledTimes(method === 'POST' ? 1 : 0);
    if (method !== 'POST') {
      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    }
  },
);
