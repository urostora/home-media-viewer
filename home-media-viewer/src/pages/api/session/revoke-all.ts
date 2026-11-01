import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';
import { revokeAllSessions } from '@/utils/auth/serverSession';
import { getApiResponse } from '@/utils/apiHelpers';
import { logApiFailure } from '@/utils/apiLogger';

export default withAuthenticatedRoute(async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json(getApiResponse({ ok: false, error: 'Method not allowed' }));
    return;
  }
  try {
    await revokeAllSessions(req.authenticatedUser!.id);
    req.session.destroy();
    res.json(getApiResponse({ ok: true }));
  } catch (error) {
    logApiFailure('revoke all sessions', 503, error);
    res.status(503).json(getApiResponse({ ok: false, error: 'Session revocation unavailable. Please retry.' }));
  }
});
