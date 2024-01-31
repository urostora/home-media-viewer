import { getIronSession, unsealData } from 'iron-session/edge';

import type { NextApiRequest } from 'next';
import type { NextRequest, NextResponse } from 'next/server';

import { getIronSessionOptions } from '../sessionHelper';

import type { UserSessionData } from '@/types/api/userTypes';

export const getUserDataFromRequest = async (
  req: NextRequest | NextApiRequest,
  res?: NextResponse,
): Promise<UserSessionData | undefined> => {
  if ('session' in req && typeof req.session?.user?.id === 'string') {
    return req.session?.user;
  }

  const ironSessionOptions = getIronSessionOptions();

  if (res !== undefined) {
    const ironSession = await getIronSession(req, res, ironSessionOptions);

    if (typeof ironSession?.user?.id === 'string') {
      // user data found in session
      // console.log('userDataProvider - user data found in iron session', ironSession.user);
      return ironSession.user;
    }
  }

  // session not found - get user data from bearer token
  const bearerToken = getBearerToken(req);
  if (bearerToken !== undefined) {
    console.log('userDataProvider - Bearer token', bearerToken);
    const unsealedData = await unsealData(bearerToken, {
      password: ironSessionOptions.password,
      ttl: ironSessionOptions.ttl,
    });

    if (typeof unsealedData === 'object') {
      const userData = unsealedData as { id: string; admin?: boolean };

      if (
        typeof userData === 'object' &&
        typeof userData.id === 'string' &&
        (userData?.admin === undefined || typeof userData.admin === 'boolean')
      ) {
        // console.log('userDataProvider - user data found', userData);
        return userData;
      } else {
        // console.log('userDataProvider - Invalid user data', userData);
      }
    } else {
      // console.log('userDataProvider - Could not decode token data', unsealedData);
    }
  }

  return undefined;
};

const getBearerToken = (req: NextRequest | NextApiRequest): string | undefined => {
  let authHeaderValue: string | undefined;

  if ('query' in req) {
    authHeaderValue = req.headers.authorization;
  } else {
    for (const [name, value] of req.headers) {
      if (name !== 'authorization') {
        continue;
      }

      authHeaderValue = value;
    }
  }

  if (authHeaderValue !== undefined) {
    const bearerValueMatch = authHeaderValue.match(/Bearer\s+(?<token>\S+)$/);
    if (bearerValueMatch !== null) {
      return bearerValueMatch.groups?.token?.trim();
    }
  }

  return undefined;
};
