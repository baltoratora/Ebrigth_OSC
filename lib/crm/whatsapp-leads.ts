/**
 * WhatsApp leads — bridge between `ebrightleads_db.ws_leads` (anonymous inbound
 * WhatsApp interaction counts, auto-inserted by the Meta WhatsApp pipeline) and
 * the CRM's `crm_whatsapp_lead` table (resolution state owned by the CRM).
 *
 * Ebright-only: reads ebrightleads_db, gated on LEADS_DB_URL being set (and the
 * tenant matching LEADS_TENANT_SLUG). Other tenants get a no-op sync + empty
 * lists, so the feature never reaches across into Ebright's lead source.
 */
import { Pool } from 'pg'
import { prisma } from '@/lib/crm/db'

const LEADS_DB_URL = process.env.LEADS_DB_URL
const LEADS_TENANT_SLUG = process.env.LEADS_TENANT_SLUG ?? 'ebright'

// Module-level pool, reused across requests so the badge poll doesn't open a
// fresh connection every tick. Small cap — this table is tiny + low-traffic.
let _pool: Pool | null = null
function leadsPool(): Pool | null {
  if (!LEADS_DB_URL) return null
  if (!_pool) _pool = new Pool({ connectionString: LEADS_DB_URL, max: 3 })
  return _pool
}

interface WsLeadRow {
  ws_lead_id: string
  branch: string | null
  location_key: string | null
  full_name: string | null
  phone: string | null
  campaign_name: string | null
  submitted_at: Date
}

/**
 * ws_leads.branch is "NN CODE" (e.g. "21 TSB", "01 ONL"). The trailing
 * alpha token is the crm_branch.code. Returns it upper-cased, or null.
 */
export function wsBranchCode(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.trim().match(/([A-Za-z]+)\s*$/)
  return m ? m[1].toUpperCase() : null
}

/** True when this tenant is the one wired to ebrightleads_db. */
async function isLeadsTenant(tenantId: string): Promise<boolean> {
  if (!LEADS_DB_URL) return false
  const tenant = await prisma.crm_tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  })
  return tenant?.slug === LEADS_TENANT_SLUG
}

/**
 * Pull new ws_leads rows into crm_whatsapp_lead for the given branch scope.
 *
 * - `branchIds = null` → all of the tenant's branches (elevated callers).
 * - Existing wsLeadIds (PENDING/COMPLETED/DELETED alike) are skipped, so
 *   completed/deleted interactions are never resurrected.
 * - Rows whose branch code doesn't map to a branch in scope are skipped; a
 *   wider-scoped caller (or the branch's own manager) picks them up later.
 *
 * No-ops (returns 0) when LEADS_DB_URL is unset or the tenant isn't the leads
 * tenant — keeps non-Ebright tenants fully isolated.
 */
export async function syncWhatsappLeads(
  tenantId: string,
  branchIds: string[] | null,
): Promise<number> {
  const pool = leadsPool()
  if (!pool) return 0
  if (!(await isLeadsTenant(tenantId))) return 0

  const branches = await prisma.crm_branch.findMany({
    where: { tenantId, ...(branchIds ? { id: { in: branchIds } } : {}) },
    select: { id: true, code: true },
  })
  const idByCode = new Map(
    branches.filter((b) => b.code).map((b) => [b.code!.toUpperCase(), b.id]),
  )
  if (idByCode.size === 0) return 0

  const { rows } = await pool.query<WsLeadRow>(
    `SELECT ws_lead_id, branch, location_key, full_name, phone, campaign_name, submitted_at
       FROM ws_leads`,
  )

  const existing = await prisma.crm_whatsapp_lead.findMany({
    where: { tenantId },
    select: { wsLeadId: true },
  })
  const have = new Set(existing.map((e) => e.wsLeadId))

  const toCreate = rows
    .filter((r) => !have.has(r.ws_lead_id))
    .map((r) => {
      const branchId = idByCode.get(wsBranchCode(r.branch) ?? '')
      if (!branchId) return null
      return {
        tenantId,
        branchId,
        wsLeadId: r.ws_lead_id,
        source: 'auto',
        status: 'PENDING',
        rawBranch: r.branch,
        locationKey: r.location_key,
        fullName: r.full_name,
        phone: r.phone,
        campaignName: r.campaign_name,
        submittedAt: r.submitted_at,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (toCreate.length === 0) return 0
  const res = await prisma.crm_whatsapp_lead.createMany({
    data: toCreate,
    skipDuplicates: true,
  })
  return res.count
}

export interface WhatsappLeadItem {
  id: string
  wsLeadId: string
  source: string
  branchId: string
  branchName: string
  rawBranch: string | null
  fullName: string | null
  phone: string | null
  campaignName: string | null
  submittedAt: string | null
}

/** Pending (unresolved) WhatsApp interactions for a branch scope.
 *  Optional `range` filters by submittedAt (mirrors the kanban day filter). */
export async function listPendingWhatsappLeads(
  tenantId: string,
  branchIds: string[] | null,
  range?: { from: Date; to: Date } | null,
): Promise<WhatsappLeadItem[]> {
  const rows = await prisma.crm_whatsapp_lead.findMany({
    where: {
      tenantId,
      status: 'PENDING',
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(range ? { submittedAt: { gte: range.from, lte: range.to } } : {}),
    },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      wsLeadId: true,
      source: true,
      branchId: true,
      rawBranch: true,
      fullName: true,
      phone: true,
      campaignName: true,
      submittedAt: true,
      branch: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    wsLeadId: r.wsLeadId,
    source: r.source,
    branchId: r.branchId,
    branchName: r.branch.name,
    rawBranch: r.rawBranch,
    fullName: r.fullName,
    phone: r.phone,
    campaignName: r.campaignName,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
  }))
}
