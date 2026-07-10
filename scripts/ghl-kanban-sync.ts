/**
 * GHL → CRM kanban stage sync (super-admin, branch-agnostic).
 * ----------------------------------------------------------------------------
 * Reads a GHL "Opportunities" export (.xlsx, inline-strings) and moves each
 * matching CRM opportunity to the stage GHL has it in. Matching is done as a
 * super-admin across ALL branches by PHONE → EMAIL, disambiguated by CHILD /
 * OPPORTUNITY NAME for siblings. The CSV's own "pipeline/branch" column is
 * IGNORED for matching (it disagrees with CRM branch names and even swaps
 * #21/#23) — we update whatever branch the matched CRM contact already lives in.
 *
 * Rules (per spec):
 *   - CRM is the source of truth for which leads exist. GHL duplicates are noise.
 *   - No CRM match  → leave the lead untouched (it stays at NL).
 *   - Any ambiguity → leave untouched (don't risk a wrong move).
 *   - GHL child names are unreliable: used only to split conflicting siblings;
 *     if a sibling group disagrees on stage and we can't confidently map each
 *     child, those opportunities are left untouched.
 *   - Silent move: sets stageId (+ lastStageChangeAt = now). No stage_history,
 *     no automations, no trial appointments.
 *
 * Stage prep:
 *   The 23 numbered branch pipelines lack a UR_W3 stage (their FU3M sits in the
 *   UR_W3 slot). With --apply we rename FU3M → "Unresponsive Week 3"/UR_W3 in
 *   every pipeline that is MISSING UR_W3 (pipelines that already have UR_W3 —
 *   e.g. Ebright Marketing — are left alone).
 *
 * Usage:
 *   npx tsx scripts/ghl-kanban-sync.ts                 # dry-run (no writes)
 *   npx tsx scripts/ghl-kanban-sync.ts --apply         # rename + move, for real
 *   npx tsx scripts/ghl-kanban-sync.ts --file=docs/opportunities_combined.xlsx
 *   npx tsx scripts/ghl-kanban-sync.ts --stages-only --apply   # only the rename
 */
import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { PrismaClient } from '@prisma/client'

// ─── Minimal dependency-free .xlsx reader (ZIP + inline/shared strings) ───────

function unzipEntries(buf: Buffer): Map<string, Buffer> {
  // Locate End Of Central Directory record (scan backwards for 0x06054b50).
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a zip / xlsx file (no EOCD)')
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const total = buf.readUInt16LE(eocd + 10)

  const out = new Map<string, Buffer>()
  let p = cdOffset
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)

    // Local header: data starts after its own (separate) name + extra fields.
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    out.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw))

    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function colIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/)!
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function readXlsx(file: string): Record<string, string>[] {
  const entries = unzipEntries(fs.readFileSync(file))
  const sheet = entries.get('xl/worksheets/sheet1.xml')
  if (!sheet) throw new Error('xl/worksheets/sheet1.xml not found in workbook')
  const sheetXml = sheet.toString('utf8')

  // Shared strings (this export uses inline strings, but support both).
  let shared: string[] = []
  const ss = entries.get('xl/sharedStrings.xml')
  if (ss) shared = [...ss.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decodeXml((m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [, ''])[1]))

  const rows = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)]
  const cellsOf = (rowXml: string): string[] => {
    const arr: string[] = []
    const re = /<c r="([A-Z]+\d+)"(?:[^>]*?\st="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rowXml)) !== null) {
      const idx = colIndex(m[1])
      const type = m[2]
      const inner = m[3]
      let val = ''
      if (type === 's') {
        const vi = (inner.match(/<v>([\s\S]*?)<\/v>/) || [, ''])[1]
        val = shared[+vi] ?? ''
      } else {
        val = decodeXml((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || inner.match(/<v>([\s\S]*?)<\/v>/) || [, ''])[1])
      }
      arr[idx] = val
    }
    return arr
  }

  const header = cellsOf(rows[0][1]).map((h) => (h || '').trim().toLowerCase())
  const result: Record<string, string>[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = cellsOf(rows[r][1])
    if (cells.length === 0) continue
    const obj: Record<string, string> = {}
    header.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim() })
    result.push(obj)
  }
  return result
}

// ─── GHL stage label → CRM shortCode ──────────────────────────────────────────
// Normalise the label (drop the "(CODE)" / "{CODE}" suffix and punctuation) and
// map by name. This sidesteps the data quirks: "Cold Lead (CLD)" → CL,
// "Unresponsive-Week 1 (UR-w1}" (typo brace) → UR_W1, "BUFFER FOR (OD USE)" → SG.

