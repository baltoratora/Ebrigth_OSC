import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — cannot initialise Prisma client')
}

export const prisma =
  globalForPrisma.prisma || new PrismaClient({ datasourceUrl: databaseUrl })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma