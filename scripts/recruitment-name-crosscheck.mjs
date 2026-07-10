// Cross-check the GHL recruitment CSV against the BranchStaff table.
//
// Goal: match each recruit in the GHL export to an actual employee row in
// BranchStaff (ebright_hrfs.public."BranchStaff"), so we can tell which recruits
// became staff. Matching is by email → phone → normalised name (Malaysian name
// connectors like bin/binti/a/l/a/p are stripped). Staff are filtered to those
// added since the cutoff (default 2026-01-01, per "employees taken from 1 Jan").
//
// READ-ONLY: only reads BranchStaff + the CSV, writes a JSON report to docs/.
// Nothing is written to the database.
//
//   node scripts/recruitment-name-crosscheck.mjs
//   node scripts/recruitment-name-crosscheck.mjs --since=2026-01-01 --csv="docs/GHL recruitment form submission.csv"
//
// BranchStaff physically lives in the HRFS DB; the crm FDW view reflects it.
import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local' })

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

// ─── Args ──────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const SINCE = arg('since', '2026-01-01')
const CSV_CANDIDATES = [
  arg('csv', null),
  'docs/GHL recruitment form submission.csv',
  'docs/GHL Recruitment.csv',
].filter(Boolean)
const CSV_PATH = CSV_CANDIDATES.find((p) => existsSync(p))
if (!CSV_PATH) {
  console.error(`CSV not found. Tried:\n  ${CSV_CANDIDATES.join('\n  ')}`)
  process.exit(1)
}

const url = process.env.HRFS_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('No HRFS_DATABASE_URL / DATABASE_URL set.')
  process.exit(1)
}
const prisma = new PrismaClient({ datasourceUrl: url })

