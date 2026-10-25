import type { IronSession } from 'iron-session';

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
  }
}
