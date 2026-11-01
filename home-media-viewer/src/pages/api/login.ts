import { withSessionRoute } from '@/utils/sessionRoute';

import { HmvError, getApiResponseWithData, getRequestBodyObject, handleApiError } from '@/utils/apiHelpers';
import { cleanupSessions, issueSession, revokeSession, sessionExpiryData } from '@/utils/auth/serverSession';
import { verifyPassword } from '@/utils/userHelper';

import { type LoginRequestType, type LoginResponseDataType } from '@/types/loginTypes';
import { type DataValidatorSchema, validateData } from '@/utils/dataValidator';

import prisma from '@/utils/prisma/prismaImporter';
import { logApiFailure, logLoginSuccess } from '@/utils/apiLogger';
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

    if (user == null || user.status !== 'Active') {
      // Unknown and inactive accounts have the same public failure.
      req.session.destroy();
      throw new HmvError('Login failed', {
        publicMessage: 'Invalid email or password',
      });
    }

    if (!(await verifyPassword(loginData.password, user.password))) {
      // invalid password
      req.session.destroy();
      throw new HmvError('Login failed', {
        publicMessage: 'Invalid email or password',
      });
    }

    const issued = await issueSession(user);
    if (issued === null) {
      req.session.destroy();
      throw new HmvError('Login failed', { publicMessage: 'Invalid email or password' });
    }
    try {
      // Replacing a browser session must not leave its prior token usable.
      await revokeSession(req.session);
      delete req.session.user;
      req.session.version = 1;
      req.session.token = issued.token;
      await req.session.save();
    } catch (error) {
      await revokeSession({ version: 1, token: issued.token });
      throw error;
    }
    logLoginSuccess(issued.user.id);
    try {
      await cleanupSessions();
    } catch (error) {
      logApiFailure('cleanup sessions', 503, error);
    }

    res.send(
      getApiResponseWithData<LoginResponseDataType>({
        name: issued.user.name,
        email: issued.user.email,
        isAdmin: issued.user.isAdmin,
        ...sessionExpiryData(issued.expiresOn),
      }),
    );
  } catch (e) {
    handleApiError(res, 'login', e);
  }
};

export default withSessionRoute(handler);
