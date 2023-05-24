import { getApiResponse } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { withIronSessionApiRoute } from 'iron-session/next';

export default withIronSessionApiRoute(function logoutRoute(req, res) {
  req.session.destroy();
  res.send(getApiResponse({ ok: true }));
}, getIronSessionOptions());
