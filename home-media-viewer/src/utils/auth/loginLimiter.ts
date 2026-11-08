import { createHmac, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { LoginBudget, Prisma } from '@prisma/client';
import prisma from '@/utils/prisma/prismaImporter';
import { getIronSessionOptions } from '@/utils/sessionHelper';

export const LOGIN_LIMITS = {
    global: { count: 60, seconds: 60 },
    client: { count: 10, seconds: 60 },
    account: { count: 5, seconds: 300 },
} as const;
export const loginWindow = (
    current: LoginBudget | null,
    now: Date,
    seconds: number,
): { used: number; startedAt: Date; resetAt: Date } =>
    current !== null && current.resetAt > now
        ? current
        : { used: 0, startedAt: now, resetAt: new Date(now.getTime() + seconds * 1000) };
export const retrySeconds = (resetAt: Date, now: Date): number =>
    Math.max(1, Math.min(300, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)));
const owner = `${hostname()}:${process.pid}:${randomUUID()}`;
export type LoginPermitHandle = { slot: number; owner: string };
export type LoginAdmission = { allowed: true; permit: LoginPermitHandle } | { allowed: false; retryAfter: number };
let localRequests = 0;
export const enterLogin = (): boolean => {
    if (localRequests >= 2) return false;
    localRequests++;
    return true;
};
export const leaveLogin = (): void => {
    localRequests--;
};

const keyFor = (scope: string, identity: string): string => {
    const secret = getIronSessionOptions().password;
    if (typeof secret !== 'string') throw new Error('Invalid login limiter key');
    return createHmac('sha256', secret).update(`${scope}\0${identity}`).digest('hex');
};
const lockedTime = async (tx: Prisma.TransactionClient): Promise<Date> => {
    const rows = await tx.$queryRaw<
        Array<{ key: string }>
    >`SELECT \`key\` FROM LoginBudget WHERE \`key\` = 'global' FOR UPDATE`;
    if (rows.length !== 1) throw new Error('Login limiter not initialized');
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP(3) AS now`;
    return clock.now;
};
const budget = async (tx: Prisma.TransactionClient, key: string, scope: keyof typeof LOGIN_LIMITS, now: Date) => {
    const rule = LOGIN_LIMITS[scope];
    const value = loginWindow(await tx.loginBudget.findUnique({ where: { key } }), now, rule.seconds);
    return { value, blocked: value.used >= rule.count, retryAfter: retrySeconds(value.resetAt, now) };
};
const reserve = async (
    tx: Prisma.TransactionClient,
    key: string,
    value: ReturnType<typeof loginWindow>,
): Promise<void> => {
    const data = { used: value.used + 1, startedAt: value.startedAt, resetAt: value.resetAt };
    await tx.loginBudget.upsert({ where: { key }, create: { key, ...data }, update: data });
};

export const admitLogin = async (client: string): Promise<LoginAdmission> => {
    const clientKey = keyFor('client', client);
    const claim = `${owner}:${randomUUID()}`;
    return prisma.$transaction(async (tx) => {
        const now = await lockedTime(tx);
        const global = await budget(tx, 'global', 'global', now);
        if (global.blocked) return { allowed: false, retryAfter: global.retryAfter };
        const ip = await budget(tx, clientKey, 'client', now);
        if (ip.blocked) return { allowed: false, retryAfter: ip.retryAfter };
        const permit = await tx.loginPermit.findFirst({ where: { owner: null }, orderBy: { slot: 'asc' } });
        if (permit === null) return { allowed: false, retryAfter: 1 };
        await tx.loginPermit.update({ where: { slot: permit.slot }, data: { owner: claim, acquiredAt: now } });
        await reserve(tx, 'global', global.value);
        await reserve(tx, clientKey, ip.value);
        await cleanupBudgetRows(tx, now);
        return { allowed: true, permit: { slot: permit.slot, owner: claim } };
    });
};
export const admitLoginAccount = async (
    identity: { id: string } | null,
    email: string,
): Promise<{ allowed: boolean; retryAfter: number }> => {
    // Existing aliases follow MariaDB's actual unique collation via the resolved
    // account ID. Normalization of unknown names is only a conservative budget.
    const key =
        identity === null
            ? keyFor('unknown', email.normalize('NFKC').toLowerCase().trim())
            : keyFor('account', identity.id);
    return prisma.$transaction(async (tx) => {
        const now = await lockedTime(tx);
        const result = await budget(tx, key, 'account', now);
        if (result.blocked) return { allowed: false, retryAfter: result.retryAfter };
        await reserve(tx, key, result.value);
        return { allowed: true, retryAfter: 0 };
    });
};
export const releaseLogin = async (permit: LoginPermitHandle): Promise<void> => {
    const result = await prisma.loginPermit.updateMany({
        where: { slot: permit.slot, owner: permit.owner },
        data: { owner: null, acquiredAt: null },
    });
    if (result.count !== 1) throw new Error('Login permit ownership changed');
};
const cleanupBudgetRows = async (tx: Prisma.TransactionClient, now: Date): Promise<void> => {
    const expired = { key: { not: 'global' }, resetAt: { lt: new Date(now.getTime() - 3600000) } };
    const rows = await tx.loginBudget.findMany({
        where: expired,
        select: { key: true },
        take: 20,
        orderBy: { resetAt: 'asc' },
    });
    if (rows.length)
        await tx.loginBudget.deleteMany({ where: { ...expired, key: { in: rows.map((row) => row.key) } } });
};
export const cleanupLoginBudgets = async (): Promise<void> => {
    await prisma.$transaction(async (tx) => {
        await cleanupBudgetRows(tx, await lockedTime(tx));
    });
};
