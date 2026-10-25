import { getApiResponse } from '@/utils/apiHelpers';
import { withSessionRoute } from '@/utils/sessionRoute';

export default withSessionRoute(function logoutRoute(req, res) {
  req.session.destroy();
  res.send(getApiResponse({ ok: true }));
});
