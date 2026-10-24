import { PrismaClient } from '@prisma/client';
import { retryRead } from './retryRead';

const prisma = new PrismaClient();
prisma.$use(retryRead);

export default prisma;
