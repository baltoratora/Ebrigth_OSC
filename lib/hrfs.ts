import { PrismaClient } from '@prisma/client'

// Second Prisma client, intended to point directly at the ebright_hrfs database
// (public schema) where BranchStaff physically lives, rather than the crm
// schema where `BranchStaff` is only a view / FDW proxy. Reading through that
// proxy is indirect, and INSERTs through it fail with a misleading P2011
// null-constraint error (the id sequence default doesn't propagate).
//
// HRFS_DATABASE_URL should point at `...ebright_hrfs?schema=public`. The
// branchStaff model carries @@map("BranchStaff") with no pinned schema, so the
// typed calls resolve against the connection's search_path (the `?schema=`
// param). Raw queries in callers therefore use the UNqualified table name
// ("BranchStaff") so they resolve in whichever schema this client connects to.
//
// FALLBACK: if HRFS_DATABASE_URL is not configured (e.g. an environment that
// hasn't had the secret added yet), fall back to DATABASE_URL so the app still
// boots and every BranchStaff read keeps working through the crm view exactly
// as it did before this client existed — INSTEAD of throwing at import and
// taking the whole server down with a 502. We only crash if NEITHER url is set.
const globalForHrfs = global as unknown as { hrfsPrisma: PrismaClient }

const hrfsUrl = process.env.HRFS_DATABASE_URL
const fallbackUrl = process.env.DATABASE_URL
const resolvedUrl = hrfsUrl || fallbackUrl

if (!resolvedUrl) {
  throw new Error(
    'Neither HRFS_DATABASE_URL nor DATABASE_URL is set — cannot initialise HRFS Prisma client',
  )
}

if (!hrfsUrl) {
  console.warn(
    '[hrfs] HRFS_DATABASE_URL is not set — falling back to DATABASE_URL. ' +
      'BranchStaff reads work via the crm view, but registration (INSERT) may ' +
      'fail until HRFS_DATABASE_URL is configured for this environment.',
  )
}

export const hrfsPrisma: PrismaClient =
  globalForHrfs.hrfsPrisma ?? new PrismaClient({ datasourceUrl: resolvedUrl })

if (process.env.NODE_ENV !== 'production') globalForHrfs.hrfsPrisma = hrfsPrisma
