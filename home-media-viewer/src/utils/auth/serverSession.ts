import { retryRead } from '../prisma/retryRead';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthSession, Prisma, User } from '@prisma/client';
import prisma from '@/utils/prisma/prismaImporter';
import type { SessionData } from '@/types/session';
import type { CurrentUser } from './currentUser';
import { hasSessionToken, SESSION_ABSOLUTE_SECONDS, SESSION_IDLE_SECONDS } from './sessionPolicy';

const digest = (token: string): string => createHash('sha256').update(token).digest('hex');
export const effectiveExpiry = (record: { expiresAt: Date; idleExpiresAt: Date }): number =>
  Math.min(record.expiresAt.getTime(), record.idleExpiresAt.getTime());
export const sessionExpiryData = (
  expiresOn: number,
): { sessionExpiresOn: number; sessionExpiresInSeconds: number } => ({
  sessionExpiresOn: expiresOn,
  sessionExpiresInSeconds: Math.max(0, Math.floor((expiresOn - Date.now()) / 1000)),
});

// Every session/account writer locks the account before touching session rows.
// A locking read also observes the latest committed state under MariaDB RR.
export const lockSessionUser = async (tx: Prisma.TransactionClient, id: string): Promise<User | null> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM User WHERE id = ${id} FOR UPDATE`;
  return rows.length === 0 ? null : tx.user.findUnique({ where: { id } });
};

// Readers share the account lock, while account/session writers still take it exclusively.
// Always lock the account before its session, and choose activity time after both locks.
const readSessionUser = async (
  tx: Prisma.TransactionClient,
  id: string,
): Promise<(CurrentUser & { sessionVersion: number }) | null> => {
  const rows = await tx.$queryRaw<
    Array<Omit<CurrentUser, 'isAdmin'> & { isAdmin: boolean | number; sessionVersion: number }>
  >`
    SELECT id, name, email, isAdmin, status, sessionVersion FROM User WHERE id = ${id} LOCK IN SHARE MODE
  `;
  const user = rows[0];
  return user === undefined ? null : { ...user, isAdmin: Boolean(user.isAdmin) };
};

export const issueSession = async (
  verifiedUser: User,
): Promise<{
  token: string;
  expiresOn: number;
  user: CurrentUser;
} | null> =>
  prisma.$transaction(async (tx) => {
    const user = await lockSessionUser(tx, verifiedUser.id);
    if (
      user === null ||
      user.status !== 'Active' ||
      user.password !== verifiedUser.password ||
      user.sessionVersion !== verifiedUser.sessionVersion
    )
      return null;
    const now = new Date(Date.now());
    const token = randomBytes(32).toString('hex');
    const record = await tx.authSession.create({
      data: {
        tokenHash: digest(token),
        userId: user.id,
        userVersion: user.sessionVersion,
        issuedAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_SECONDS * 1000),
        idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000),
      },
    });
    // Do not return the password or generation outside this boundary.
    const { id, name, email, isAdmin, status } = user;
    return { token, expiresOn: effectiveExpiry(record), user: { id, name, email, isAdmin, status } };
  });

export const resolveServerSession = async (
  cookie: Partial<SessionData> | undefined,
): Promise<{
  user: CurrentUser;
  expiresOn: number;
} | null> => {
  if (cookie === undefined || !hasSessionToken(cookie)) return null;
  const found = await retryRead(() => prisma.authSession.findUnique({ where: { tokenHash: digest(cookie.token!) } }));
  if (found === null) return null;
  return prisma.$transaction(async (tx) => {
    const user = await readSessionUser(tx, found.userId);
    if (user === null || user.status !== 'Active') return null;
    // Serialize refreshes of this session without serializing every session on the account.
    const records = await tx.$queryRaw<
      Array<Pick<AuthSession, 'id' | 'userVersion' | 'revokedAt' | 'expiresAt' | 'idleExpiresAt'>>
    >`
      SELECT id, userVersion, revokedAt, expiresAt, idleExpiresAt
      FROM AuthSession WHERE id = ${found.id} AND userId = ${found.userId} FOR UPDATE
    `;
    const record = records[0];
    const now = new Date(Date.now());
    if (
      record === undefined ||
      record.revokedAt !== null ||
      record.userVersion !== user.sessionVersion ||
      effectiveExpiry(record) <= now.getTime()
    )
      return null;
    const idleExpiresAt = new Date(Math.min(record.expiresAt.getTime(), now.getTime() + SESSION_IDLE_SECONDS * 1000));
    const updated = await tx.authSession.updateMany({
      where: {
        id: record.id,
        revokedAt: null,
        userVersion: user.sessionVersion,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      data: { lastSeenAt: now, idleExpiresAt },
    });
    if (updated.count !== 1) return null;
    const { id, name, email, isAdmin, status } = user;
    return {
      user: { id, name, email, isAdmin, status },
      expiresOn: Math.min(record.expiresAt.getTime(), idleExpiresAt.getTime()),
    };
  });
};

export const revokeSession = async (cookie: Partial<SessionData>): Promise<void> => {
  if (!hasSessionToken(cookie)) return;
  const record = await retryRead(() => prisma.authSession.findUnique({ where: { tokenHash: digest(cookie.token!) } }));
  if (record === null) return;
  await prisma.$transaction(async (tx) => {
    if ((await lockSessionUser(tx, record.userId)) === null) return;
    await tx.authSession.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date(Date.now()) },
    });
  });
};

// Call only after locking/updating this account in the same transaction.
export const revokeUserSessions = async (tx: Prisma.TransactionClient, userId: string): Promise<void> => {
  await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(Date.now()) } });
};
export const revokeAllSessions = async (userId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    if ((await lockSessionUser(tx, userId)) === null) return;
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await revokeUserSessions(tx, userId);
  });
};

// At most 100 indexed candidates and 100 deletions per successful login.
export const cleanupSessions = async (): Promise<void> => {
  const now = new Date(Date.now());
  const expired: Prisma.AuthSessionWhereInput = {
    OR: [{ expiresAt: { lte: now } }, { idleExpiresAt: { lte: now } }, { revokedAt: { not: null } }],
  };
  const candidates = await retryRead(() =>
    prisma.authSession.findMany({ where: expired, select: { id: true }, take: 100 }),
  );
  if (candidates.length !== 0)
    await prisma.authSession.deleteMany({
      where: { ...expired, id: { in: candidates.map((row) => row.id) } },
    });
};
