import { getApiResponse } from '@/utils/apiHelpers';
import { logApiFailure } from '@/utils/apiLogger';
import { revokeSession } from '@/utils/auth/serverSession';
import { withSessionRoute } from '@/utils/sessionRoute';

export default withSessionRoute(async function logoutRoute(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send(getApiResponse({ ok: false, error: 'Method not allowed' }));
    return;
  }
  try {
    await revokeSession(req.session);
  } catch (error) {
    logApiFailure('logout', 503, error);
    res.status(503).send(getApiResponse({ ok: false, error: 'Logout unavailable. Please retry.' }));
    return;
  }
  req.session.destroy();
  res.send(getApiResponse({ ok: true }));
});
