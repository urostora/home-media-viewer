import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { withAuthenticatedRoute } from './authenticatedRoute';

export const apiOnlyWithAdminUsers = (
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void,
): NextApiHandler => {
    const hocFunction = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
        if (req.authenticatedUser?.isAdmin !== true) {
            // not admin user - forbidden
            res.status(403).send('Only administrators allowed');
            return undefined;
        }

        await handler(req, res);
    };

    return withAuthenticatedRoute(hocFunction);
};
