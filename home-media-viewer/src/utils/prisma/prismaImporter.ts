import { PrismaClient } from '@prisma/client';
import { retryRead } from './retryRead';

const databaseUrl = process.env.DATABASE_URL;
const poolSize = Number(process.env.DB_CONNECTION_LIMIT ?? 5);
if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 20) {
  throw new Error('DB_CONNECTION_LIMIT must be between 1 and 20');
}
const url = typeof databaseUrl === 'string' && databaseUrl.length > 0 ? new URL(databaseUrl) : undefined;
url?.searchParams.set('connection_limit', String(poolSize));
url?.searchParams.set('pool_timeout', '5');
url?.searchParams.set('connect_timeout', '5');
url?.searchParams.set('socket_timeout', '10');
const prisma = new PrismaClient(url !== undefined ? { datasources: { db: { url: url.toString() } } } : undefined);
prisma.$use(retryRead);

export default prisma;