const STAGE_NAME_TO_CODE: Record<string, string> = {
  'new lead': 'NL',
  'follow-up 1st attempt': 'FU1',
  'follow-up 2nd attempt': 'FU2',
  'follow-up 3rd attempt': 'FU3',
  'reschedule': 'RSD',
  'confirmed for trial': 'CT',
  'confirmed no-show': 'CNS',
  'show-up': 'SU',
  'show-up no-enroll': 'SNE',
  'enrolled': 'ENR',
  'unresponsive-week 1': 'UR_W1',
  'unresponsive-week 2': 'UR_W2',
  'unresponsive-week 3': 'UR_W3',
  'cold lead': 'CL',
  'do not disturb': 'DND',
  'buffer for': 'SG',
  'buffer (od use only)': 'SG',
}

function stageToCode(raw: string): string | null {
  if (!raw) return null
  const name = raw
    .replace(/[([{][^)\]}]*[)\]}]?/g, ' ') // strip "(...)" / "{...}" (and unbalanced)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return STAGE_NAME_TO_CODE[name] ?? null
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Canonical Malaysian phone key (digits only). CRM and GHL both store phones
 * inconsistently (+60…, 60…, 0…, with spaces/dashes), and libphonenumber leaves
 * many of them unchanged — so we canonicalise by hand: strip non-digits, turn a
 * local "0…" prefix into "60…", and a bare "1x" mobile into "601x".
 * Returns '' for too-short junk so blanks never collide.
 */
function phoneKey(raw: string | null | undefined): string {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.length < 7) return ''
  if (d.startsWith('60')) { /* already country-coded */ }
  else if (d.startsWith('0')) d = '60' + d.slice(1)
  else if (d.startsWith('1')) d = '60' + d
  return d
}

