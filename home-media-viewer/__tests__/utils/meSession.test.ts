import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/me';

jest.mock('../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../src/utils/prisma/prismaImporter', () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: jest.fn(() => {
        throw new Error('Unauthenticated requests must not query users');
      }),
    },
  },
}));

it('rejects an absent session before querying users', async () => {
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ send });
  const request = { session: {} };
  const response = { status, send };
  await handler(request as NextApiRequest, response as unknown as NextApiResponse);
  expect(status).toHaveBeenCalledWith(403);
});
