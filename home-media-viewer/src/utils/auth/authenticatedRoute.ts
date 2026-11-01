import type { NextApiHandler } from 'next';
import { withSessionRoute } from '@/utils/sessionRoute';
import { getApiResponse } from '@/utils/apiHelpers';
import { logApiFailure } from '@/utils/apiLogger';
import { resolveCurrentUser } from './currentUser';

export const withAuthenticatedRoute = (handler: NextApiHandler): NextApiHandler =>
  withSessionRoute(async (req, res) => {
    delete req.authenticatedUser;
    let user;
    try {
      user = await resolveCurrentUser(req.session);
    } catch (error) {
      logApiFailure('authenticate user', 503, error);
      res.status(503).json(getApiResponse({ ok: false, error: 'Authentication unavailable' }));
      return;
    }

    if (user === null) {
      req.session.destroy();
      res.status(403).json(getApiResponse({ ok: false, error: 'Forbidden' }));
      return;
    }

    req.authenticatedUser = user;
    return handler(req, res);
  });
