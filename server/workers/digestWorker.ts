/**
 * Digest Worker — crm.digest BullMQ worker.
 *
 * Sends a daily summary email to each branch manager at 08:00 KL time (UTC 00:00).
 *
 * Per branch, the digest includes:
 *  - Opportunities by stage count
 *  - Tasks due today per branch manager
 *  - Leads created today
 *  - Contacts enrolled today (enrolledPackage set)
 */

import { Worker, Queue } from 'bullmq'
import { redisConnection, digestQueue } from '@/lib/crm/queue'
import type { DigestJobData } from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'
import { sendEmail } from '@/lib/crm/email'

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildDigestHtml(opts: {
  branchName: string
  managerName: string | null
  date: string
  stageBreakdown: Array<{ name: string; count: number; color: string }>
  tasksDueToday: number
  leadsCreatedToday: number
  enrolledToday: number
}): string {
  const { branchName, managerName, date, stageBreakdown, tasksDueToday, leadsCreatedToday, enrolledToday } = opts

  const stageRows = stageBreakdown
    .map(
      (s) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:6px;"></span>
            ${s.name}
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${s.count}</td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Digest — ${branchName}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Daily Digest</h1>
              <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">${branchName} &mdash; ${date}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0;color:#374151;font-size:15px;">Hi ${managerName ?? 'Branch Manager'},</p>
              <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">Here&apos;s your daily summary for <strong>${branchName}</strong>.</p>
            </td>
          </tr>

          <!-- KPI cards -->
          <tr>
            <td style="padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:33%;padding:0 6px 0 0;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:700;color:#16a34a;">${leadsCreatedToday}</div>
                      <div style="font-size:12px;color:#15803d;margin-top:4px;">New Leads Today</div>
                    </div>
                  </td>
                  <td style="width:33%;padding:0 3px;">
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:700;color:#2563eb;">${enrolledToday}</div>
                      <div style="font-size:12px;color:#1d4ed8;margin-top:4px;">Enrolled Today</div>
                    </div>
                  </td>
                  <td style="width:33%;padding:0 0 0 6px;">
                    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:28px;font-weight:700;color:#ca8a04;">${tasksDueToday}</div>
                      <div style="font-size:12px;color:#a16207;margin-top:4px;">Tasks Due Today</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pipeline Breakdown -->
          <tr>
            <td style="padding:0 32px 24px;">
              <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#374151;">Pipeline Breakdown</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Stage</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Count</th>
                  </tr>
                </thead>
                <tbody>${stageRows || '<tr><td colspan="2" style="padding:12px;color:#9ca3af;text-align:center;font-size:13px;">No opportunities in pipeline</td></tr>'}</tbody>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Ebright CRM &mdash; Automated Daily Digest<br />
                <a href="https://crm.ebright.my/crm/contacts" style="color:#6366f1;text-decoration:none;">View CRM Dashboard</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Digest generation per branch ─────────────────────────────────────────────

async function generateBranchDigest(tenantId: string, branchId: string): Promise<void> {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  // Load branch info + managers
  const branch = await prisma.crm_branch.findUnique({
    where: { id: branchId },
    include: {
      userBranches: {
        where: { role: 'BRANCH_MANAGER' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      pipelines: {
        include: {
          stages: {
            select: { id: true, name: true, color: true },
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  })

  if (!branch) return

  const managers = branch.userBranches.map((ub) => ub.user)
  if (managers.length === 0) {
    console.warn(`[digestWorker] Branch ${branchId} has no branch managers — skipping`)
    return
  }

  // Stage breakdown: count open opportunities per stage
  const allStages = branch.pipelines.flatMap((p) => p.stages)
  const stageBreakdown: Array<{ name: string; count: number; color: string }> = []

  for (const stage of allStages) {
    const count = await prisma.crm_opportunity.count({
      where: {
        tenantId,
        branchId,
        stageId: stage.id,
        deletedAt: null,
      },
    })
    if (count > 0) {
      stageBreakdown.push({ name: stage.name, count, color: stage.color })
    }
  }

  // Tasks due today (for any user in the branch)
  const tasksDueToday = await prisma.crm_task.count({
    where: {
      tenantId,
      branchId,
      completedAt: null,
      dueAt: { gte: todayStart, lte: todayEnd },
    },
  })

  // Leads created today (contacts created in this branch today)
  const leadsCreatedToday = await prisma.crm_contact.count({
    where: {
      tenantId,
      branchId,
      deletedAt: null,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  })

  // Enrolled today (enrolledPackage set today)
  const enrolledToday = await prisma.crm_contact.count({
    where: {
      tenantId,
      branchId,
      deletedAt: null,
      enrolledPackage: { not: null },
      updatedAt: { gte: todayStart, lte: todayEnd },
    },
  })

  const dateStr = now.toLocaleDateString('en-MY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  })

  // Send to each branch manager
  for (const manager of managers) {
    if (!manager.email) continue

    const html = buildDigestHtml({
      branchName: branch.name,
      managerName: manager.name,
      date: dateStr,
      stageBreakdown,
      tasksDueToday,
      leadsCreatedToday,
      enrolledToday,
    })

    try {
      await sendEmail({
        to: manager.email,
        subject: `Daily Digest — ${branch.name} — ${dateStr}`,
        html,
      })
      console.log(`[digestWorker] Digest sent to ${manager.email} for branch ${branch.name}`)
    } catch (err) {
      console.error(`[digestWorker] Failed to send digest to ${manager.email}:`, err)
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const DIGEST_JOB_NAME = 'crm.digest.daily'

export const digestWorker = new Worker<DigestJobData>(
  'crm.digest',
  async (job) => {
    if (job.name === DIGEST_JOB_NAME) {
      // Repeatable job: iterate all tenants and branches
      const branches = await prisma.crm_branch.findMany({
        select: { id: true, tenantId: true },
      })

      await Promise.allSettled(
        branches.map((branch) => generateBranchDigest(branch.tenantId, branch.id)),
      )

      console.log(`[digestWorker] Daily digest complete for ${branches.length} branches`)
      return
    }

    // Individual branch digest (triggered on-demand)
    const { tenantId, branchId } = job.data
    await generateBranchDigest(tenantId, branchId)
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
)

digestWorker.on('completed', (job) => {
  console.log(`[digestWorker] Job ${job.id} completed`)
})

digestWorker.on('failed', (job, err) => {
  console.error(`[digestWorker] Job ${job?.id} failed:`, err.message)
})

// ─── Schedule the daily digest ────────────────────────────────────────────────
// Runs daily at 08:00 KL time = UTC 00:00

export async function scheduleDigest(): Promise<void> {
  await digestQueue.add(
    DIGEST_JOB_NAME,
    // Placeholder data — the repeatable job iterates all branches internally
    { tenantId: 'all', branchId: 'all', frequency: 'daily' },
    {
      repeat: { pattern: '0 0 * * *' }, // every day at UTC 00:00 = 08:00 KL
      jobId: 'crm-digest-daily',
    },
  )
  console.log('[digestWorker] Daily digest repeatable job scheduled (UTC 00:00 = 08:00 KL)')
}

export default digestWorker
