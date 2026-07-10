// Import the GHL "HR Recruitment" CSV into the rec_* tables and flag hires.
//
// For each recruit: upsert a rec_recruit (keyed on ghlOpportunityId, so re-runs
// are idempotent) at its current stage, and mark `hired` + `branchStaffId` when
// the recruit matches a BranchStaff row added since the cutoff (email → phone →
// normalised name). Dry-run by default.
//
//   node scripts/recruitment-import.mjs                       # preview only
//   node scripts/recruitment-import.mjs --apply               # write
//   node scripts/recruitment-import.mjs --since=2026-01-01 --csv="docs/GHL recruitment form submission.csv"
//
// The script ENSURES the rec_* tables + 29 seed stages exist first (idempotent,
// via Prisma raw SQL) — so no psql is needed (the container has none). It relies
// on the generated Prisma client having the rec_* models (produced at build by
// `prisma generate`; run it manually for local use).
// Runs against DATABASE_URL (rec_* tables + BranchStaff are both reachable there).
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local' })

import { readFileSync, existsSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const APPLY = process.argv.includes('--apply')
const SINCE = arg('since', '2026-01-01')
const CSV_PATH = [arg('csv', null), 'docs/GHL recruitment form submission.csv', 'docs/GHL Recruitment.csv']
  .filter(Boolean).find((p) => existsSync(p))
if (!CSV_PATH) { console.error('CSV not found.'); process.exit(1) }

const url = process.env.DATABASE_URL
if (!url) { console.error('No DATABASE_URL set.'); process.exit(1) }
const prisma = new PrismaClient({ datasourceUrl: url })

// ─── helpers (shared shape with recruitment-name-crosscheck.mjs) ─────────────
// Encoding-aware read: GHL/Excel CSV exports are often UTF-16 (with a BOM) or
// UTF-8-with-BOM. Reading those as plain UTF-8 garbles the header and every
// column lookup misses (→ 0 rows parsed). Detect the BOM and decode correctly.
function readText(path) {
  const buf = readFileSync(path)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^﻿/, '')
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const s = Buffer.alloc(buf.length)            // UTF-16 BE → swap to LE
    for (let i = 0; i + 1 < buf.length; i += 2) { s[i] = buf[i + 1]; s[i + 1] = buf[i] }
    return s.toString('utf16le').replace(/^﻿/, '')
  }
  let t = buf.toString('utf8')
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)  // strip UTF-8 BOM
  return t
}
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}
const NAME_NOISE = /\b(bin|binti|bte|a\/l|a\/p|al|d\/o|s\/o|mr|mrs|ms|dr|datin|dato|datuk|engr|prof|haji|hajjah)\b/g
const normName = (s) => !s ? '' : String(s).toLowerCase().replace(/\|/g, ' ').replace(/[._]/g, ' ')
  .replace(NAME_NOISE, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const normEmail = (s) => String(s ?? '').trim().toLowerCase()
const normPhone = (s) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : '' }
const BRANCH_CODES = new Set(['st','sa','sp','kd','pjy','amp','cjy','klg','da','bbb','dk','sha','btho','egr','bsp','rby','tsg','kw','ktg','tsb','pjl','dpu','hq','onl'])

// Idempotent DDL + stage seed (mirrors prisma/sql/2026-06-20-recruitment-tables.sql).
// Run via Prisma raw SQL so the container needs no psql client.
const DDL = [
  `CREATE TABLE IF NOT EXISTS rec_stage (
    id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    name text NOT NULL, "shortCode" text NOT NULL UNIQUE, "order" integer NOT NULL,
    color text NOT NULL DEFAULT 'slate',
    "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS rec_stage_order_idx ON rec_stage ("order")`,
  `CREATE TABLE IF NOT EXISTS rec_recruit (
    id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    name text NOT NULL, email text, phone text, source text, position text, branch text,
    "stageId" text NOT NULL REFERENCES rec_stage(id), hired boolean NOT NULL DEFAULT false,
    "branchStaffId" integer, "ghlOpportunityId" text UNIQUE, "ghlContactId" text,
    "ghlCreatedAt" timestamp(3), "deletedAt" timestamp(3),
    "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS rec_recruit_stage_idx ON rec_recruit ("stageId")`,
  `CREATE INDEX IF NOT EXISTS rec_recruit_hired_idx ON rec_recruit (hired)`,
  `CREATE INDEX IF NOT EXISTS rec_recruit_branchstaff_idx ON rec_recruit ("branchStaffId")`,
  `CREATE TABLE IF NOT EXISTS rec_stage_history (
    id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    "recruitId" text NOT NULL REFERENCES rec_recruit(id) ON DELETE CASCADE,
    "fromStageId" text REFERENCES rec_stage(id), "toStageId" text NOT NULL REFERENCES rec_stage(id),
    "changedBy" text, note text, "changedAt" timestamp(3) NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS rec_stage_history_recruit_idx ON rec_stage_history ("recruitId")`,
]
const STAGE_SEED = [
  ['Candidate (CD)','CD',1,'slate'],['Intern','INTERN',2,'slate'],['Full Time','FT',3,'slate'],
  ['Part Timer','PT',4,'slate'],['Buffer Resume','BR',5,'zinc'],['Resume Submission (RS)','RS',6,'sky'],
  ['Buffer Video','BV',7,'zinc'],['Complete Submission (VS)','VS',8,'sky'],['Health Declaration (HD)','HD',9,'cyan'],
  ['Google Search (GS)','GS',10,'cyan'],['Interview Date (ID)','ID',11,'indigo'],['Follow Up (FUP)','FUP',12,'violet'],
  ['Shortlisted (SL)','SL',13,'violet'],['Reschedule','RSD',14,'amber'],['Interviewed (INT)','INT',15,'indigo'],
  ['Hired (HRD)','HRD',16,'emerald'],['1st Day Trial','DT1',17,'teal'],['2nd Day Trial','DT2',18,'teal'],
  ['3rd Day Trial','DT3',19,'teal'],['Send Agreement Letter','SAL',20,'teal'],['Rejected (RJT)','RJT',21,'rose'],
  ['1st Training Day','TR1',22,'green'],['2nd Training Day','TR2',23,'green'],['3rd Training Day','TR3',24,'green'],
  ['Access To Payroll (Finance)','PAY',25,'green'],['IOP Sessions 2 week','IOP1',26,'lime'],
  ['IOP Sessions 2nd month','IOP2',27,'lime'],['IOP Sessions 3rd month','IOP3',28,'lime'],['Buffer (For OD Use)','OD',29,'slate'],
]

