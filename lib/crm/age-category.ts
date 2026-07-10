export type AgeCategory = 'Junior' | 'Mid' | 'Senior'

/**
 * Map a free-form age string (e.g. "8", "7-9 years old", "10 y/o") to one of
 * the three tier labels. Uses the first integer found — for ranges, that's the
 * lower bound, which is the more specific bucket.
 *
 *   7–9   → Junior
 *   10–12 → Mid
 *   13–16 → Senior
 */
export function getAgeCategory(ageStr: string | null | undefined): AgeCategory | null {
  if (!ageStr) return null
  const match = ageStr.match(/\d+/)
  if (!match) return null
  const age = parseInt(match[0], 10)
  if (age >= 7 && age <= 9) return 'Junior'
  if (age >= 10 && age <= 12) return 'Mid'
  if (age >= 13 && age <= 16) return 'Senior'
  return null
}

/**
 * Display helper — if the age is just a number, append "yrs" so it reads
 * naturally; otherwise show whatever's stored (e.g. legacy "7-9 years old").
 */
export function formatChildAge(age: string | null | undefined): string {
  if (!age) return ''
  const trimmed = age.trim()
  if (/^\d+$/.test(trimmed)) return `${trimmed} yrs`
  return trimmed
}

export function ageCategoryClasses(category: AgeCategory): string {
  switch (category) {
    case 'Junior':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    case 'Mid':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
    case 'Senior':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
  }
}