// ─── CSV parsing (quote-aware state machine) ────────────────────────────────
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* ignore */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ─── Name / contact normalisation ───────────────────────────────────────────
const NAME_NOISE = /\b(bin|binti|bte|a\/l|a\/p|al|d\/o|s\/o|mr|mrs|ms|dr|datin|dato|datuk|engr|prof|haji|hajjah)\b/g
function normName(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(/\|/g, ' ')            // strip the trailing " | " seen in some rows
    .replace(/[._]/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')   // drop punctuation (a/l, @, etc. already handled)
    .replace(/\s+/g, ' ')
    .trim()
}
function nameTokens(s) {
  return new Set(normName(s).split(' ').filter((t) => t.length > 1))
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}
function normPhone(s) {
  const d = String(s ?? '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : '' // last 9 digits (MY local part)
}
function normEmail(s) {
  return String(s ?? '').trim().toLowerCase()
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Parse CSV → recruit records.
  const raw = parseCsv(readFileSync(CSV_PATH, 'utf8'))
  const header = raw[0].map((h) => h.trim())
  const col = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const idx = {
    oppName: col('Opportunity name'),
    name: col('Contact Name'),
    phone: col('phone'),
    email: col('email'),
    stage: col('stage'),
    source: col('source'),
    created: col('Created on'),
    position: col('Working Position Oppo'),
    contactId: col('Contact ID'),
  }
  const recruits = raw.slice(1)
    .filter((r) => r.length > 1 && (r[idx.name] || r[idx.oppName]))
    .map((r) => {
      const name = (r[idx.name] || r[idx.oppName] || '').trim()
      return {
        name,
        email: normEmail(r[idx.email]),
        phone: normPhone(r[idx.phone]),
        stage: (r[idx.stage] || '').trim(),
        source: (r[idx.source] || '').trim(),
        position: (r[idx.position] || '').trim(),
        contactId: (r[idx.contactId] || '').trim(),
        nName: normName(name),
        nTokens: nameTokens(name),
      }
    })

  // 2. Load BranchStaff added since the cutoff.
  const sinceDate = new Date(`${SINCE}T00:00:00`)
  const staffAll = await prisma.branchStaff.findMany({
    select: {
      id: true, name: true, email: true, phone: true, branch: true,
      role: true, employment_type: true, status: true, position: true,
      start_date: true, createdAt: true,
    },
  })
  // createdAt is a real timestamp; start_date is a free-form string. Treat a
  // staff row as "since Jan 1" if EITHER createdAt >= cutoff OR a parseable
  // start_date >= cutoff (so back-dated imports still count).
  const staff = staffAll.filter((s) => {
    if (s.createdAt && s.createdAt >= sinceDate) return true
    const sd = s.start_date ? new Date(s.start_date) : null
    return sd && !isNaN(sd.getTime()) && sd >= sinceDate
  }).map((s) => ({
    ...s,
    nEmail: normEmail(s.email),
    nPhone: normPhone(s.phone),
    nName: normName(s.name),
    nTokens: nameTokens(s.name),
  }))

  // 3. Build lookup indexes on the staff side.
  const byEmail = new Map(), byPhone = new Map(), byName = new Map()
  for (const s of staff) {
    if (s.nEmail) byEmail.set(s.nEmail, s)
    if (s.nPhone) byPhone.set(s.nPhone, s)
    if (s.nName) (byName.get(s.nName) ?? byName.set(s.nName, []).get(s.nName)).push(s)
  }

  // 4. Match each recruit.
  const matchedStaffIds = new Set()
  const matched = [], fuzzy = [], unmatched = []
  for (const rec of recruits) {
    let hit = null, how = null
    if (rec.email && byEmail.has(rec.email)) { hit = byEmail.get(rec.email); how = 'email' }
    else if (rec.phone && byPhone.has(rec.phone)) { hit = byPhone.get(rec.phone); how = 'phone' }
    else if (rec.nName && byName.has(rec.nName)) { hit = byName.get(rec.nName)[0]; how = 'name' }

    if (hit) {
      matchedStaffIds.add(hit.id)
      matched.push({ how, recruit: rec.name, stage: rec.stage, staff: hit.name, staffId: hit.id, branch: hit.branch, employment_type: hit.employment_type, status: hit.status })
      continue
    }
    // Fuzzy by token Jaccard (review-only).
    let best = null, bestScore = 0
    for (const s of staff) {
      const sc = jaccard(rec.nTokens, s.nTokens)
      if (sc > bestScore) { bestScore = sc; best = s }
    }
    if (best && bestScore >= 0.6) {
      fuzzy.push({ score: +bestScore.toFixed(2), recruit: rec.name, stage: rec.stage, maybeStaff: best.name, staffId: best.id, branch: best.branch })
    } else {
      unmatched.push({ recruit: rec.name, stage: rec.stage, source: rec.source, email: rec.email || null, phone: rec.phone || null })
    }
  }

  // 5. Staff (since cutoff) with no recruit match.
  const staffNoRecruit = staff
    .filter((s) => !matchedStaffIds.has(s.id))
    .map((s) => ({ staff: s.name, staffId: s.id, branch: s.branch, employment_type: s.employment_type, status: s.status, start_date: s.start_date }))

  // 6. CSV stage distribution + stages not in the canonical pipeline list.
  const CANONICAL = new Set([
    'Candidate (CD)','Intern','Full Time','Part Timer','Buffer Resume','Resume Submission (RS)',
    'Buffer Video','Complete Submission (VS)','Health Declaration (HD)','Google Search (GS)',
    'Interview Date (ID)','Follow Up (FUP)','Shortlisted (SL)','Reschedule','Interviewed (INT)',
    'Hired (HRD)','1st Day Trial','2nd Day Trial','3rd Day Trial','Send Agreement Letter',
    'Rejected (RJT)','1st Training Day','2nd Training Day','3rd Training Day',
    'Access To Payroll (Finance)','IOP Sessions 2 week','IOP Sessions 2nd month',
    'IOP Sessions 3rd month','Buffer (For OD Use)',
  ])
  const stageCounts = {}
  for (const r of recruits) stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1
  const unknownStages = Object.keys(stageCounts).filter((s) => s && !CANONICAL.has(s))
  const matchedByHow = matched.reduce((acc, m) => ((acc[m.how] = (acc[m.how] ?? 0) + 1), acc), {})

  // 7. Report.
  console.log('\n══ Recruitment name cross-check ══')
  console.log(`CSV:               ${CSV_PATH}`)
  console.log(`Staff since:       ${SINCE}`)
  console.log(`Recruits in CSV:   ${recruits.length}`)
  console.log(`Staff since cutoff:${staff.length}`)
  console.log(`\nMatched recruit→staff: ${matched.length}  (${JSON.stringify(matchedByHow)})`)
  console.log(`Fuzzy (review):        ${fuzzy.length}`)
  console.log(`Unmatched recruits:    ${unmatched.length}`)
  console.log(`Staff w/o recruit:     ${staffNoRecruit.length}`)
  if (unknownStages.length) {
    console.log(`\n⚠ CSV stages NOT in the canonical pipeline list:`)
    for (const s of unknownStages) console.log(`   "${s}" × ${stageCounts[s]}`)
  }

  const out = 'docs/recruitment-name-crosscheck-report.json'
  writeFileSync(out, JSON.stringify({
    generatedFor: { csv: CSV_PATH, since: SINCE },
    summary: {
      recruits: recruits.length, staffSinceCutoff: staff.length,
      matched: matched.length, matchedByHow, fuzzy: fuzzy.length,
      unmatched: unmatched.length, staffWithoutRecruit: staffNoRecruit.length,
    },
    stageCounts, unknownStages,
    matched, fuzzy, unmatched, staffWithoutRecruit: staffNoRecruit,
  }, null, 2))
  console.log(`\nFull report → ${out}\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
