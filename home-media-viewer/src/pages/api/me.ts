import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponse, getApiResponseWithData } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';

import type { LoginResponseDataType } from '@/types/loginTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const user = req.authenticatedUser;
  if (user === undefined) {
    res.status(403).send(getApiResponse({ ok: false, error: 'No user is authenticated' }));
    return;
  }

  const sessionDurationSeconds = getIronSessionOptions().cookieOptions?.maxAge ?? 14 * 24 * 60 * 60;

  res.send(
    getApiResponseWithData<LoginResponseDataType>({
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      sessionExpiresOn: Date.now() + sessionDurationSeconds * 1000,
      sessionExpiresInSeconds: sessionDurationSeconds,
    }),
  );
};

export default withAuthenticatedRoute(handler);
