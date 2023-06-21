import { LoginRequestType } from '@/types/loginTypes';
import { getApiResponse } from '@/utils/apiHelpers';
import { getRequestBodyObject } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { verifyPassword } from '@/utils/userHelper';
import { PrismaClient } from '@prisma/client';
import { withIronSessionApiRoute } from 'iron-session/next';

const prisma = new PrismaClient();

export default withIronSessionApiRoute(async function loginRoute(req, res) {
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

  const sessionOptions = getIronSessionOptions();

  req.session.user = {
    id: user?.id,
    admin: user?.isAdmin ?? false,
  };
  await req.session.save();
  console.log(`User ${user.name} logged in`);
  res.send(
    getApiResponse({
      ok: true,
      data: {
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        sessionExpiresOn: new Date().getTime() + sessionOptions.cookieOptions.ttl * 1000,
        sessionExpiresInSeconds: sessionOptions.cookieOptions.ttl * 1000,
      },
    }),
  );
}, getIronSessionOptions());
