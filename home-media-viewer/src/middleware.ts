import { type NextRequest, NextResponse } from 'next/server';

import { getApiResponse } from './utils/apiHelpers';
import type { UserSessionData } from './types/api/userTypes';
import { getUserDataFromRequest } from './utils/auth/userSessionDataProvider';

export const middleware = async (req: NextRequest): Promise<NextResponse> => {
  const res = NextResponse.next();

  const user: UserSessionData | undefined = await getUserDataFromRequest(req, res);

  if (user === null || user === undefined) {
    // no user logged in
    return NextResponse.json(getApiResponse({ ok: false, error: 'Forbidden' }), { status: 403 });
  }

  req.credentials.toString();

  return res;
};

export const config = {
  matcher: ['/(api/(?!log|process).*)'],
};
