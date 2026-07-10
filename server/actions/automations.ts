'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/crm/auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { logAudit } from '@/lib/crm/audit'
import { enqueueAutomation } from '@/lib/crm/queue'
import {
  CreateAutomationSchema,
  UpdateAutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from '@/lib/crm/validations/automation'

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getSessionAndTenant(): Promise<{
  userId: string
  userEmail: string
  tenantId: string
}> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error('Unauthorized')

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })

  if (!userBranch) throw new Error('User has no branch assignment')

  return {
    userId: session.user.id,
    userEmail: session.user.email ?? '',
    tenantId: userBranch.tenantId,
  }
}

// ─── createAutomation ─────────────────────────────────────────────────────────

export async function createAutomation(
  branchId: string,
  data: CreateAutomationInput,
): Promise<{ success: true; automationId: string } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    const parsed = CreateAutomationSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Validation error',
      }
    }

    const { name, triggerType, triggerConfig, graph, enabled } = parsed.data

    const automation = await prisma.crm_automation.create({
      data: scope.data({
        branchId: branchId || null,
        name,
        triggerType,
        triggerConfig: triggerConfig as Parameters<typeof prisma.crm_automation.create>[0]['data']['triggerConfig'],
        graph: graph as Parameters<typeof prisma.crm_automation.create>[0]['data']['graph'],
        enabled,
      }),
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'CREATE',
      entity: 'crm_automation',
      entityId: automation.id,
      meta: { name, triggerType, branchId },
    })

    revalidatePath('/crm/automations')
    return { success: true, automationId: automation.id }
  } catch (err) {
    console.error('[createAutomation]', err)
    return { success: false, error: 'Failed to create automation' }
  }
}

// ─── updateAutomation ─────────────────────────────────────────────────────────

export async function updateAutomation(
  automationId: string,
  data: UpdateAutomationInput,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    const parsed = UpdateAutomationSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Validation error',
      }
    }

    const updateData = parsed.data

    await prisma.crm_automation.update({
      where: scope.where({ id: automationId }),
      data: {
        ...(updateData.name !== undefined && { name: updateData.name }),
        ...(updateData.triggerType !== undefined && { triggerType: updateData.triggerType }),
        ...(updateData.triggerConfig !== undefined && {
          triggerConfig: updateData.triggerConfig as Parameters<typeof prisma.crm_automation.update>[0]['data']['triggerConfig'],
        }),
        ...(updateData.graph !== undefined && {
          graph: updateData.graph as Parameters<typeof prisma.crm_automation.update>[0]['data']['graph'],
        }),
        ...(updateData.enabled !== undefined && { enabled: updateData.enabled }),
        ...(updateData.branchId !== undefined && { branchId: updateData.branchId ?? null }),
      },
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'UPDATE',
      entity: 'crm_automation',
      entityId: automationId,
      meta: { updatedFields: Object.keys(updateData) },
    })

    revalidatePath('/crm/automations')
    revalidatePath(`/crm/automations/${automationId}`)
    return { success: true }
  } catch (err) {
    console.error('[updateAutomation]', err)
    return { success: false, error: 'Failed to update automation' }
  }
}

// ─── deleteAutomation ─────────────────────────────────────────────────────────

export async function deleteAutomation(
  automationId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    await prisma.crm_automation.delete({
      where: scope.where({ id: automationId }),
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'DELETE',
      entity: 'crm_automation',
      entityId: automationId,
    })

    revalidatePath('/crm/automations')
    return { success: true }
  } catch (err) {
    console.error('[deleteAutomation]', err)
    return { success: false, error: 'Failed to delete automation' }
  }
}

// ─── toggleAutomation ─────────────────────────────────────────────────────────

export async function toggleAutomation(
  automationId: string,
  enabled: boolean,
): Promise<{ success: true; enabled: boolean } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    await prisma.crm_automation.update({
      where: scope.where({ id: automationId }),
      data: { enabled },
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'UPDATE',
      entity: 'crm_automation',
      entityId: automationId,
      meta: { toggle: enabled ? 'enabled' : 'disabled' },
    })

    revalidatePath('/crm/automations')
    return { success: true, enabled }
  } catch (err) {
    console.error('[toggleAutomation]', err)
    return { success: false, error: 'Failed to toggle automation' }
  }
}

// ─── duplicateAutomation ──────────────────────────────────────────────────────

export async function duplicateAutomation(
  automationId: string,
): Promise<{ success: true; automationId: string } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    const source = await prisma.crm_automation.findUnique({
      where: scope.where({ id: automationId }),
    })

    if (!source) {
      return { success: false, error: 'Automation not found' }
    }

    const clone = await prisma.crm_automation.create({
      data: scope.data({
        branchId: source.branchId ?? null,
        name: `Copy of ${source.name}`,
        triggerType: source.triggerType,
        triggerConfig: (source.triggerConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        graph: (source.graph ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        enabled: false, // always disabled on clone
      }),
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'CREATE',
      entity: 'crm_automation',
      entityId: clone.id,
      meta: { duplicatedFrom: automationId },
    })

    revalidatePath('/crm/automations')
    return { success: true, automationId: clone.id }
  } catch (err) {
    console.error('[duplicateAutomation]', err)
    return { success: false, error: 'Failed to duplicate automation' }
  }
}

// ─── triggerAutomationTest ────────────────────────────────────────────────────

export async function triggerAutomationTest(
  automationId: string,
  contactId: string,
): Promise<{ success: true; runId: string } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    // Verify the automation exists and belongs to this tenant
    const automation = await prisma.crm_automation.findUnique({
      where: scope.where({ id: automationId }),
    })

    if (!automation) {
      return { success: false, error: 'Automation not found' }
    }

    // Create a pre-run record so the UI can track it
    const run = await prisma.crm_automation_run.create({
      data: {
        tenantId,
        automationId,
        contactId: contactId || null,
        status: 'PENDING',
      },
    })

    // Enqueue the job
    await enqueueAutomation({
      automationId,
      contactId,
      tenantId,
      triggeredBy: `test:${userId}`,
      triggerPayload: { test: true, runId: run.id },
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'UPDATE',
      entity: 'crm_automation',
      entityId: automationId,
      meta: { action: 'test_run', contactId, runId: run.id },
    })

    return { success: true, runId: run.id }
  } catch (err) {
    console.error('[triggerAutomationTest]', err)
    return { success: false, error: 'Failed to trigger test run' }
  }
}
