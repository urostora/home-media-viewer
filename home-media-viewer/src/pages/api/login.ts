import { type LoginRequestType, type LoginResponseDataType } from '@/types/loginTypes';
import { getApiResponse, getApiResponseWithData, getRequestBodyObject } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { verifyPassword } from '@/utils/userHelper';
import { withIronSessionApiRoute } from 'iron-session/next';

import prisma from '@/utils/prisma/prismaImporter';

export default withIronSessionApiRoute(async function loginRoute(req, res) {
  const loginData: LoginRequestType | null = getRequestBodyObject(req, res);

  if (loginData == null) {
    req.session.destroy();
    res.status(400).json(getApiResponse({ ok: false, error: 'Fields "email" and "password" must be set' }));
    return;
  }

  const user = await prisma.user.findFirst({ where: { email: loginData.email } });

  if (user == null) {
    // unknown user
    req.session.destroy();
    console.warn(`Login failed - user not found ${loginData.email}`);
    res
      .setHeader('Reason', 1)
      .status(400)
      .json(getApiResponse({ ok: false, error: 'Invalid email or password' }));
    return;
  }

  if (!(await verifyPassword(loginData.password, user.password))) {
    // invalid password
    req.session.destroy();
    res
      .setHeader('Reason', 2)
      .status(400)
      .json(getApiResponse({ ok: false, error: 'Invalid email or password' }));
    console.warn(`Login failed - wrong password for ${user.email}`);
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
    getApiResponseWithData<LoginResponseDataType>({
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      sessionExpiresOn: new Date().getTime() + sessionOptions.cookieOptions.ttl * 1000,
      sessionExpiresInSeconds: sessionOptions.cookieOptions.ttl * 1000,
    }),
  );
}, getIronSessionOptions());
