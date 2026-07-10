/**
 * Automation Execution Engine — crm.automation BullMQ worker.
 *
 * Processes automation graph jobs node-by-node (depth-first traversal).
 * Each node type has a dedicated handler. Delay nodes re-enqueue the same
 * job with a BullMQ delay. IfElse condition nodes return 'yes' | 'no' to
 * guide edge traversal.
 */

import { Worker, type Job } from 'bullmq'
import { redisConnection, automationQueue, messageSenderQueue } from '@/lib/crm/queue'
import type { AutomationJobData } from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'
import { renderTemplate } from '@/lib/crm/template'
import type { TemplateContext } from '@/lib/crm/template'
import { getWhatsAppProvider } from '@/lib/crm/whatsapp/factory'
import { sendEmail } from '@/lib/crm/email'
import type { AutomationNode, AutomationEdge } from '@/lib/crm/validations/automation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeExecutionContext {
  automationId: string
  contactId: string
  tenantId: string
  runId: string
  logs: Array<{
    nodeId: string
    action: string
    status: 'ok' | 'error'
    message: string
    ts: string
  }>
}

interface AutomationGraph {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
}

// ─── Log helper ───────────────────────────────────────────────────────────────

function appendLog(
  ctx: NodeExecutionContext,
  nodeId: string,
  action: string,
  status: 'ok' | 'error',
  message: string,
) {
  ctx.logs.push({ nodeId, action, status, message, ts: new Date().toISOString() })
}

async function persistLogs(runId: string, logs: NodeExecutionContext['logs']) {
  await prisma.crm_automation_run.update({
    where: { id: runId },
    data: { logs: logs as unknown as Parameters<typeof prisma.crm_automation_run.update>[0]['data']['logs'] },
  })
}

// ─── Load contact + branch context ───────────────────────────────────────────

async function loadTemplateContext(
  contactId: string,
  tenantId: string,
): Promise<{ context: TemplateContext; contact: Awaited<ReturnType<typeof prisma.crm_contact.findFirst>>; branchId: string }> {
  const contact = await prisma.crm_contact.findFirst({
    where: { id: contactId, tenantId, deletedAt: null },
    include: {
      branch: { select: { id: true, name: true, phone: true, email: true, address: true } },
      opportunities: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { value: true },
      },
    },
  })

  const branch = contact?.branch
  const branchId = branch?.id ?? ''

  const context: TemplateContext = {
    contact: {
      firstName: contact?.firstName,
      lastName: contact?.lastName ?? undefined,
      email: contact?.email ?? undefined,
      phone: contact?.phone ?? undefined,
      childName1: contact?.childName1 ?? undefined,
      childAge1: contact?.childAge1 ?? undefined,
      childName2: contact?.childName2 ?? undefined,
      childAge2: contact?.childAge2 ?? undefined,
      childName3: contact?.childName3 ?? undefined,
      childAge3: contact?.childAge3 ?? undefined,
      childName4: contact?.childName4 ?? undefined,
      childAge4: contact?.childAge4 ?? undefined,
      preferredTrialDay: contact?.preferredTrialDay ?? undefined,
      enrolledPackage: contact?.enrolledPackage ?? undefined,
    },
    branch: {
      name: branch?.name,
      phone: branch?.phone ?? undefined,
      email: branch?.email ?? undefined,
      address: branch?.address ?? undefined,
    },
    opportunity: {
      value: contact?.opportunities[0]?.value?.toString(),
    },
  }

  return { context, contact, branchId }
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

