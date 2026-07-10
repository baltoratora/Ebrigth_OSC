/**
 * Merge-tag renderer for CRM message templates.
 *
 * Supported tags:
 *   {{contact.first_name}}, {{contact.last_name}}, {{contact.email}},
 *   {{contact.phone}}, {{contact.child_name_1}}, {{contact.child_age_1}},
 *   {{contact.child_name_2}}, {{contact.child_age_2}},
 *   {{contact.child_name_3}}, {{contact.child_age_3}},
 *   {{contact.child_name_4}}, {{contact.child_age_4}},
 *   {{contact.preferred_trial_day}}, {{contact.enrolled_package}},
 *   {{branch.name}}, {{branch.phone}}, {{branch.email}}, {{branch.address}},
 *   {{opportunity.value}} — formatted as MYR,
 *   {{custom_values.KEY}} — looks up context.customValues[KEY]
 *
 * Unknown tags are left unchanged (e.g. `{{unknown}}` remains `{{unknown}}`).
 *
 * Usage:
 *   const rendered = renderTemplate(template.body, { contact, branch, opportunity, customValues })
 */

export interface TemplateContext {
  contact?: Partial<{
    firstName: string
    lastName: string
    email: string
    phone: string
    childName1: string
    childAge1: string
    childName2: string
    childAge2: string
    childName3: string
    childAge3: string
    childName4: string
    childAge4: string
    preferredTrialDay: string
    enrolledPackage: string
  }>
  branch?: Partial<{
    name: string
    phone: string
    email: string
    address: string
  }>
  opportunity?: Partial<{
    value: number | string
  }>
  customValues?: Record<string, string>
}

// ─── Internal tag resolver ────────────────────────────────────────────────────

const MYR_FORMATTER = new Intl.NumberFormat('ms-MY', {
  style: 'currency',
  currency: 'MYR',
})

function resolveTag(tag: string, ctx: TemplateContext): string | undefined {
  // {{contact.*}}
  if (tag.startsWith('contact.')) {
    const field = tag.slice('contact.'.length)
    const c = ctx.contact
    if (!c) return undefined

    const fieldMap: Record<string, string | undefined> = {
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      phone: c.phone,
      child_name_1: c.childName1,
      child_age_1: c.childAge1,
      child_name_2: c.childName2,
      child_age_2: c.childAge2,
      child_name_3: c.childName3,
      child_age_3: c.childAge3,
      child_name_4: c.childName4,
      child_age_4: c.childAge4,
      preferred_trial_day: c.preferredTrialDay,
      enrolled_package: c.enrolledPackage,
    }

    return fieldMap[field]
  }

  // {{branch.*}}
  if (tag.startsWith('branch.')) {
    const field = tag.slice('branch.'.length)
    const b = ctx.branch
    if (!b) return undefined

    const fieldMap: Record<string, string | undefined> = {
      name: b.name,
      phone: b.phone,
      email: b.email,
      address: b.address,
    }

    return fieldMap[field]
  }

  // {{opportunity.value}}
  if (tag === 'opportunity.value') {
    const raw = ctx.opportunity?.value
    if (raw === undefined || raw === null) return undefined
    const num = typeof raw === 'string' ? parseFloat(raw) : raw
    return isNaN(num) ? String(raw) : MYR_FORMATTER.format(num)
  }

  // {{custom_values.KEY}}
  if (tag.startsWith('custom_values.')) {
    const key = tag.slice('custom_values.'.length)
    return ctx.customValues?.[key]
  }

  return undefined
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Matches any {{…}} token where the content is non-empty and has no nested braces.
const TAG_REGEX = /\{\{([^{}]+)\}\}/g

/**
 * Replace all `{{tag}}` placeholders in `template` using values from `ctx`.
 * Tags that cannot be resolved are left as-is (no data leakage, easy debugging).
 *
 * Does NOT use `eval` — uses a single regex replace with a pure resolver function.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TAG_REGEX, (_match: string, rawTag: string): string => {
    const tag = rawTag.trim()
    const value = resolveTag(tag, ctx)
    // Return resolved value if found, otherwise return the original placeholder.
    return value !== undefined ? value : _match
  })
}
