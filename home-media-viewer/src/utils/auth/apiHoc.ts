import { NextApiRequest, NextApiResponse } from 'next';
import { withSessionRoute } from '../sessionRoute';

export const apiOnlyWithAdminUsers = (handler: (req: NextApiRequest, res: NextApiResponse) => void) => {
  const hocFunction = (req: NextApiRequest, res: NextApiResponse) => {
    // console.log('apiOnlyWithAdminUsers session', req.session);

    if (req.session?.user?.admin !== true) {
      // not admin user - forbidden
      res.status(403).send('Only administrators allowed');
      return;
    }

    handler(req, res);
  };

  return withSessionRoute(hocFunction);
};
