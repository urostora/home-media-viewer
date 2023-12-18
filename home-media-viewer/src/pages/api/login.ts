import { withIronSessionApiRoute } from 'iron-session/next';

import { HmvError, getApiResponseWithData, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { getIronSessionOptions } from '@/utils/sessionHelper';
import { verifyPassword } from '@/utils/userHelper';

import { type LoginRequestType, type LoginResponseDataType } from '@/types/loginTypes';
import { type DataValidatorSchema, validateData } from '@/utils/dataValidator';

import prisma from '@/utils/prisma/prismaImporter';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const schema: DataValidatorSchema = [
    { field: 'email', isRequired: true },
    { field: 'password', isRequired: true },
  ];

  try {
    const loginData = getRequestBodyObject<LoginRequestType>(req, res);
    validateData(loginData, schema);

    const user = await prisma.user.findFirst({ where: { email: loginData.email } });

    if (user == null) {
      // unknown user
      req.session.destroy();
      throw new HmvError(`Login failed - wrong password for ${loginData.email} [IP: ${req.socket.remoteAddress}]`, {
        publicMessage: 'Invalid email or password',
      });
    }

    if (!(await verifyPassword(loginData.password, user.password))) {
      // invalid password
      req.session.destroy();
      throw new HmvError(`Login failed - wrong password for ${user.email} [IP: ${req.socket.remoteAddress}]`, {
        publicMessage: 'Invalid email or password',
      });
    }

    const sessionOptions = getIronSessionOptions();

    req.session.user = {
      id: user?.id,
      admin: user?.isAdmin ?? false,
    };
    await req.session.save();
    console.log(`User ${user.name} logged in [IP: ${req.socket.remoteAddress}]`);

    res.send(
      getApiResponseWithData<LoginResponseDataType>({
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        sessionExpiresOn: new Date().getTime() + (sessionOptions?.cookieOptions?.maxAge ?? 24 * 60 * 60) * 1000,
        sessionExpiresInSeconds: (sessionOptions?.cookieOptions?.maxAge ?? 24 * 60 * 60) * 1000,
      }),
    );
  } catch (e) {
    handleApiError(res, 'login', e);
  }
};

export default withIronSessionApiRoute(handler, getIronSessionOptions());
