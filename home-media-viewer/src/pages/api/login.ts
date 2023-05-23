import { LoginRequestType } from '@/types/loginTypes';
import { getApiResponse } from '@/utils/apiHelpers';
import { getRequestBodyObject } from '@/utils/apiHelpers';
import { verifyPassword } from '@/utils/userHelper';
import { PrismaClient } from '@prisma/client';
import { withIronSessionApiRoute } from 'iron-session/next';

const prisma = new PrismaClient();

export default withIronSessionApiRoute(
  async function loginRoute(req, res) {
    const loginData: LoginRequestType | null = getRequestBodyObject(req, res) as LoginRequestType;
    if (loginData == null) {
      await req.session.destroy();
      res.send(getApiResponse({ ok: false, error: 'Fields "email" and "password" must be set' }));
      return;
    }

    const user = await prisma.user.findFirst({ where: { email: loginData.email } });

    if (user == null) {
      // unknown user
      await req.session.destroy();
      res.setHeader('Reason', 1).send(getApiResponse({ ok: false, error: 'Invalid email or password' }));
      return;
    }

    if (!(await verifyPassword(loginData.password, user.password))) {
      // invalid password
      await req.session.destroy();
      res.setHeader('Reason', 2).send(getApiResponse({ ok: false, error: 'Invalid email or password' }));
      return;
    }

    req.session.user = {
      id: user?.id,
      admin: true,
    };
    await req.session.save();
    console.log(`User ${user.name} logged in`);
    res.send(getApiResponse({ ok: true }));
  },
  {
    cookieName: 'home-media-viewer-user-cookie',
    password: process.env.APP_SESSION_SECRET ?? '98765432101234567890abcdefghijkl',
    // secure: true should be used in production (HTTPS) but can't be used in development (HTTP)
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
    },
  },
);
