import { getApiResponse } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { withSessionRoute } from '@/utils/sessionRoute';
import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const isAuthenticated = req?.session?.user?.id != null;

  if (!isAuthenticated == null) {
    res.status(403).send(getApiResponse({ ok: false, error: 'No user is authenticated' }));
    return;
  }

  const userId = req.session.user?.id;
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (user == null) {
    // unknown user
    res.status(403).send(getApiResponse({ ok: false, error: `User (${userId}) not found` }));
    return;
  }

  res.send(
    getApiResponse({
      ok: true,
      data: {
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        sessionExpiresOn: new Date().getTime() + getIronSessionOptions().cookieOptions.ttl,
      },
    }),
  );
};

export default withSessionRoute(handler);
