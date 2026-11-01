import type { User } from '@prisma/client';
import type { SessionData } from '@/types/session';
import prisma from '@/utils/prisma/prismaImporter';

export type CurrentUser = Pick<User, 'id' | 'name' | 'email' | 'isAdmin' | 'status'>;

export const resolveCurrentUser = async (session: Partial<SessionData> | undefined): Promise<CurrentUser | null> => {
  const user = session?.user;
  if (
    user === null ||
    typeof user !== 'object' ||
    Array.isArray(user) ||
    typeof user.id !== 'string' ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(user.id)
  )
    return null;

  // Cookie role claims are historical hints, never current authority.
  const currentUser = await prisma.user.findFirst({
    where: { id: user.id },
    select: { id: true, name: true, email: true, isAdmin: true, status: true },
  });
  return currentUser?.status === 'Active' ? currentUser : null;
};
