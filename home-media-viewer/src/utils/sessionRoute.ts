import { withIronSessionApiRoute } from 'iron-session/next';

import type { NextApiRequest, NextApiHandler, NextApiResponse } from 'next';

import { getIronSessionOptions } from '@/utils/sessionHelper';
import type { UserSessionData } from '@/types/api/userTypes';
import { getUserDataFromRequest } from './auth/userSessionDataProvider';

export const withSessionRoute = (handler: NextApiHandler): NextApiHandler => {
  const bearerTokenApiRequestHandler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const user: UserSessionData | undefined = req?.session?.user;

    if (typeof user?.id !== 'string') {
      const authTokenUser = await getUserDataFromRequest(req);
      if (authTokenUser !== undefined) {
        // set session value manually
        req.session = { user: authTokenUser, save: async (): Promise<void> => {}, destroy: (): void => {} };
        handler(req, res);
        return;
      }
    }

    withIronSessionApiRoute(handler, getIronSessionOptions())(req, res);
  };

  return bearerTokenApiRequestHandler;
};
