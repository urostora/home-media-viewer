import { retryRead } from '../../utils/prisma/retryRead';
import { withSessionRoute } from '@/utils/sessionRoute';

import {
  HmvError,
  getApiResponse,
  getApiResponseWithData,
  getRequestBodyObject,
  handleApiError,
} from '@/utils/apiHelpers';
import { cleanupSessions, issueSession, revokeSession, sessionExpiryData } from '@/utils/auth/serverSession';
import { verifyLoginPassword } from '@/utils/auth/loginProof';
import { admitLogin, admitLoginAccount, enterLogin, leaveLogin, releaseLogin } from '@/utils/auth/loginLimiter';
import { loginClient } from '@/utils/auth/loginClient';

import { type LoginRequestType, type LoginResponseDataType } from '@/types/loginTypes';

import prisma from '@/utils/prisma/prismaImporter';
import { logApiFailure, logLoginSuccess, logLoginOutcome } from '@/utils/apiLogger';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json(getApiResponse({ ok: false, error: 'Method not allowed' }));
    return;
  }
  const limited = (seconds: number): void => {
    logLoginOutcome('limited');
    res.setHeader('Retry-After', String(seconds));
    res
      .status(429)
      .json(getApiResponse({ ok: false, error: `Too many login attempts. Try again in ${seconds} seconds.` }));
  };
  if (!enterLogin()) {
    limited(1);
    return;
  }
  try {
    let loginData: LoginRequestType;
    try {
      loginData = getRequestBodyObject<LoginRequestType>(req, res);
      if (
        Array.isArray(loginData) ||
        typeof loginData.email !== 'string' ||
        typeof loginData.password !== 'string' ||
        loginData.email.length === 0 ||
        loginData.password.length === 0 ||
        Buffer.byteLength(loginData.email, 'utf8') > 1024 ||
        Buffer.byteLength(loginData.password, 'utf8') > 1048576
      ) {
        throw new HmvError('Invalid login data', { publicMessage: 'Invalid email or password' });
      }
    } catch (error) {
      logLoginOutcome('failure');
      handleApiError(res, 'login', error);
      return;
    }
    const admission = await admitLogin(loginClient(req));
    if (!admission.allowed) {
      limited(admission.retryAfter);
      return;
    }
    let user;
    let matched;
    let account;
    try {
      user = await retryRead(() => prisma.user.findFirst({ where: { email: loginData.email } }));
      account = await admitLoginAccount(user, loginData.email);
      if (account.allowed) matched = await verifyLoginPassword(loginData.password, user?.password);
    } finally {
      // The slot has no timeout. Release only after actual bcrypt completion;
      // a DB failure here prevents session issuance rather than bypassing limits.
      await releaseLogin(admission.permit);
    }
    if (!account.allowed) {
      limited(account.retryAfter);
      return;
    }
    if (user === null || user.status !== 'Active' || !matched) {
      req.session.destroy();
      logLoginOutcome('failure');
      throw new HmvError('Login failed', { publicMessage: 'Invalid email or password' });
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
  } catch (error) {
    if (error instanceof HmvError) handleApiError(res, 'login', error);
    else {
      logLoginOutcome('unavailable');
      logApiFailure('login', 503, error);
      res.status(503).json(getApiResponse({ ok: false, error: 'Login unavailable. Please retry.' }));
    }
  } finally {
    leaveLogin();
  }
};

// Preserve the previous Pages API 1 MiB body limit, including legacy long-password login.
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
export default withSessionRoute(handler);
