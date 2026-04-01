import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function testLogin() {
  const username = 'admin';
  const password = 'admin';

  console.log('Testing login for:', username);

  // Find the user
  const user = await prisma.user.findUnique({
    where: { email: username }
  });

  if (!user) {
    console.log('User not found!');
    return;
  }

  console.log('User found:', user);

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  console.log('Password valid:', isPasswordValid);
}

testLogin()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });