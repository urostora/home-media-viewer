import type { NextApiHandler } from 'next';
import { withSessionRoute } from '@/utils/sessionRoute';
import { getApiResponse } from '@/utils/apiHelpers';
import { logApiFailure } from '@/utils/apiLogger';
import { resolveServerSession } from './serverSession';

export const withAuthenticatedRoute = (handler: NextApiHandler): NextApiHandler =>
  withSessionRoute(async (req, res) => {
    delete req.authenticatedUser;
    delete req.sessionExpiresOn;
    let identity;
    try {
      identity = await resolveServerSession(req.session);
    } catch (error) {
      logApiFailure('authenticate user', 503, error);
      res.status(503).json(getApiResponse({ ok: false, error: 'Authentication unavailable' }));
      return;
    }

    if (identity === null) {
      req.session.destroy();
      res.status(403).json(getApiResponse({ ok: false, error: 'Forbidden' }));
      return;
    }

    req.authenticatedUser = identity.user;
    req.sessionExpiresOn = identity.expiresOn;
    return handler(req, res);
  });
