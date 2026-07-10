'use server'

import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { scopedPrisma } from '@/lib/crm/tenancy'
import type { CrmUserRole } from '@/lib/crm/permissions'
import { Resend } from 'resend'

// Lazy: Resend's constructor throws on an empty key, which would crash
// `next build`'s page-data step (no env at build time). Only construct on
// the first send.
let _resend: Resend | null = null
function getResend(): Resend {
  return (_resend ??= new Resend(process.env.RESEND_API_KEY ?? 'test-no-api-key'))
}

// ─── Invite User ──────────────────────────────────────────────────────────────

export async function inviteUser(
  tenantId: string,
  invitedByUserId: string,
  email: string,
  role: CrmUserRole,
  branchIds: string[],
) {
  const scope = scopedPrisma(tenantId)

  // Check if user already exists
  let authUser = await prisma.crm_auth_user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  })

  if (!authUser) {
    // Create the auth user (no password — they'll set it via invite link)
    authUser = await prisma.crm_auth_user.create({
      data: {
        email,
        emailVerified: false,
        name: email.split('@')[0],
      },
      select: { id: true, email: true, name: true },
    })
  }

  // Upsert user_branch records for each branch
  for (const branchId of branchIds) {
    await prisma.crm_user_branch.upsert({
      where: { userId_branchId: { userId: authUser.id, branchId } },
      create: {
        userId: authUser.id,
        branchId,
        tenantId,
        role: role as never,
      },
      update: { role: role as never },
    })
  }

  // Send invite email
  try {
    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@ebright.my',
      to: email,
      subject: 'You have been invited to Ebright CRM',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Welcome to Ebright CRM</h2>
          <p style="color: #475569; margin-bottom: 24px;">
            You've been invited to join the team as <strong>${role.replace('_', ' ')}</strong>.
          </p>
          <a
            href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.ebright.my'}/crm/login"
            style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;"
          >
            Accept Invitation
          </a>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
            Use this email address (${email}) to log in.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[inviteUser] Resend failed:', err)
    // Don't throw — user was still created
  }

  void logAudit({
    tenantId,
    userId: invitedByUserId,
    action: 'CREATE',
    entity: 'crm_user_branch',
    entityId: authUser.id,
    meta: { email, role, branchIds },
  })

  return { userId: authUser.id, email: authUser.email }
}

// ─── Update User Role ─────────────────────────────────────────────────────────

export async function updateUserRole(
  tenantId: string,
  actingUserId: string,
  userId: string,
  branchId: string,
  role: CrmUserRole,
) {
  const scope = scopedPrisma(tenantId)

  const existing = await prisma.crm_user_branch.findFirst({
    where: scope.where({ userId, branchId }),
    select: { id: true },
  })

  if (!existing) throw new Error('User branch record not found')

  await prisma.crm_user_branch.updateMany({
    where: { tenantId, userId, branchId },
    data: { role: role as never },
  })

  void logAudit({
    tenantId,
    userId: actingUserId,
    action: 'UPDATE',
    entity: 'crm_user_branch',
    entityId: userId,
    meta: { branchId, newRole: role },
  })
}

// ─── Deactivate User ──────────────────────────────────────────────────────────

export async function deactivateUser(
  tenantId: string,
  actingUserId: string,
  userId: string,
) {
  // Remove all branch associations for this user in this tenant
  await prisma.crm_user_branch.deleteMany({
    where: { tenantId, userId },
  })

  void logAudit({
    tenantId,
    userId: actingUserId,
    action: 'DELETE',
    entity: 'crm_user_branch',
    entityId: userId,
    meta: { action: 'deactivate' },
  })
}
