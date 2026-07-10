/**
 * Startup environment validation.
 *
 * Imported at the top of `next.config.ts` so it runs once, on every boot,
 * before Next.js compiles routes. If any required secret is missing,
 * empty, or still a placeholder, the process exits with a clear error
 * instead of silently shipping insecure defaults.
 *
 * Add new entries here whenever a secret is introduced — that way nobody
 * can accidentally deploy a broken environment file.
 */

type Severity = 'critical' | 'warning'

interface EnvCheck {
  name: string
  severity: Severity
  /** Words/substrings that indicate the value hasn't been replaced. */
  placeholderMarkers?: string[]
  /** Optional regex the value must match (e.g. exact length / hex chars). */
  mustMatch?: RegExp
  /** Skip this check when running outside production. */
  productionOnly?: boolean
}

const CHECKS: EnvCheck[] = [
  {
    name: 'NEXTAUTH_SECRET',
    severity: 'critical',
    placeholderMarkers: ['replace', 'change', 'todo', 'xxxxx'],
  },
  {
    name: 'BETTER_AUTH_SECRET',
    severity: 'critical',
    placeholderMarkers: ['replace', 'change', 'todo', 'xxxxx'],
  },
  {
    name: 'ENCRYPTION_KEY',
    severity: 'critical',
    placeholderMarkers: ['replace', '0000000000', 'xxxxx'],
    mustMatch: /^[a-fA-F0-9]{64}$/,
  },
  {
    name: 'DATABASE_URL',
    severity: 'critical',
    placeholderMarkers: ['user:password', 'localhost:5432/postgres'],
  },
  {
    name: 'NEXTAUTH_URL',
    severity: 'warning',
  },
  {
    // Direct connection to ebrightleads_db for the lead-ingest worker.
    // Optional in dev (worker no-ops without it); warn so it's visible.
    name: 'LEADS_DB_URL',
    severity: 'warning',
    placeholderMarkers: ['user:password', 'localhost:5432/postgres'],
  },
  {
    // Direct connection to ebright_hrfs (public schema) where BranchStaff
    // physically lives. When unset, lib/hrfs.ts falls back to DATABASE_URL
    // (reads keep working via the crm view, but registration INSERTs fail),
    // so this is a warning rather than critical.
    name: 'HRFS_DATABASE_URL',
    severity: 'warning',
    placeholderMarkers: ['user:password', 'localhost:5432/postgres'],
  },
  {
    name: 'CRM_PREVIEW_MODE',
    severity: 'critical',
    productionOnly: true,
    // Reject the literal string 'true' in prod — preview mode bypasses auth.
    placeholderMarkers: ['true'],
  },
]

const isProd = process.env.NODE_ENV === 'production'

const failures: Array<{ name: string; reason: string; severity: Severity }> = []

for (const check of CHECKS) {
  if (check.productionOnly && !isProd) continue

  const value = process.env[check.name]

  if (value === undefined || value === '') {
    failures.push({ name: check.name, reason: 'missing or empty', severity: check.severity })
    continue
  }

  const lower = value.toLowerCase()
  const markerHit = check.placeholderMarkers?.find((m) => lower.includes(m.toLowerCase()))
  if (markerHit) {
    failures.push({
      name: check.name,
      reason: `looks like a placeholder (contains "${markerHit}")`,
      severity: check.severity,
    })
    continue
  }

  if (check.mustMatch && !check.mustMatch.test(value)) {
    failures.push({
      name: check.name,
      reason: `does not match required format (${check.mustMatch})`,
      severity: check.severity,
    })
  }
}

const critical = failures.filter((f) => f.severity === 'critical')
const warnings = failures.filter((f) => f.severity === 'warning')

// Skip reporting/exit during `next build`. None of the checked secrets are
// inlined into the bundle (no NEXT_PUBLIC_*), so the build doesn't need
// real values. The runtime container runs this same module at startup with
// values loaded from env_file, where missing secrets still fail loudly.
//
// NEXT_PHASE alone proved unreliable in Next.js 15.5 — the config can be
// loaded before the phase env is set — so the Dockerfile also sets
// SKIP_ENV_VALIDATION=1 explicitly on the build step.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  || process.env.SKIP_ENV_VALIDATION === '1'

if (!isBuild && warnings.length > 0) {
  console.warn('\n⚠  Environment variable warnings:')
  for (const w of warnings) console.warn(`   • ${w.name} — ${w.reason}`)
  console.warn('')
}

if (!isBuild && critical.length > 0) {
  console.error('\n✗ Refusing to start: invalid environment variables.\n')
  for (const f of critical) {
    console.error(`   ✗ ${f.name} — ${f.reason}`)
  }
  console.error('\nFix .env and restart. Generate secrets with:')
  console.error(`   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # for *_SECRET`)
  console.error(`   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # for ENCRYPTION_KEY\n`)
  process.exit(1)
}
