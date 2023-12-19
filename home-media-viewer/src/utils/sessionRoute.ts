import { withIronSessionApiRoute } from 'iron-session/next';
import { type NextApiHandler } from 'next';
import { getIronSessionOptions } from '@/utils/sessionHelper';

export const withSessionRoute = (handler: NextApiHandler): NextApiHandler =>
  withIronSessionApiRoute(handler, getIronSessionOptions());