/** Extract the child name from a GHL "Opportunity Name" (parent — child [#id]). */
function csvChild(oppName: string): string {
  let s = oppName.replace(/\[#[^\]]*\]/g, ' ')        // drop [#1234]
  // separators GHL uses between parent and child
  const sep = s.search(/\s[‒-―|]\s|—/)
  if (sep >= 0) s = s.slice(sep + 1)
  else return '' // no separator → no usable child
  s = s.replace(/\([^)]*\)/g, ' ')                    // drop "(7-9 years old)"
       .replace(/[‒-―|]/g, ' ')
  return norm(s)
}

const JUNK_CHILD = new Set(['', '-', '1', '11111', 'online', 'online parents'])

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Skip { reason: string; key: string; oppName?: string; stage?: string }

// Ensure the two buffer stages exist in every pipeline (idempotent). Enroll
// Buffer (ENRB) is inserted right before ENR; Trial Buffer (CTB) right before
// CT. Order shifts are relative, so doing both in one pass is safe.
async function ensureBufferStages(prisma: PrismaClient, tenantId: string): Promise<number> {
  const specs = [
    { code: 'ENRB', name: 'Enroll Buffer', before: 'ENR' },
    { code: 'CTB', name: 'Trial Buffer', before: 'CT' },
  ]
  const pipelines = await prisma.crm_pipeline.findMany({
    where: { tenantId },
    select: { id: true, stages: { select: { shortCode: true, order: true } } },
  })
  let created = 0
  for (const p of pipelines) {
    const have = new Set(p.stages.map((s) => s.shortCode))
    for (const spec of specs) {
      if (have.has(spec.code)) continue
      const ref = p.stages.find((s) => s.shortCode === spec.before)
      await prisma.$transaction(async (tx) => {
        let order: number
        if (ref) {
          order = ref.order
          await tx.crm_stage.updateMany({
            where: { pipelineId: p.id, tenantId, order: { gte: ref.order } },
            data: { order: { increment: 1 } },
          })
        } else {
          order = p.stages.reduce((m, s) => Math.max(m, s.order), -1) + 1
        }
        await tx.crm_stage.create({
          data: { tenantId, pipelineId: p.id, name: spec.name, shortCode: spec.code, color: 'cyan', order, stuckHoursYellow: 24, stuckHoursRed: 48 },
        })
      })
      have.add(spec.code)
      created++
    }
  }
  return created
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const stagesOnly = argv.includes('--stages-only')
  const buffers = argv.includes('--buffers')
  const file = path.resolve(argv.find((a) => a.startsWith('--file='))?.split('=')[1] ?? 'docs/opportunities_combined.xlsx')

  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}${buffers ? '  [--buffers: ENR→ENRB, CT→CTB]' : ''}`)
  console.log(`File: ${file}\n`)

  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
  try {
    const tenant = await prisma.crm_tenant.findFirst({ select: { id: true } })
    if (!tenant) throw new Error('No tenant')

    // ── Stage prep: FU3M → UR_W3 in pipelines missing UR_W3 ──────────────────
    const pipelines = await prisma.crm_pipeline.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, branch: { select: { name: true } }, stages: { select: { id: true, name: true, shortCode: true, order: true }, orderBy: { order: 'asc' } } },
    })
    const renameTargets: { stageId: string; branch: string }[] = []
    for (const p of pipelines) {
      const codes = new Set(p.stages.map((s) => s.shortCode))
      if (codes.has('UR_W3')) continue                 // already fine (e.g. Marketing)
      const fu3m = p.stages.find((s) => s.shortCode === 'FU3M')
      if (fu3m) renameTargets.push({ stageId: fu3m.id, branch: p.branch?.name ?? '?' })
    }
    console.log(`━━━ Stage prep: FU3M → UR_W3 ━━━`)
    console.log(`Pipelines total: ${pipelines.length}  |  missing UR_W3 (will rename FU3M): ${renameTargets.length}`)
    if (apply && renameTargets.length) {
      await prisma.crm_stage.updateMany({
        where: { id: { in: renameTargets.map((r) => r.stageId) } },
        data: { name: 'Unresponsive Week 3', shortCode: 'UR_W3' },
      })
      console.log(`  ✓ renamed ${renameTargets.length} stage rows`)
    }
    console.log('')

    // ── Stage prep: create Enroll Buffer (ENRB) + Trial Buffer (CTB) ─────────
    if (buffers) {
      const missing = pipelines.filter((p) => {
        const codes = new Set(p.stages.map((s) => s.shortCode))
        return !codes.has('ENRB') || !codes.has('CTB')
      }).length
      console.log(`━━━ Stage prep: Enroll Buffer / Trial Buffer ━━━`)
      console.log(`Pipelines total: ${pipelines.length}  |  needing a buffer stage: ${missing}`)
      if (apply) {
        const created = await ensureBufferStages(prisma, tenant.id)
        console.log(`  ✓ created ${created} buffer stage rows`)
      }
      console.log('')
    }

    if (stagesOnly) { console.log('(--stages-only) done.'); return }

    // ── Load CRM contacts + opportunities (tenant-wide) ──────────────────────
    // Re-read stages so renamed UR_W3 is reflected in this run.
    const pipes2 = await prisma.crm_pipeline.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, stages: { select: { id: true, shortCode: true } } },
    })
    const stageByPipelineCode = new Map<string, string>() // `${pipelineId}:${code}` → stageId
    for (const p of pipes2) for (const s of p.stages) stageByPipelineCode.set(`${p.id}:${s.shortCode}`, s.id)
    // Simulate the FU3M→UR_W3 rename so DRY-RUN matches what APPLY will do:
    // for any pipeline missing UR_W3 but with FU3M, treat FU3M's row as UR_W3.
    for (const p of pipes2) {
      const codes = new Set(p.stages.map((s) => s.shortCode))
      if (codes.has('UR_W3')) continue
      const fu3m = p.stages.find((s) => s.shortCode === 'FU3M')
      if (fu3m) stageByPipelineCode.set(`${p.id}:UR_W3`, fu3m.id)
    }
    // DRY-RUN simulation for buffers: on --apply the stages exist (created
    // above) and pipes2 already has real ids; on dry-run they don't, so point
    // ENRB/CTB at a sentinel so the plan counts the moves correctly.
    if (buffers) {
      for (const p of pipes2) {
        if (!stageByPipelineCode.has(`${p.id}:ENRB`)) stageByPipelineCode.set(`${p.id}:ENRB`, `SIM:${p.id}:ENRB`)
        if (!stageByPipelineCode.has(`${p.id}:CTB`)) stageByPipelineCode.set(`${p.id}:CTB`, `SIM:${p.id}:CTB`)
      }
    }

    const contacts = await prisma.crm_contact.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: {
        id: true, branchId: true, firstName: true, lastName: true, parentFullName: true,
        phone: true, email: true,
        opportunities: { where: { deletedAt: null }, select: { id: true, stageId: true, pipelineId: true, branchId: true } },
      },
    })

    type C = (typeof contacts)[number]
    const byPhone = new Map<string, C[]>()
    const byEmail = new Map<string, C[]>()
    for (const c of contacts) {
      const pk = phoneKey(c.phone)
      if (pk) { (byPhone.get(pk) ?? byPhone.set(pk, []).get(pk)!).push(c) }
      if (c.email) { const k = c.email.trim().toLowerCase(); (byEmail.get(k) ?? byEmail.set(k, []).get(k)!).push(c) }
    }

    // ── Read + group CSV rows by phone (fallback email) ──────────────────────
    const rows = readXlsx(file)
    console.log(`━━━ CSV ━━━`)
    console.log(`Rows: ${rows.length}`)

    interface Row { phone: string; email: string; code: string; child: string; oppName: string }
    const groups = new Map<string, Row[]>() // matchKey → rows
    let unmappableStage = 0, noKey = 0, ctNoSlot = 0
    for (const r of rows) {
      let code = stageToCode(r['stage'] ?? '')
      if (!code) { unmappableStage++; continue }
      // CT only moves when the GHL row carries a Time Slot (a real confirmed
      // trial). Slot-less CT rows have no signal, so leave them at NL.
      if (code === 'CT' && !((r['time slot'] ?? r['timeslot'] ?? '').trim())) { ctNoSlot++; continue }
      // --buffers: route the popup-requiring stages into their buffer instead.
      // ENR (needs package) → Enroll Buffer; CT-with-slot (needs date) → Trial
      // Buffer. Staff then drag Buffer→ENR/CT to capture the missing data.
      if (buffers) {
        if (code === 'ENR') code = 'ENRB'
        else if (code === 'CT') code = 'CTB'
      }
      const phone = phoneKey(r['phone'])
      const email = (r['email'] ?? '').trim().toLowerCase()
      const key = phone ? `p:${phone}` : email ? `e:${email}` : ''
      if (!key) { noKey++; continue }
      const row: Row = { phone, email, code, child: csvChild(r['opportunity name'] ?? ''), oppName: r['opportunity name'] ?? '' }
      ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(row)
    }

    // ── Decide moves ─────────────────────────────────────────────────────────
    const updates: { oppId: string; fromStageId: string; toStageId: string; code: string; branchId: string }[] = []
    const skips: Skip[] = []
    let inSync = 0, noCrmMatch = 0, multiBranch = 0, conflictSkipped = 0, leftEnr = 0

    // ENR (Enrolled) needs package length we don't have → leave at NL.
    // CT is allowed here (slot-less CT rows were already dropped above).
    const SKIP_CODES = new Set(['ENR'])

    // stageId → shortCode, for the idempotency guard below.
    const codeByStageId = new Map<string, string>()
    for (const p of pipes2) for (const s of p.stages) codeByStageId.set(s.id, s.shortCode)
    // Decide each opportunity at most once per run. A lead can appear in both a
    // phone-group and an email-group (duplicate GHL rows); without this, two
    // groups fight over its stage and the script never reaches a fixpoint.
    const assignedOppIds = new Set<string>()

    for (const [key, grp] of groups) {
      // Phone-keyed groups match by phone ONLY. Email is used solely for rows
      // that have no phone at all — otherwise shared placeholder emails
      // (fbkids@, whatsappleads@, roadshow gmail addresses) match many
      // unrelated contacts across branches and pollute the result.
      const matched: C[] = key.startsWith('p:')
        ? (byPhone.get(key.slice(2)) ?? [])
        : (byEmail.get(key.slice(2)) ?? [])
      if (matched.length === 0) { noCrmMatch++; continue }

      // "Any confusion → leave at NL": if the contact(s) span >1 branch, skip.
      const branchIds = new Set(matched.map((c) => c.branchId))
      if (branchIds.size > 1) { multiBranch++; skips.push({ reason: 'matches >1 branch', key }); continue }

      const opps = matched.flatMap((c) => c.opportunities.map((o) => ({ o, c })))
      if (opps.length === 0) { noCrmMatch++; continue }

      const distinctCodes = new Set(grp.map((r) => r.code))

      const setStage = (oppId: string, pipelineId: string, curStageId: string, branchId: string, code: string) => {
        if (assignedOppIds.has(oppId)) return             // already decided this run
        if (SKIP_CODES.has(code)) { leftEnr++; return }   // ENR → leave at NL
        const target = stageByPipelineCode.get(`${pipelineId}:${code}`)
        if (!target) { skips.push({ reason: `pipeline lacks stage ${code}`, key }); return }
        assignedOppIds.add(oppId)
        if (target === curStageId) { inSync++; return }
        updates.push({ oppId, fromStageId: curStageId, toStageId: target, code, branchId })
      }

      if (distinctCodes.size === 1) {
        // All GHL rows agree → move every matched opportunity to that stage.
        const code = grp[0].code
        for (const { o } of opps) setStage(o.id, o.pipelineId, o.stageId, o.branchId, code)
      } else {
        // Conflicting siblings → match each CRM opp to a row by child name.
        for (const { o, c } of opps) {
          if (assignedOppIds.has(o.id)) continue
          // Idempotent: if this opp already sits at one of the group's target
          // codes, leave it — prevents oscillation between conflicting siblings.
          const curCode = codeByStageId.get(o.stageId)
          if (curCode && distinctCodes.has(curCode)) { inSync++; assignedOppIds.add(o.id); continue }
          const crmChild = c.parentFullName ? norm(`${c.firstName} ${c.lastName ?? ''}`) : ''
          let chosen: Row | undefined
          if (crmChild && !JUNK_CHILD.has(crmChild)) {
            const firstTok = crmChild.split(' ')[0]
            chosen = grp.find((r) => r.child && !JUNK_CHILD.has(r.child) &&
              (r.child === crmChild || r.child.split(' ').includes(firstTok) || crmChild.split(' ').includes(r.child.split(' ')[0])))
          }
          if (chosen) setStage(o.id, o.pipelineId, o.stageId, o.branchId, chosen.code)
          else { conflictSkipped++; skips.push({ reason: 'sibling stage conflict, no confident child match', key, oppName: c.parentFullName ?? c.firstName }) }
        }
      }
    }

    // ── Report ───────────────────────────────────────────────────────────────
    const byCode = new Map<string, number>()
    const byBranch = new Map<string, number>()
    for (const u of updates) {
      byCode.set(u.code, (byCode.get(u.code) ?? 0) + 1)
      byBranch.set(u.branchId, (byBranch.get(u.branchId) ?? 0) + 1)
    }
    console.log(`unmappable stage rows: ${unmappableStage}   rows w/o phone+email: ${noKey}`)
    console.log(`\n━━━ PLAN (${apply ? 'APPLIED' : 'DRY-RUN'}) ━━━`)
    console.log(`Opportunities to MOVE : ${updates.length}`)
    console.log(`Already in sync       : ${inSync}`)
    console.log(`No CRM match (stay NL): ${noCrmMatch}  (groups)`)
    console.log(`Left at NL — ENR (package unknown): ${leftEnr}`)
    console.log(`Left at NL — CT without slot: ${ctNoSlot}`)
    console.log(`Skipped — multi-branch: ${multiBranch}`)
    console.log(`Skipped — sibling conflict: ${conflictSkipped}`)
    console.log(`Other skips           : ${skips.length - multiBranch - conflictSkipped}`)

    console.log(`\nMoves by target stage:`)
    for (const [code, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${code}`)

    // branch breakdown needs branchId→name; fetch once.
    const branches = await prisma.crm_branch.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } })
    const bn = new Map(branches.map((b) => [b.id, b.name]))
    console.log(`\nMoves by branch:`)
    for (const [bid, n] of [...byBranch.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${bn.get(bid) ?? bid}`)

    if (apply && updates.length) {
      // Rollback snapshot FIRST — records every opp's original stage so the
      // moves can be reverted. Written before any DB write. Never clobber a
      // previous run's rollback (so earlier applies stay revertible).
      let backupPath = path.resolve('docs/ghl-sync-rollback.json')
      for (let i = 2; fs.existsSync(backupPath); i++) backupPath = path.resolve(`docs/ghl-sync-rollback-${i}.json`)
      fs.writeFileSync(backupPath, JSON.stringify(updates.map((u) => ({ oppId: u.oppId, fromStageId: u.fromStageId, toStageId: u.toStageId })), null, 2))
      console.log(`\nRollback snapshot written: ${backupPath} (${updates.length} rows)`)

      console.log(`Applying ${updates.length} stage moves…`)
      const now = new Date()
      let done = 0
      // group by target stage for batched updateMany
      const byTarget = new Map<string, string[]>()
      for (const u of updates) (byTarget.get(u.toStageId) ?? byTarget.set(u.toStageId, []).get(u.toStageId)!).push(u.oppId)
      for (const [stageId, ids] of byTarget) {
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500)
          await prisma.crm_opportunity.updateMany({ where: { id: { in: chunk } }, data: { stageId, lastStageChangeAt: now } })
          done += chunk.length
        }
      }
      console.log(`  ✓ moved ${done} opportunities`)
    }

    // Write skip log for review.
    const logPath = path.resolve('docs/ghl-sync-skips.json')
    fs.writeFileSync(logPath, JSON.stringify(skips.slice(0, 2000), null, 2))
    console.log(`\nSkip detail (first 2000): ${logPath}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
