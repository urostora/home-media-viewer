import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/process/run';
import { respondToProcessing } from '@/utils/processes/processingResponse';

jest.mock('../../../src/utils/sessionRoute', () => ({ withSessionRoute: (handler: unknown) => handler }));
jest.mock('../../../src/utils/processes/processingResponse', () => ({ respondToProcessing: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it.each([undefined, { user: { id: 'ordinary', admin: false } }])(
  'rejects unauthorized direct processing requests (%j)',
  async (session) => {
    const send = jest.fn();
    const status = jest.fn().mockReturnValue({ send });
    await handler({ method: 'POST', session } as NextApiRequest, { status } as unknown as NextApiResponse);
    expect(status).toHaveBeenCalledWith(403);
    expect(respondToProcessing).not.toHaveBeenCalled();
  },
);

it('allows an administrator to request a single-video thumbnail refresh', async () => {
  const body = { fileId: 'video', stages: ['thumbnails'], mode: 'refresh', videoThumbnailTimeSec: 0.25 };
  const res = {} as NextApiResponse;
  await handler({ method: 'POST', session: { user: { admin: true } }, body } as NextApiRequest, res);
  expect(respondToProcessing).toHaveBeenCalledWith(res, body);
});
