import { PrismaClient } from '@prisma/client';

import { getHashedPassword } from '../src/utils/userHelper';

const prisma = new PrismaClient();

async function main() {
  // create admin user if not exists
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@admin.com';
  const existingAdminUser = await prisma.user.findFirst({ where: { email: adminEmail }});

  if (existingAdminUser === null) {
    const password = process.env.ADMIN_PASSWORD ?? 'P4ssw0rd';
    const hashedPassword = await getHashedPassword(password);
    await prisma.user.upsert({
      where: {
        email: adminEmail,
      },
      update: {},
      create: {
        email: 'admin@admin.com',
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
