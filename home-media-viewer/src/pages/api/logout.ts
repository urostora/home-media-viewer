import { getApiResponse } from '@/utils/apiHelpers';
import { withSessionRoute } from '@/utils/sessionRoute';

export default withSessionRoute(function logoutRoute(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send(getApiResponse({ ok: false, error: 'Method not allowed' }));
    return;
  }
  req.session.destroy();
  res.send(getApiResponse({ ok: true }));
});
