/**
 * Provisions the "Ebright Marketing" branch + branch manager.
 *
 * What this creates / upserts:
 *   - crm_branch                  → "Ebright Marketing" (renamed from "00 Ebright OD")
 *   - crm_pipeline + 16 stages    → standard lead pipeline (NL, FU1, ..., DND, SG);
 *                                   pipeline NAME stays as "00 Ebright OD" so the
 *                                   stage UUIDs and pipeline.id stay stable across
 *                                   the rename.
 *   - crm_auth_user               → test@ebright.my
 *   - crm_auth_account            → bcrypt-hashed password "admin123"
 *   - crm_user_branch             → BRANCH_MANAGER role on the renamed branch
 *
 * Marketing is the fallback destination for leads with no resolvable branch:
 * leadIngestWorker routes anything that fails branch resolution here so the
 * Marketing BM can triage and (optionally) transfer to the correct branch
 * via the per-lead transfer panel (max 3 transfers per lead).
 *
 * Why a script instead of plain SQL:
 *   - bcrypt hashing for the password — Postgres has no native bcrypt
 *   - idempotent — safe to re-run; upserts by natural keys (email, branch name)
 *
 * Run: `npm run seed:od`
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set — cannot seed.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

// ─── Config ──────────────────────────────────────────────────────────────────

const TENANT_SLUG = 'ebright'
const BRANCH_NAME = 'Ebright Marketing'
// Pipeline name preserved across the OD → Marketing rename so the pipeline.id
// and per-stage UUIDs stay stable for anything pointing at them.
const PIPELINE_NAME = '00 Ebright OD'
// Legacy branch name we're upgrading from. We look it up on each run and
// rename it in place to BRANCH_NAME, so the seed self-heals environments
// that haven't run rename-od-to-marketing.sql yet.
const LEGACY_BRANCH_NAME = '00 Ebright OD'

const USER = {
  email: 'test@ebright.my',
  name:  'Ebright Marketing Branch Manager',
  password: 'admin123',
}

// Old emails the seed used previously. We delete the auth row + branch link
// for any of these on each run, so re-running the script with a changed
// USER.email cleans up old test accounts instead of leaving orphans.
const PRIOR_EMAILS = ['od@ebright.com']

const STAGES = [
  { name: 'New Lead',              shortCode: 'NL',    color: 'slate'   },
  { name: 'Follow-Up 1st Attempt', shortCode: 'FU1',   color: 'slate'   },
  { name: 'Follow-Up 2nd Attempt', shortCode: 'FU2',   color: 'slate'   },
  { name: 'Follow-Up 3rd Attempt', shortCode: 'FU3',   color: 'slate'   },
  { name: 'Reschedule',            shortCode: 'RSD',   color: 'slate'   },
  { name: 'Trial Buffer',          shortCode: 'CTB',   color: 'cyan'    },
  { name: 'Confirmed for Trial',   shortCode: 'CT',    color: 'emerald' },
  { name: 'Confirmed No-Show',     shortCode: 'CNS',   color: 'amber'   },
  { name: 'Show-Up',               shortCode: 'SU',    color: 'emerald' },
  { name: 'Show-Up No-Enroll',     shortCode: 'SNE',   color: 'yellow'  },
  { name: 'Enroll Buffer',         shortCode: 'ENRB',  color: 'cyan'    },
  { name: 'Enrolled',              shortCode: 'ENR',   color: 'emerald' },
  { name: 'Unresponsive Week 1',   shortCode: 'UR_W1', color: 'slate'   },
  { name: 'Unresponsive Week 2',   shortCode: 'UR_W2', color: 'slate'   },
  { name: 'Unresponsive Week 3',   shortCode: 'UR_W3', color: 'slate'   },
  { name: 'Follow-Up 3 Months',    shortCode: 'FU3M',  color: 'slate'   },
  { name: 'Cold Lead',             shortCode: 'CL',    color: 'slate'   },
  { name: 'Do Not Disturb',        shortCode: 'DND',   color: 'red'     },
  { name: 'Buffer (OD use only)',  shortCode: 'SG',    color: 'indigo'  },
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Seeding 00 Ebright OD (stress-test branch)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. Tenant
  const tenant = await prisma.crm_tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  })
  if (!tenant) {
    console.error(`✗ Tenant slug="${TENANT_SLUG}" not found. Run the main seed first.`)
    process.exit(1)
  }
  console.log(`✓ Tenant         ${tenant.name}`)

  // 2. Branch — rename the legacy "00 Ebright OD" row in place if found,
  //    otherwise create fresh as "Ebright Marketing". The rename is a no-op
  //    once the environment has been migrated.
  const legacyBranch = await prisma.crm_branch.findFirst({
    where: { tenantId: tenant.id, name: LEGACY_BRANCH_NAME },
    select: { id: true },
  })
  if (legacyBranch && LEGACY_BRANCH_NAME !== (BRANCH_NAME as string)) {
    await prisma.crm_branch.update({
      where: { id: legacyBranch.id },
      data:  { name: BRANCH_NAME },
    })
    console.log(`✓ Renamed branch ${LEGACY_BRANCH_NAME} → ${BRANCH_NAME}`)
  }

  const existingBranch = await prisma.crm_branch.findFirst({
    where: { tenantId: tenant.id, name: BRANCH_NAME },
    select: { id: true },
  })
  const branch = existingBranch
    ? existingBranch
    : await prisma.crm_branch.create({
        data: { tenantId: tenant.id, name: BRANCH_NAME },
        select: { id: true },
      })
  console.log(`✓ Branch         ${BRANCH_NAME} (${branch.id})`)

  // 3. Pipeline + stages — pipeline NAME stays "00 Ebright OD" per the
  //    rename spec, so consumers that referenced the pipeline by name (rare)
  //    keep working.
  const existingPipeline = await prisma.crm_pipeline.findFirst({
    where: { tenantId: tenant.id, branchId: branch.id },
    select: { id: true },
  })
  const pipeline = existingPipeline
    ? existingPipeline
    : await prisma.crm_pipeline.create({
        data: { tenantId: tenant.id, branchId: branch.id, name: PIPELINE_NAME },
        select: { id: true },
      })

  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i]
    const existingStage = await prisma.crm_stage.findFirst({
      where: { tenantId: tenant.id, pipelineId: pipeline.id, shortCode: s.shortCode },
      select: { id: true },
    })
    if (!existingStage) {
      await prisma.crm_stage.create({
        data: {
          tenantId: tenant.id,
          pipelineId: pipeline.id,
          name: s.name,
          shortCode: s.shortCode,
          color: s.color,
          order: i,
        },
      })
    }
  }
  console.log(`✓ Pipeline       ${BRANCH_NAME} (${STAGES.length} stages)`)

  // 3b. Clean up old test accounts whose email we've since changed.
  // Prevents stale "od@ebright.com" rows hanging around after we renamed.
  for (const oldEmail of PRIOR_EMAILS) {
    if (oldEmail === USER.email) continue
    const old = await prisma.crm_auth_user.findFirst({
      where: { email: oldEmail },
      select: { id: true },
    })
    if (old) {
      // crm_user_branch + crm_auth_account both reference the user.
      await prisma.crm_user_branch.deleteMany({ where: { userId: old.id } })
      await prisma.crm_auth_account.deleteMany({ where: { userId: old.id } })
      await prisma.crm_auth_session.deleteMany({ where: { userId: old.id } })
      await prisma.crm_auth_user.delete({ where: { id: old.id } })
      console.log(`✓ Cleaned up     ${oldEmail} (${old.id})`)
    }
  }

  // 4. Auth user
  const existingUser = await prisma.crm_auth_user.findFirst({
    where: { email: USER.email },
    select: { id: true },
  })
  const user = existingUser
    ? existingUser
    : await prisma.crm_auth_user.create({
        data: {
          id: randomUUID(),
          email: USER.email,
          name: USER.name,
          emailVerified: true,
        },
        select: { id: true },
      })
  console.log(`✓ User           ${USER.email} (${user.id})`)

  // 5. Better Auth credential account (overwrite password if user existed)
  const passwordHash = await bcrypt.hash(USER.password, 10)
  const existingAccount = await prisma.crm_auth_account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
    select: { id: true },
  })
  if (existingAccount) {
    await prisma.crm_auth_account.update({
      where: { id: existingAccount.id },
      data: { password: passwordHash },
    })
  } else {
    await prisma.crm_auth_account.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        accountId: USER.email,
        providerId: 'credential',
        password: passwordHash,
      },
    })
  }
  console.log(`✓ Password set   admin123 (bcrypt cost 10)`)

  // 5b. Mirror the user into the local HRMS-style `User` table so NextAuth's
  // /login page can authenticate them. lib/nextauth.ts does:
  //   1. SELECT from crm.hrfs_users (FDW view of HRFS) — for production users
  //   2. fall back to local crm_db.public."User"
  // Stress-test users live in the local fallback so we don't have to touch HRFS.
  const existingHrUser = await prisma.user.findUnique({
    where: { email: USER.email },
    select: { id: true },
  })
  if (existingHrUser) {
    await prisma.user.update({
      where: { id: existingHrUser.id },
      data: {
        passwordHash,
        role: 'BRANCH_MANAGER',
        branchName: BRANCH_NAME,
        name: USER.name,
        status: 'ACTIVE',
      },
    })
    console.log(`✓ HRMS User row  updated (id=${existingHrUser.id})`)
  } else {
    const u = await prisma.user.create({
      data: {
        email: USER.email,
        passwordHash,
        role: 'BRANCH_MANAGER',
        branchName: BRANCH_NAME,
        name: USER.name,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    console.log(`✓ HRMS User row  created (id=${u.id})`)
  }

  // Same cleanup for old emails in the local User table.
  for (const oldEmail of PRIOR_EMAILS) {
    if (oldEmail === USER.email) continue
    await prisma.user.deleteMany({ where: { email: oldEmail } })
  }

  // 6. Branch link with BRANCH_MANAGER role
  const existingLink = await prisma.crm_user_branch.findFirst({
    where: { userId: user.id, branchId: branch.id },
    select: { id: true, role: true },
  })
  if (existingLink) {
    if (existingLink.role !== 'BRANCH_MANAGER') {
      await prisma.crm_user_branch.update({
        where: { id: existingLink.id },
        data: { role: 'BRANCH_MANAGER' },
      })
      console.log(`✓ Role updated   BRANCH_MANAGER`)
    } else {
      console.log(`✓ Branch link    already BRANCH_MANAGER`)
    }
  } else {
    await prisma.crm_user_branch.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        branchId: branch.id,
        role: 'BRANCH_MANAGER',
      },
    })
    console.log(`✓ Branch link    BRANCH_MANAGER on ${BRANCH_NAME}`)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Done. Login:')
  console.log(`  Email:    ${USER.email}`)
  console.log(`  Password: ${USER.password}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
