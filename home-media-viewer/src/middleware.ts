import { getIronSession } from 'iron-session/edge';
import { NextRequest, NextResponse } from 'next/server';
import { getApiResponse } from './utils/apiHelpers';
import { getIronSessionOptions } from './utils/sessionHelper';

export const middleware = async (req: NextRequest) => {
  const res = NextResponse.next();
  const session = await getIronSession(req, res, getIronSessionOptions());

  const { user } = session;

  if (user == null) {
    // no user logged in
    console.log('Middleware: No user');
    return NextResponse.json(getApiResponse({ ok: false, error: 'Forbidden' }), { status: 403 });
  }

  return res;
};

export const config = {
  matcher: ['/(api/(?!log|process).*)'],
};
