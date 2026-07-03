import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'testfamily@example.com';
  const password = 'Family123!';

  // Find the first service user to link to
  const serviceUser = await prisma.serviceUser.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!serviceUser) {
    console.error('No service users found — create one in the manager app first.');
    process.exit(1);
  }

  // Upsert the family member user
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed, active: true },
    create: {
      email,
      password: hashed,
      firstName: 'Test',
      lastName: 'Family',
      role: 'FAMILY_MEMBER',
      active: true,
    },
  });

  // Create family link if it doesn't exist
  await prisma.familyLink.upsert({
    where: { userId_serviceUserId: { userId: user.id, serviceUserId: serviceUser.id } },
    update: {},
    create: { userId: user.id, serviceUserId: serviceUser.id, relation: 'Tester' },
  });

  console.log(`\nTest family account ready:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Linked to service user: ${serviceUser.firstName} ${serviceUser.lastName}`);
  console.log(`\nLogin at: https://rota-app-lf1o.vercel.app\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
