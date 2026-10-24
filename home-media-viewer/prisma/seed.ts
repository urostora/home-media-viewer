import { PrismaClient } from '@prisma/client';

import { getHashedPassword } from '../src/utils/userHelper';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // create admin user if not exists
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (adminEmail === undefined || adminEmail.length === 0 || password === undefined || password.trim().length === 0) {
    throw new Error('Administrator bootstrap requires ADMIN_EMAIL and ADMIN_PASSWORD.');
  }
  const existingAdminUser = await prisma.user.findFirst({ where: { email: adminEmail } });

  if (existingAdminUser !== null && (!existingAdminUser.isAdmin || existingAdminUser.status !== 'Active')) {
    throw new Error('Bootstrap email belongs to an inactive or non-administrator user; resolve it explicitly.');
  }

  if (existingAdminUser === null) {
    const hashedPassword = await getHashedPassword(password);
    await prisma.user.upsert({
      where: {
        email: adminEmail,
      },
      update: {},
      create: {
        email: adminEmail,
        name: 'admin',
        password: hashedPassword,
        isAdmin: true,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