async function handleSendWhatsApp(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<void> {
  const { context, contact, branchId } = await loadTemplateContext(ctx.contactId, ctx.tenantId)

  if (!contact?.phone) {
    appendLog(ctx, node.id, 'SEND_WHATSAPP', 'error', 'Contact has no phone number')
    return
  }

  const provider = await getWhatsAppProvider(branchId)
  if (!provider) {
    appendLog(ctx, node.id, 'SEND_WHATSAPP', 'error', `No WhatsApp provider configured for branch ${branchId}`)
    return
  }

  const templateBody = (node.data.body as string | undefined) ?? ''
  const body = renderTemplate(templateBody, context)

  const result = await provider.sendText(contact.phone, body)

  await prisma.crm_message.create({
    data: {
      tenantId: ctx.tenantId,
      branchId,
      contactId: ctx.contactId,
      channel: 'WHATSAPP',
      direction: 'OUT',
      body,
      status: 'sent',
      providerMessageId: (result as { messageId?: string } | undefined)?.messageId ?? null,
    },
  })

  appendLog(ctx, node.id, 'SEND_WHATSAPP', 'ok', `WhatsApp sent to ${contact.phone}`)
}

async function handleSendEmail(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<void> {
  const { context, contact, branchId } = await loadTemplateContext(ctx.contactId, ctx.tenantId)

  const toOverride = node.data.to as string | undefined
  const to = toOverride ?? contact?.email ?? ''
  if (!to) {
    appendLog(ctx, node.id, 'SEND_EMAIL', 'error', 'No email address for contact')
    return
  }

  const subject = (node.data.subject as string | undefined) ?? 'Message from Ebright'
  const templateBody = (node.data.body as string | undefined) ?? ''
  const html = renderTemplate(templateBody, context)

  const { id: emailId } = await sendEmail({ to, subject, html })

  await prisma.crm_message.create({
    data: {
      tenantId: ctx.tenantId,
      branchId,
      contactId: ctx.contactId,
      channel: 'EMAIL',
      direction: 'OUT',
      body: html,
      subject,
      status: 'sent',
      providerMessageId: emailId,
    },
  })

  appendLog(ctx, node.id, 'SEND_EMAIL', 'ok', `Email sent to ${to} (resend id: ${emailId})`)
}

async function handleAddTag(node: AutomationNode, ctx: NodeExecutionContext): Promise<void> {
  const tagId = node.data.tagId as string | undefined
  if (!tagId) {
    appendLog(ctx, node.id, 'ADD_TAG', 'error', 'tagId missing from node data')
    return
  }

  await prisma.crm_contact_tag.upsert({
    where: { contactId_tagId: { contactId: ctx.contactId, tagId } },
    create: { contactId: ctx.contactId, tagId },
    update: {},
  })

  appendLog(ctx, node.id, 'ADD_TAG', 'ok', `Tag ${tagId} added to contact ${ctx.contactId}`)
}

async function handleRemoveTag(node: AutomationNode, ctx: NodeExecutionContext): Promise<void> {
  const tagId = node.data.tagId as string | undefined
  if (!tagId) {
    appendLog(ctx, node.id, 'REMOVE_TAG', 'error', 'tagId missing from node data')
    return
  }

  await prisma.crm_contact_tag.deleteMany({
    where: { contactId: ctx.contactId, tagId },
  })

  appendLog(ctx, node.id, 'REMOVE_TAG', 'ok', `Tag ${tagId} removed from contact ${ctx.contactId}`)
}

async function handleMoveStage(node: AutomationNode, ctx: NodeExecutionContext): Promise<void> {
  const stageId = node.data.stageId as string | undefined
  if (!stageId) {
    appendLog(ctx, node.id, 'MOVE_STAGE', 'error', 'stageId missing from node data')
    return
  }

  // Find latest opportunity for the contact
  const opportunity = await prisma.crm_opportunity.findFirst({
    where: { contactId: ctx.contactId, tenantId: ctx.tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, stageId: true },
  })

  if (!opportunity) {
    appendLog(ctx, node.id, 'MOVE_STAGE', 'error', 'No open opportunity found for contact')
    return
  }

  await prisma.crm_opportunity.update({
    where: { id: opportunity.id },
    data: { stageId, lastStageChangeAt: new Date() },
  })

  await prisma.crm_stage_history.create({
    data: {
      tenantId: ctx.tenantId,
      opportunityId: opportunity.id,
      fromStageId: opportunity.stageId,
      toStageId: stageId,
      note: 'Moved by automation',
    },
  })

  appendLog(ctx, node.id, 'MOVE_STAGE', 'ok', `Opportunity ${opportunity.id} moved to stage ${stageId}`)
}

async function handleAssignUser(node: AutomationNode, ctx: NodeExecutionContext): Promise<void> {
  const assignedUserId = node.data.userId as string | undefined
  if (!assignedUserId) {
    appendLog(ctx, node.id, 'ASSIGN_USER', 'error', 'userId missing from node data')
    return
  }

  await prisma.crm_contact.update({
    where: { id: ctx.contactId },
    data: { assignedUserId },
  })

  appendLog(ctx, node.id, 'ASSIGN_USER', 'ok', `Contact assigned to user ${assignedUserId}`)
}

async function handleCreateTask(node: AutomationNode, ctx: NodeExecutionContext): Promise<void> {
  const title = (node.data.title as string | undefined) ?? 'Follow up'
  const dueOffsetHours = (node.data.dueOffsetHours as number | undefined) ?? 24
  const assignedUserId = (node.data.assignedUserId as string | undefined) ?? undefined

  // Resolve branchId from contact
  const contact = await prisma.crm_contact.findUnique({
    where: { id: ctx.contactId },
    select: { branchId: true },
  })

  if (!contact) {
    appendLog(ctx, node.id, 'CREATE_TASK', 'error', 'Contact not found')
    return
  }

  const dueAt = new Date(Date.now() + dueOffsetHours * 60 * 60 * 1000)

  const task = await prisma.crm_task.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: contact.branchId,
      contactId: ctx.contactId,
      title,
      dueAt,
      assignedUserId: assignedUserId ?? null,
    },
  })

  appendLog(ctx, node.id, 'CREATE_TASK', 'ok', `Task "${title}" created (id: ${task.id})`)
}

