import { PrismaClient } from '@prisma/client'

// Global singleton to survive Next.js hot-module replacement in development.
// In production each worker process holds a single instance by module cache.
const globalForPrisma = global as unknown as { crmPrisma: PrismaClient }

// Schema no longer carries `url = env("DATABASE_URL")` (deprecated in newer
// Prisma config model), so the connection URL has to be passed explicitly to
// the client. Crashes loudly if missing — better than silently connecting to
// the wrong database via an undefined URL.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — cannot initialise Prisma client')
}

export const prisma: PrismaClient =
  globalForPrisma.crmPrisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.crmPrisma = prisma
}
