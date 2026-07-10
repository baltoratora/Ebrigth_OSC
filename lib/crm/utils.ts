/**
 * CRM utility functions.
 *
 * Covers:
 *  - Tailwind class merging (cn)
 *  - Malaysian Ringgit formatting (formatMYR)
 *  - Date / datetime formatting in Asia/Kuala_Lumpur timezone (formatDate, formatDateTime)
 *  - E.164 phone normalisation for +60 numbers (normalizePhone)
 *  - API key generation with SHA-256 hash (generateApiKey)
 *  - URL-safe slug generation (slugify)
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'
import { randomBytes, createHash } from 'crypto'

// ─── Tailwind class merging ───────────────────────────────────────────────────

/**
 * Merge Tailwind CSS class names, resolving conflicts correctly.
 * Combines clsx (conditional classes) with tailwind-merge (conflict resolution).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─── Currency formatting ──────────────────────────────────────────────────────

const MYR_FORMATTER = new Intl.NumberFormat('ms-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a numeric value as Malaysian Ringgit.
 * Accepts both `number` and numeric `string` (e.g. Prisma Decimal serialised as string).
 */
export function formatMYR(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return 'RM0.00'
  return MYR_FORMATTER.format(num)
}

// ─── Date / datetime formatting ───────────────────────────────────────────────

const KL_TIMEZONE = 'Asia/Kuala_Lumpur'

function toKLDate(date: Date | string): Date {
  const raw = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(raw)) {
    throw new RangeError(`[CRM] Invalid date value: ${String(date)}`)
  }
  return toZonedTime(raw, KL_TIMEZONE)
}

/**
 * Format a date in Asia/Kuala_Lumpur timezone.
 *
 * @param date      JS Date or ISO string
 * @param formatStr date-fns format string (default: 'dd/MM/yyyy')
 */
export function formatDate(date: Date | string, formatStr = 'dd/MM/yyyy'): string {
  return format(toKLDate(date), formatStr)
}

/**
 * Format a datetime in Asia/Kuala_Lumpur timezone as 'dd/MM/yyyy HH:mm'.
 */
export function formatDateTime(date: Date | string): string {
  return format(toKLDate(date), 'dd/MM/yyyy HH:mm')
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a Malaysian phone number to E.164 format (+60…).
 * Uses libphonenumber-js with default country MY.
 * Returns the original string unchanged if parsing fails.
 */
export function normalizePhone(phone: string): string {
  if (!phone || phone.trim() === '') return phone

  try {
    const trimmed = phone.trim()

    // Fast path: already valid E.164
    if (isValidPhoneNumber(trimmed, 'MY')) {
      const parsed = parsePhoneNumber(trimmed, 'MY')
      return parsed.format('E.164')
    }

    // Attempt parsing with default country MY
    const parsed = parsePhoneNumber(trimmed, 'MY')
    if (parsed.isValid()) {
      return parsed.format('E.164')
    }
  } catch {
    // Fall through to return original
  }

  return phone
}

/**
 * Normalise a search term for phone matching.
 *
 * Stored phones are a mix of E.164 ("+60123456789"), local ("0123456789"),
 * and raw form-submitted strings that may carry spaces / dashes / brackets.
 * A user searching "+60 12-345 6789", "012-3456789", or "123456789" must all
 * hit the same lead. We reduce both the query and (in SQL) the stored column
 * to bare digits, then strip the Malaysian country code (60) and any leading
 * zero so the "national significant number" is what we substring-match on —
 * that core is shared by every stored form of the same number.
 *
 * Returns null when the term isn't phone-like (too few digits, or clearly a
 * name/email) so callers can skip the phone branch entirely.
 */
export function phoneSearchDigits(search: string): string | null {
  if (!search) return null
  // Bail if it looks like an email or contains letters — that's a name search.
  if (/[a-z@]/i.test(search)) return null
  let digits = search.replace(/\D/g, '')
  if (digits.length < 4) return null
  // Drop a leading Malaysian country code, then a leading trunk 0, so
  // "+60123456789" / "60123456789" / "0123456789" all reduce to "123456789".
  if (digits.startsWith('60')) digits = digits.slice(2)
  digits = digits.replace(/^0+/, '')
  return digits.length >= 4 ? digits : null
}

/**
 * Format a phone number for DISPLAY only (e.g. on lead cards).
 *
 * Target shape for Malaysian mobiles: "+6012 - 345 6789" (no space after the
 * country code, a spaced dash, then the libphonenumber grouping). This is a
 * cosmetic transform — the stored value is never changed, so phone SEARCH
 * (which reduces both query and column to bare digits via phoneSearchDigits)
 * is unaffected whether or not the displayed value carries "+6"/spaces.
 *
 * Numbers that ALREADY contain whitespace are assumed to be pre-formatted in
 * the source data and are returned verbatim. Anything unparseable is returned
 * unchanged too.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return ''
  // Already-spaced in the DB → leave exactly as stored.
  if (/\s/.test(phone.trim())) return phone

  try {
    const parsed = parsePhoneNumber(phone, 'MY')
    if (parsed && parsed.isValid()) {
      return parsed
        .format('INTERNATIONAL') // "+60 12-345 6789"
        .replace(/^(\+\d+)\s/, '$1') // drop space after country code → "+6012-345 6789"
        .replace('-', ' - ') // pad the dash → "+6012 - 345 6789"
    }
  } catch {
    // Fall through to return original.
  }

  return phone
}

// ─── API key generation ───────────────────────────────────────────────────────

/**
 * Generate a new CRM API key pair.
 *
 * @returns
 *   - `key`    The plain-text key shown to the user once (store nothing or show once)
 *   - `hashed` SHA-256 hex digest stored in `crm_api_key.hashedKey`
 */
export function generateApiKey(): { key: string; hashed: string } {
  const entropy = randomBytes(32).toString('hex')
  const key = `ek_${entropy}`
  const hashed = createHash('sha256').update(key, 'utf8').digest('hex')
  return { key, hashed }
}

// ─── Slug generation ──────────────────────────────────────────────────────────

/**
 * Convert a string to a URL-safe, lowercase slug.
 *
 * - Converts to lowercase
 * - Replaces runs of non-alphanumeric characters with a single hyphen
 * - Strips leading and trailing hyphens
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
