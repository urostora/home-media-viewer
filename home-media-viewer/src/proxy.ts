import { getIronSession, nextProxyCookies } from 'iron-session';
import type { SessionData } from './types/session';
import { type NextRequest, NextResponse } from 'next/server';
import { getApiResponse } from './utils/apiHelpers';
import { getIronSessionOptions } from './utils/sessionHelper';

export const proxy = async (req: NextRequest): Promise<NextResponse> => {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(nextProxyCookies(req, res), getIronSessionOptions());

  const { user } = session;

  if (user === null || user === undefined) {
    // no user logged in
    return NextResponse.json(getApiResponse({ ok: false, error: 'Forbidden' }), { status: 403 });
  }

  return res;
};

export const config = {
  matcher: ['/(api/(?!log|process|health/(?:live|ready)$).*)'],
};
