import { withIronSessionApiRoute } from 'iron-session/next';
import { NextApiHandler } from 'next';
import { getIronSessionOptions } from '@/utils/sessionHelper';

export const withSessionRoute = (handler: NextApiHandler) => withIronSessionApiRoute(handler, getIronSessionOptions());
