import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponse, getApiResponseWithData } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { withSessionRoute } from '@/utils/sessionRoute';

import type { LoginResponseDataType } from '@/types/loginTypes';

import prisma from '@/utils/prisma/prismaImporter';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const isAuthenticated = req?.session?.user?.id != null;

  if (!isAuthenticated == null) {
    res.status(403).send(getApiResponse({ ok: false, error: 'No user is authenticated' }));
    return;
  }

  const userId = req.session.user?.id;
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (user == null) {
    // unknown user
    res.status(403).send(getApiResponse({ ok: false, error: `User (${userId}) not found` }));
    return;
  }

  res.send(
    getApiResponseWithData<LoginResponseDataType>({
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      sessionExpiresOn: new Date().getTime() + getIronSessionOptions().cookieOptions.ttl,
      sessionExpiresInSeconds: getIronSessionOptions().cookieOptions.ttl,
    }),
  );
};

export default withSessionRoute(handler);
