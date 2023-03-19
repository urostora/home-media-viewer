import { PrismaClient } from '@prisma/client'

import { getHashedPassword } from './../src/helpers/userHelper.js';

const prisma = new PrismaClient()

async function main() {

    // create admin user
    const password = 'P4ssw0rd';
    const hashedPassword = await getHashedPassword(password);
    await prisma.user.upsert({
        where: {
            email: 'urostora@gmail.com'
        },
        update: {},
        create: {
            email: 'urostora@gmail.com',
            name: 'admin',
            password: hashedPassword,
        },
    });
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
