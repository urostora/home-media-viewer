import type { User } from '@prisma/client';
import type { SessionData } from '@/types/session';
import { resolveServerSession } from './serverSession';

export type CurrentUser = Pick<User, 'id' | 'name' | 'email' | 'isAdmin' | 'status'>;

// Retained helper for callers that need only the current principal.
export const resolveCurrentUser = async (session: Partial<SessionData> | undefined): Promise<CurrentUser | null> =>
  (await resolveServerSession(session))?.user ?? null;
