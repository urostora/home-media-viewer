import type { IronSession } from 'iron-session';
import type { CurrentUser } from '@/utils/auth/currentUser';

export interface SessionData {
  user: {
    id: string;
    admin?: boolean;
  };
}

// The shared route wrapper attaches this typed session before calling API handlers.
declare module 'next' {
  interface NextApiRequest {
    session: IronSession<SessionData>;
    authenticatedUser?: CurrentUser;
  }
}
