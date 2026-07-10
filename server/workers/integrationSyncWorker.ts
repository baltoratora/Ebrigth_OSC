/**
 * BullMQ worker for crm.integration_sync queue.
 *
 * Handles:
 *  - GOOGLE_FORMS: reads new rows from a Google Sheet, maps columns to contacts
 *
 * Start with: npm run worker
 */

import { Worker, type Job } from 'bullmq'
import { redisConnection, type IntegrationSyncJobData } from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'
import { decrypt, encrypt } from '@/lib/crm/crypto'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

// ─── Google Sheets helpers ─────────────────────────────────────────────────────

interface SheetsValueRange {
  values?: string[][]
  range?: string
}

interface GoogleTokenRefreshResponse {
  access_token: string
  expires_in?: number
  error?: string
}

async function refreshGoogleToken(integrationId: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })

  if (!res.ok) {
    throw new Error(`[SheetsSync] Token refresh failed: ${res.status}`)
  }

  const data = (await res.json()) as GoogleTokenRefreshResponse
  if (data.error) throw new Error(`[SheetsSync] Token refresh error: ${data.error}`)

  // Persist refreshed token
  await prisma.crm_integration_oauth_token.updateMany({
    where: { integrationId },
    data: {
      accessToken: encrypt(data.access_token),
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      updatedAt: new Date(),
    },
  })

  return data.access_token
}

async function getSheetRows(
  sheetId: string,
  range: string,
  accessToken: string,
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 401) {
    throw Object.assign(new Error('TOKEN_EXPIRED'), { code: 'TOKEN_EXPIRED' })
  }

  if (!res.ok) {
    throw new Error(`[SheetsSync] Sheets API error: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as SheetsValueRange
  return data.values ?? []
}

// ─── Column mapping → contact fields ──────────────────────────────────────────

interface ColumnMapping {
  name?: number
  firstName?: number
  lastName?: number
  email?: number
  phone?: number
  childName?: number
  childAge?: number
}

function mapRowToContact(row: string[], mapping: ColumnMapping): {
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  childName1: string | null
  childAge1: string | null
} {
  const get = (idx: number | undefined): string => (idx !== undefined ? (row[idx] ?? '').trim() : '')

  let firstName = get(mapping.firstName)
  let lastName: string | null = get(mapping.lastName) || null

  // If only 'name' column is specified, split it
  if (!firstName && mapping.name !== undefined) {
    const full = get(mapping.name)
    const parts = full.split(/\s+/)
    firstName = parts[0] ?? 'Unknown'
    lastName = parts.slice(1).join(' ') || null
  }

  const rawPhone = get(mapping.phone)
  const phone = rawPhone ? normalizePhone(rawPhone) : null
  const email = get(mapping.email) || null

  return {
    firstName: firstName || 'Unknown',
    lastName,
    email,
    phone,
    childName1: get(mapping.childName) || null,
    childAge1: get(mapping.childAge) || null,
  }
}

// ─── GOOGLE_FORMS sync handler ────────────────────────────────────────────────

async function syncGoogleForms(data: IntegrationSyncJobData): Promise<void> {
  const integration = await prisma.crm_integration.findUnique({
    where: { id: data.integrationId },
    select: {
      id: true,
      meta: true,
      lastSyncAt: true,
      oauthTokens: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  if (!integration?.oauthTokens?.[0]) {
    throw new Error(`[SheetsSync] No OAuth token for integration ${data.integrationId}`)
  }

  const meta = (integration.meta ?? {}) as {
    sheetId?: string
    sheetRange?: string
    columnMapping?: ColumnMapping
    headerRow?: boolean
    lastProcessedRow?: number
  }

  const sheetId = meta.sheetId
  if (!sheetId) {
    console.warn(`[SheetsSync] No sheetId configured for integration ${data.integrationId}`)
    return
  }

  const sheetRange = meta.sheetRange ?? 'Sheet1'
  const columnMapping: ColumnMapping = meta.columnMapping ?? { name: 0, phone: 1, email: 2 }
  const hasHeaderRow = meta.headerRow ?? true
  const lastProcessedRow = meta.lastProcessedRow ?? (hasHeaderRow ? 1 : 0)

  const tokenRow = integration.oauthTokens[0]
  let accessToken: string

  try {
    accessToken = decrypt(tokenRow.accessToken)
  } catch {
    throw new Error('[SheetsSync] Failed to decrypt access token')
  }

  // Get rows
  let rows: string[][]
  try {
    rows = await getSheetRows(sheetId, sheetRange, accessToken)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e.code === 'TOKEN_EXPIRED' && tokenRow.refreshToken) {
      const refreshToken = decrypt(tokenRow.refreshToken)
      accessToken = await refreshGoogleToken(data.integrationId, refreshToken)
      rows = await getSheetRows(sheetId, sheetRange, accessToken)
    } else {
      throw err
    }
  }

  // Skip header row
  const dataRows = rows.slice(lastProcessedRow)
  if (dataRows.length === 0) {
    console.log(`[SheetsSync] No new rows for integration ${data.integrationId}`)
    return
  }

  // Find/create lead source
  let leadSource = await prisma.crm_lead_source.findFirst({
    where: { tenantId: data.tenantId, name: { equals: 'Google Forms', mode: 'insensitive' } },
  })
  if (!leadSource) {
    leadSource = await prisma.crm_lead_source.create({
      data: { tenantId: data.tenantId, name: 'Google Forms' },
    })
  }

  let newRowCount = 0
  for (const row of dataRows) {
    if (row.every((cell) => !cell.trim())) continue // skip empty rows

    const mapped = mapRowToContact(row, columnMapping)
    if (!mapped.firstName && !mapped.phone && !mapped.email) continue

    // Dedup
    const existing = await prisma.crm_contact.findFirst({
      where: {
        tenantId: data.tenantId,
        deletedAt: null,
        OR: [
          ...(mapped.phone ? [{ phone: mapped.phone }] : []),
          ...(mapped.email ? [{ email: mapped.email }] : []),
        ],
      },
    })
    if (existing) continue

    const contact = await prisma.crm_contact.create({
      data: {
        tenantId: data.tenantId,
        branchId: data.branchId,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        email: mapped.email,
        phone: mapped.phone,
        childName1: mapped.childName1,
        childAge1: mapped.childAge1,
        leadSourceId: leadSource.id,
      },
    })

    newRowCount++

    // Fire FORM_SUBMITTED automation
    const automations = await prisma.crm_automation.findMany({
      where: {
        tenantId: data.tenantId,
        enabled: true,
        triggerType: 'FORM_SUBMITTED',
        OR: [{ branchId: data.branchId }, { branchId: null }],
      },
      select: { id: true },
    })
    for (const automation of automations) {
      await enqueueAutomation({
        automationId: automation.id,
        contactId: contact.id,
        tenantId: data.tenantId,
        triggeredBy: 'google_forms_sync',
        triggerPayload: { source: 'Google Forms', sheetId },
      })
    }
  }

  // Update integration meta with new last processed row
  const newLastProcessedRow = lastProcessedRow + dataRows.length
  await prisma.crm_integration.update({
    where: { id: data.integrationId },
    data: {
      lastSyncAt: new Date(),
      meta: {
        ...(meta as object),
        lastProcessedRow: newLastProcessedRow,
      },
    },
  })

  console.log(
    `[SheetsSync] Integration ${data.integrationId}: processed ${dataRows.length} rows, created ${newRowCount} contacts`,
  )
}

// ─── Worker ────────────────────────────────────────────────────────────────────

export function startIntegrationSyncWorker() {
  const worker = new Worker<IntegrationSyncJobData>(
    'crm.integration_sync',
    async (job: Job<IntegrationSyncJobData>) => {
      const data = job.data

      // Fetch integration type
      const integration = await prisma.crm_integration.findUnique({
        where: { id: data.integrationId },
        select: { type: true },
      })

      if (!integration) {
        console.warn(`[SyncWorker] Integration not found: ${data.integrationId}`)
        return
      }

      switch (integration.type) {
        case 'GOOGLE_FORMS':
          await syncGoogleForms(data)
          break
        default:
          console.warn(`[SyncWorker] No handler for integration type: ${integration.type}`)
      }
    },
    {
      connection: redisConnection,
      concurrency: 3,
    },
  )

  worker.on('failed', (job, err) => {
    console.error(`[SyncWorker] Job ${job?.id} failed:`, err.message)
  })

  worker.on('completed', (job) => {
    console.log(`[SyncWorker] Job ${job.id} completed`)
  })

  return worker
}
