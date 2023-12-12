import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { withSessionRoute } from '../sessionRoute';

export const apiOnlyWithAdminUsers = (handler: (req: NextApiRequest, res: NextApiResponse) => (Promise<void> | void)): NextApiHandler => {
  const hocFunction = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    // console.log('apiOnlyWithAdminUsers session', req.session);

    if (req.session?.user?.admin !== true) {
      // not admin user - forbidden
      res.status(403).send('Only administrators allowed');
      return undefined;
    }

    await handler(req, res);
  };

  return withSessionRoute(hocFunction);
};