async function handleDelay(
  node: AutomationNode,
  ctx: NodeExecutionContext,
  job: Job<AutomationJobData>,
): Promise<void> {
  const delayMs = (node.data.delayMs as number | undefined) ?? 3_600_000 // default 1 hour

  // Re-enqueue the job with the delay, starting from the NEXT node
  const resumeFromNodeId = node.id
  const newPayload: AutomationJobData & { resumeFromNodeId?: string } = {
    ...(job.data as AutomationJobData),
    resumeFromNodeId,
  }

  await automationQueue.add(
    `automation:${ctx.automationId}:${ctx.contactId}:resume`,
    newPayload,
    {
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  )

  appendLog(ctx, node.id, 'DELAY', 'ok', `Delay of ${delayMs}ms scheduled — job re-enqueued`)
}

async function handleIfElse(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<'yes' | 'no'> {
  const field = (node.data.field as string | undefined) ?? ''
  const operator = (node.data.operator as string | undefined) ?? 'equals'
  const value = node.data.value

  // Load full contact with latest opportunity and stage
  const contact = await prisma.crm_contact.findUnique({
    where: { id: ctx.contactId },
    include: {
      opportunities: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { stage: true },
      },
      contactTags: { include: { tag: true } },
    },
  })

  if (!contact) {
    appendLog(ctx, node.id, 'IF_ELSE', 'error', 'Contact not found for condition evaluation')
    return 'no'
  }

  // Resolve the actual field value
  let actualValue: unknown

  switch (field) {
    case 'contact.leadSource':
      actualValue = contact.leadSourceId
      break
    case 'contact.assignedUserId':
      actualValue = contact.assignedUserId
      break
    case 'contact.phone':
      actualValue = contact.phone
      break
    case 'contact.email':
      actualValue = contact.email
      break
    case 'contact.enrolledPackage':
      actualValue = contact.enrolledPackage
      break
    case 'stage.shortCode':
      actualValue = contact.opportunities[0]?.stage?.shortCode
      break
    case 'stage.id':
      actualValue = contact.opportunities[0]?.stageId
      break
    case 'tag.name': {
      const tagNames = contact.contactTags.map((ct) => ct.tag.name)
      actualValue = tagNames.join(',')
      break
    }
    default:
      actualValue = undefined
  }

  let result = false

  switch (operator) {
    case 'equals':
      result = actualValue === value
      break
    case 'not_equals':
      result = actualValue !== value
      break
    case 'contains':
      result = typeof actualValue === 'string' && typeof value === 'string'
        ? actualValue.toLowerCase().includes((value as string).toLowerCase())
        : false
      break
    case 'not_contains':
      result = typeof actualValue === 'string' && typeof value === 'string'
        ? !actualValue.toLowerCase().includes((value as string).toLowerCase())
        : true
      break
    case 'exists':
      result = actualValue !== null && actualValue !== undefined && actualValue !== ''
      break
    case 'not_exists':
      result = actualValue === null || actualValue === undefined || actualValue === ''
      break
    default:
      result = actualValue === value
  }

  const branch = result ? 'yes' : 'no'
  appendLog(ctx, node.id, 'IF_ELSE', 'ok', `Condition evaluated: ${field} ${operator} ${String(value)} → ${branch}`)
  return branch
}

async function handleSendInternalNotification(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<void> {
  const targetUserId = node.data.userId as string | undefined
  const body = (node.data.body as string | undefined) ?? 'Automation notification'
  const title = (node.data.title as string | undefined) ?? 'Automation Alert'

  if (!targetUserId) {
    appendLog(ctx, node.id, 'SEND_INTERNAL_NOTIFICATION', 'error', 'userId missing from node data')
    return
  }

  await prisma.crm_notification.create({
    data: {
      tenantId: ctx.tenantId,
      userId: targetUserId,
      type: 'AUTOMATION',
      title,
      body,
      link: `/crm/contacts/${ctx.contactId}`,
    },
  })

  appendLog(ctx, node.id, 'SEND_INTERNAL_NOTIFICATION', 'ok', `Notification sent to user ${targetUserId}`)
}

async function handleUpdateField(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<void> {
  const field = node.data.field as string | undefined
  const value = node.data.value

  if (!field) {
    appendLog(ctx, node.id, 'UPDATE_FIELD', 'error', 'field missing from node data')
    return
  }

  // Map field names to Prisma contact fields
  const allowedFields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'enrolledPackage',
    'assignedUserId',
    'preferredBranchId',
  ]

  if (allowedFields.includes(field)) {
    await prisma.crm_contact.update({
      where: { id: ctx.contactId },
      data: { [field]: value },
    })
    appendLog(ctx, node.id, 'UPDATE_FIELD', 'ok', `Contact field "${field}" updated to "${String(value)}"`)
  } else {
    // Treat as custom value key
    const contact = await prisma.crm_contact.findUnique({
      where: { id: ctx.contactId },
      select: { branchId: true },
    })
    if (contact) {
      await prisma.crm_custom_value.upsert({
        where: {
          tenantId_scope_scopeId_key: {
            tenantId: ctx.tenantId,
            scope: 'BRANCH',
            scopeId: contact.branchId,
            key: field,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          key: field,
          value: String(value),
          scope: 'BRANCH',
          scopeId: contact.branchId,
        },
        update: { value: String(value) },
      })
      appendLog(ctx, node.id, 'UPDATE_FIELD', 'ok', `Custom value "${field}" updated`)
    }
  }
}

async function handleSendSms(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<void> {
  const { context, contact } = await loadTemplateContext(ctx.contactId, ctx.tenantId)

  if (!contact?.phone) {
    appendLog(ctx, node.id, 'SEND_SMS', 'error', 'Contact has no phone number')
    return
  }

  const templateBody = (node.data.body as string | undefined) ?? ''
  const body = renderTemplate(templateBody, context)

  // Enqueue to shared cross-module SMS queue
  const { Queue } = await import('bullmq')
  const { redisConnection: conn } = await import('@/lib/crm/queue')
  const ebrightEvents = new Queue('ebright.events', { connection: conn })
  await ebrightEvents.add('sms_request', {
    type: 'SMS_REQUEST',
    to: contact.phone,
    body,
    tenantId: ctx.tenantId,
  })

  appendLog(ctx, node.id, 'SEND_SMS', 'ok', `SMS enqueued to ${contact.phone}`)
}

async function handleSendWebhook(
  node: AutomationNode,
  ctx: NodeExecutionContext,
): Promise<void> {
  const url = node.data.url as string | undefined
  if (!url) {
    appendLog(ctx, node.id, 'SEND_WEBHOOK', 'error', 'url missing from node data')
    return
  }

  const contact = await prisma.crm_contact.findUnique({
    where: { id: ctx.contactId },
    include: {
      branch: { select: { name: true } },
      contactTags: { include: { tag: true } },
    },
  })

  const payload = {
    event: 'automation.triggered',
    automationId: ctx.automationId,
    tenantId: ctx.tenantId,
    contact: contact
      ? {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          branchId: contact.branchId,
          branchName: contact.branch?.name,
          tags: contact.contactTags.map((ct) => ct.tag.name),
        }
      : { id: ctx.contactId },
    ts: new Date().toISOString(),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    appendLog(ctx, node.id, 'SEND_WEBHOOK', 'error', `Webhook POST returned ${res.status}`)
    throw new Error(`Webhook failed with status ${res.status}`)
  }

  appendLog(ctx, node.id, 'SEND_WEBHOOK', 'ok', `Webhook delivered to ${url} (${res.status})`)
}

// ─── Graph traversal ──────────────────────────────────────────────────────────

async function executeNode(
  node: AutomationNode,
  graph: AutomationGraph,
  ctx: NodeExecutionContext,
  job: Job<AutomationJobData>,
  visited: Set<string>,
): Promise<void> {
  if (visited.has(node.id)) return
  visited.add(node.id)

  try {
    switch (node.type) {
      case 'trigger':
        // Trigger nodes are entry points — nothing to execute
        appendLog(ctx, node.id, 'TRIGGER', 'ok', `Trigger node processed`)
        break

      case 'action': {
        const actionType = node.data.actionType as string | undefined
        switch (actionType) {
          case 'SEND_WHATSAPP':
            await handleSendWhatsApp(node, ctx)
            break
          case 'SEND_EMAIL':
            await handleSendEmail(node, ctx)
            break
          case 'SEND_SMS':
            await handleSendSms(node, ctx)
            break
          case 'ADD_TAG':
            await handleAddTag(node, ctx)
            break
          case 'REMOVE_TAG':
            await handleRemoveTag(node, ctx)
            break
          case 'MOVE_STAGE':
            await handleMoveStage(node, ctx)
            break
          case 'ASSIGN_USER':
            await handleAssignUser(node, ctx)
            break
          case 'CREATE_TASK':
            await handleCreateTask(node, ctx)
            break
          case 'SEND_INTERNAL_NOTIFICATION':
            await handleSendInternalNotification(node, ctx)
            break
          case 'UPDATE_FIELD':
            await handleUpdateField(node, ctx)
            break
          case 'SEND_WEBHOOK':
            await handleSendWebhook(node, ctx)
            break
          default:
            appendLog(ctx, node.id, 'ACTION', 'error', `Unknown action type: ${String(actionType)}`)
        }
        break
      }

      case 'delay': {
        // Delay node re-enqueues the job and stops current traversal
        await handleDelay(node, ctx, job)
        return // Stop traversal — will resume in new job
      }

      case 'condition': {
        // IfElse evaluates and follows only the matching branch
        const branch = await handleIfElse(node, ctx)
        const nextEdges = graph.edges.filter(
          (e) => e.source === node.id && e.sourceHandle === branch,
        )
        for (const edge of nextEdges) {
          const nextNode = graph.nodes.find((n) => n.id === edge.target)
          if (nextNode) {
            await executeNode(nextNode, graph, ctx, job, visited)
          }
        }
        // Already traversed conditional branches — return early to avoid
        // executing default "follow all edges" logic below
        return
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendLog(ctx, node.id, node.type.toUpperCase(), 'error', msg)
    throw err
  }

  // Follow outgoing edges (except for condition nodes, which returned early)
  const outgoingEdges = graph.edges.filter((e) => e.source === node.id)
  for (const edge of outgoingEdges) {
    const nextNode = graph.nodes.find((n) => n.id === edge.target)
    if (nextNode) {
      await executeNode(nextNode, graph, ctx, job, visited)
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const automationWorker = new Worker<AutomationJobData>(
  'crm.automation',
  async (job) => {
    const { automationId, contactId, tenantId, triggeredBy, triggerPayload } = job.data
    const resumeFromNodeId = (job.data as AutomationJobData & { resumeFromNodeId?: string }).resumeFromNodeId

    // Load automation
    const automation = await prisma.crm_automation.findUnique({
      where: { id: automationId },
      select: { graph: true, enabled: true, name: true },
    })

    if (!automation) {
      throw new Error(`Automation ${automationId} not found`)
    }

    if (!automation.enabled) {
      console.warn(`[automationWorker] Automation ${automationId} is disabled — skipping`)
      return
    }

    const graph = automation.graph as unknown as AutomationGraph
    if (!graph.nodes || !graph.edges) {
      throw new Error(`Automation ${automationId} has invalid graph`)
    }

    // Create run record
    const run = await prisma.crm_automation_run.create({
      data: {
        tenantId,
        automationId,
        contactId: contactId || null,
        status: 'RUNNING',
      },
    })

    const ctx: NodeExecutionContext = {
      automationId,
      contactId,
      tenantId,
      runId: run.id,
      logs: [],
    }

    try {
      appendLog(ctx, 'system', 'START', 'ok', `Run ${run.id} started. TriggeredBy: ${triggeredBy}`)

      let startNode: AutomationNode | undefined

      if (resumeFromNodeId) {
        // Resume after a delay node — find the node AFTER the delay node
        const delayEdges = graph.edges.filter((e) => e.source === resumeFromNodeId)
        if (delayEdges.length > 0) {
          startNode = graph.nodes.find((n) => n.id === delayEdges[0]!.target)
        }
        if (!startNode) {
          appendLog(ctx, 'system', 'RESUME', 'ok', 'No node found after delay — automation complete')
          await prisma.crm_automation_run.update({
            where: { id: run.id },
            data: { status: 'COMPLETED', completedAt: new Date(), logs: ctx.logs as Parameters<typeof prisma.crm_automation_run.update>[0]['data']['logs'] },
          })
          return
        }
      } else {
        // Start from the trigger node
        startNode = graph.nodes.find((n) => n.type === 'trigger')
      }

      if (!startNode) {
        throw new Error('No trigger node found in automation graph')
      }

      const visited = new Set<string>()
      await executeNode(startNode, graph, ctx, job, visited)

      await persistLogs(run.id, ctx.logs)
      await prisma.crm_automation_run.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(ctx, 'system', 'FAIL', 'error', msg)
      await persistLogs(run.id, ctx.logs)
      await prisma.crm_automation_run.update({
        where: { id: run.id },
        data: { status: 'FAILED', completedAt: new Date() },
      })

      // Create admin notification for the branch manager
      try {
        const automation2 = await prisma.crm_automation.findUnique({
          where: { id: automationId },
          select: { branchId: true, name: true },
        })
        if (automation2?.branchId) {
          const branch = await prisma.crm_branch.findUnique({
            where: { id: automation2.branchId },
            select: { branchManagerId: true },
          })
          if (branch?.branchManagerId) {
            await prisma.crm_notification.create({
              data: {
                tenantId,
                userId: branch.branchManagerId,
                type: 'AUTOMATION_FAILED',
                title: `Automation Failed: ${automation2.name}`,
                body: `Run ${run.id} failed: ${msg}`,
                link: `/crm/automations/${automationId}`,
              },
            })
          }
        }
      } catch (notifErr) {
        console.error('[automationWorker] Failed to create failure notification', notifErr)
      }

      throw err
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
    // Retry policy (attempts/backoff) is set per-job via queue defaults in
    // lib/crm/queue.ts — BullMQ v5 moved these out of WorkerOptions.
  },
)

automationWorker.on('completed', (job) => {
  console.log(`[automationWorker] Job ${job.id} completed`)
})

automationWorker.on('failed', (job, err) => {
  console.error(`[automationWorker] Job ${job?.id} failed:`, err.message)
})

export default automationWorker