async function ensureSchema() {
  for (const stmt of DDL) await prisma.$executeRawUnsafe(stmt)
  for (const [name, code, order, color] of STAGE_SEED) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO rec_stage (name, "shortCode", "order", color) VALUES ($1,$2,$3,$4) ON CONFLICT ("shortCode") DO NOTHING`,
      name, code, order, color,
    )
  }
}

async function main() {
  // 0. Ensure tables + seed stages exist (idempotent; no psql needed).
  await ensureSchema()

  // 1. Load stages → name/shortCode maps.
  const stages = await prisma.recStage.findMany({ select: { id: true, name: true, shortCode: true } })
  if (stages.length === 0) {
    console.error('No rec_stage rows after ensureSchema — check DB permissions.')
    process.exit(1)
  }
  const stageByName = new Map(stages.map((s) => [s.name.toLowerCase(), s]))

  // 2. Parse CSV.
  const raw = parseCsv(readText(CSV_PATH))
  const header = (raw[0] ?? []).map((h) => h.replace(/^﻿/, '').trim())
  const col = (n) => header.findIndex((h) => h.toLowerCase() === n.toLowerCase())
  const I = {
    opp: col('Opportunity name'), name: col('Contact Name'), phone: col('phone'), email: col('email'),
    stage: col('stage'), source: col('source'), created: col('Created on'), tags: col('tags'),
    position: col('Working Position Oppo'), oppId: col('Opportunity ID'), contactId: col('Contact ID'),
  }
  const recruits = raw.slice(1)
    .filter((r) => r.length > 1 && (r[I.name] || r[I.opp]) && r[I.oppId])
    .map((r) => {
      const tags = (r[I.tags] || '').split(',').map((t) => t.trim().toLowerCase())
      const branch = tags.find((t) => BRANCH_CODES.has(t)) ?? null
      const created = r[I.created] ? new Date(r[I.created]) : null
      return {
        name: (r[I.name] || r[I.opp] || '').replace(/\|/g, '').trim(),
        email: (r[I.email] || '').trim() || null,
        phone: (r[I.phone] || '').trim() || null,
        source: (r[I.source] || '').trim() || null,
        position: (r[I.position] || '').trim() || null,
        branch,
        stageName: (r[I.stage] || '').trim(),
        ghlOpportunityId: (r[I.oppId] || '').trim(),
        ghlContactId: (r[I.contactId] || '').trim() || null,
        ghlCreatedAt: created && !isNaN(created.getTime()) ? created : null,
        nEmail: normEmail(r[I.email]), nPhone: normPhone(r[I.phone]), nName: normName(r[I.name] || r[I.opp]),
      }
    })

  // Diagnostic: if nothing parsed, dump what we saw so the cause is obvious
  // (wrong delimiter, unexpected header, single-line file, etc.).
  if (recruits.length === 0) {
    console.error('\n⚠ Parsed 0 recruits. Diagnostics:')
    console.error(`  raw rows:        ${raw.length}`)
    console.error(`  header columns:  ${header.length}`)
    console.error(`  header:          ${JSON.stringify(header.slice(0, 12))}`)
    console.error(`  col indices:     ${JSON.stringify(I)}`)
    console.error(`  first data row:  ${JSON.stringify((raw[1] ?? []).slice(0, 8))}`)
    process.exit(1)
  }

  // 3. BranchStaff since cutoff → match indexes.
  const sinceDate = new Date(`${SINCE}T00:00:00`)
  const staff = (await prisma.branchStaff.findMany({
    select: { id: true, name: true, email: true, phone: true, start_date: true, createdAt: true },
  })).filter((s) => {
    if (s.createdAt && s.createdAt >= sinceDate) return true
    const sd = s.start_date ? new Date(s.start_date) : null
    return sd && !isNaN(sd.getTime()) && sd >= sinceDate
  })
  const byEmail = new Map(), byPhone = new Map(), byName = new Map()
  for (const s of staff) {
    const e = normEmail(s.email), p = normPhone(s.phone), n = normName(s.name)
    if (e) byEmail.set(e, s); if (p) byPhone.set(p, s); if (n && !byName.has(n)) byName.set(n, s)
  }
  const matchStaff = (r) =>
    (r.nEmail && byEmail.get(r.nEmail)) || (r.nPhone && byPhone.get(r.nPhone)) || (r.nName && byName.get(r.nName)) || null

  // 4. Existing recruits (to classify create vs update in dry-run).
  const existing = new Set((await prisma.recRecruit.findMany({ select: { ghlOpportunityId: true } }))
    .map((x) => x.ghlOpportunityId).filter(Boolean))

  let toCreate = 0, toUpdate = 0, hiredMatched = 0, skippedStage = 0
  const unknownStages = new Map()
  for (const r of recruits) {
    const stage = stageByName.get(r.stageName.toLowerCase())
    if (!stage) { skippedStage++; unknownStages.set(r.stageName, (unknownStages.get(r.stageName) ?? 0) + 1); continue }
    const staffHit = matchStaff(r)
    if (staffHit) hiredMatched++
    const isNew = !existing.has(r.ghlOpportunityId)
    isNew ? toCreate++ : toUpdate++

    if (APPLY) {
      const data = {
        name: r.name, email: r.email, phone: r.phone, source: r.source, position: r.position,
        branch: r.branch, stageId: stage.id, ghlContactId: r.ghlContactId, ghlCreatedAt: r.ghlCreatedAt,
        hired: !!staffHit, branchStaffId: staffHit ? staffHit.id : null,
      }
      const rec = await prisma.recRecruit.upsert({
        where: { ghlOpportunityId: r.ghlOpportunityId },
        create: { ...data, ghlOpportunityId: r.ghlOpportunityId },
        update: data,
      })
      if (isNew) {
        await prisma.recStageHistory.create({
          data: { recruitId: rec.id, fromStageId: null, toStageId: stage.id, changedBy: 'import', note: 'Imported from GHL', changedAt: r.ghlCreatedAt ?? undefined },
        })
      }
    }
  }

  console.log('\n══ Recruitment import' + (APPLY ? ' (APPLIED)' : ' (dry-run)') + ' ══')
  console.log(`CSV:              ${CSV_PATH}`)
  console.log(`Recruits parsed:  ${recruits.length}`)
  console.log(`Would create:     ${toCreate}`)
  console.log(`Would update:     ${toUpdate}`)
  console.log(`Hired-matched:    ${hiredMatched}  (BranchStaff since ${SINCE})`)
  console.log(`Skipped (stage):  ${skippedStage}`)
  if (unknownStages.size) {
    console.log('  Unknown CSV stages:')
    for (const [s, n] of unknownStages) console.log(`    "${s}" × ${n}`)
  }
  if (!APPLY) console.log('\nDry-run only — re-run with --apply to write.')
  console.log('')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
