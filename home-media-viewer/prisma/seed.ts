import { PrismaClient } from '@prisma/client';

import { getHashedPassword } from '../src/utils/userHelper';

const prisma = new PrismaClient();

async function main() {
  // create admin user
  const password = 'P4ssw0rd';
  const hashedPassword = await getHashedPassword(password);
  await prisma.user.upsert({
    where: {
      email: 'admin@admin.com',
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
