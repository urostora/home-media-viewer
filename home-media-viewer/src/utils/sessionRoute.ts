import { getIronSession } from 'iron-session';
import type { NextApiHandler } from 'next';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import type { SessionData } from '@/types/session';

export const withSessionRoute =
  (handler: NextApiHandler): NextApiHandler =>
  async (req, res) => {
    req.session = await getIronSession<SessionData>(req, res, getIronSessionOptions());
    return handler(req, res);
  };
