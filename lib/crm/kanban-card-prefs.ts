/**
 * Per-browser preferences for what to show on the kanban lead cards.
 *
 * Stored in localStorage (chosen over server-side persistence for v1 — keeps
 * the feature shippable without a schema change). The drawer in
 * components/crm/opportunities/customise-card-drawer.tsx is the only writer;
 * KanbanBoard reads on mount and re-reads when the drawer closes.
 */

export type CardLayout = 'default' | 'compact'

/** Identifiers for each toggleable field on the card. */
export type CardFieldKey =
  | 'name'              // Always on, locked.
  | 'parentName'        // Parent's full name (when contact represents a child).
  | 'ageCategory'       // Junior / Mid / Senior pill next to child name.
  | 'leadSource'        // fb / tt / ig / rf / wa platform icon.
  | 'value'             // RM amount (only shows when value > 0).
  | 'lastStageChange'   // "about 3 hours ago" relative timestamp.
  | 'tags'              // Smart tags row.
  | 'owner'             // Assigned user avatar.
  | 'stageBadge'        // Short-code pill at the bottom (NL / FU1 / CT / ...).
  // Contact details
  | 'email'             // Contact email.
  | 'phone'             // Contact phone.
  | 'campaign'          // Marketing campaign name from master_leads_base.
  // Opportunity details
  | 'createdAt'         // Lead creation date (DD MMM YYYY).
  | 'stageName'         // Full stage name (e.g. "Follow-Up 1st Attempt").

export type QuickActionKey =
  | 'call'
  | 'conversations'
  | 'tags'
  | 'notes'
  | 'tasks'
  | 'appointment'

export interface CardPrefs {
  layout: CardLayout
  fields: CardFieldKey[]
  quickActions: QuickActionKey[]
}

/**
 * Defaults match the existing kanban card layout so toggling the feature on
 * for the first time doesn't visibly change anything for the user.
 */
export const DEFAULT_CARD_PREFS: CardPrefs = {
  layout: 'default',
  // 'createdAt' (Created On, with timestamp) is on by default — BMs sort/triage
  // by when a lead came in, so it shouldn't need turning on in Manage Fields.
  fields: ['name', 'parentName', 'ageCategory', 'leadSource', 'lastStageChange', 'owner', 'stageBadge', 'createdAt'],
  quickActions: ['notes', 'tags', 'appointment'],
}

/** All field options the drawer renders, grouped for readability. The
 *  `locked` flag marks fields the user can't deselect (always rendered on
 *  the card). The drawer groups by `group` so the long list scans like
 *  GHL's collapsible sections (Other Details / Primary Contact / ...).
 */
export const ALL_CARD_FIELDS: Array<{
  key: CardFieldKey
  label: string
  group: 'core' | 'contact' | 'opportunity'
  locked?: boolean
}> = [
  // Core — what shows up directly on the card by default.
  { key: 'name',            label: 'Lead Name',           group: 'core', locked: true },
  { key: 'parentName',      label: 'Parent Name',         group: 'core' },
  { key: 'ageCategory',     label: 'Age Category',        group: 'core' },
  { key: 'leadSource',      label: 'Lead Source',         group: 'core' },
  { key: 'value',           label: 'Value (RM)',          group: 'core' },
  { key: 'lastStageChange', label: 'Last Moved (relative)', group: 'core' },
  { key: 'tags',            label: 'Tags',                group: 'core' },
  { key: 'owner',           label: 'Owner',               group: 'core' },
  { key: 'stageBadge',      label: 'Stage Badge',         group: 'core' },
  // Primary Contact Details — GHL-style group.
  { key: 'email',           label: "Contact's Email",     group: 'contact' },
  { key: 'phone',           label: "Contact's Phone",     group: 'contact' },
  { key: 'campaign',        label: 'Campaign',            group: 'contact' },
  // Opportunity Details — pipeline + stage metadata.
  { key: 'createdAt',       label: 'Created On',          group: 'opportunity' },
  { key: 'stageName',       label: 'Stage (full name)',   group: 'opportunity' },
]

export const CARD_FIELD_GROUPS: ReadonlyArray<{ key: 'core' | 'contact' | 'opportunity'; label: string }> = [
  { key: 'core',        label: 'Default fields' },
  { key: 'contact',     label: 'Primary Contact Details' },
  { key: 'opportunity', label: 'Opportunity Details' },
]

export const ALL_QUICK_ACTIONS: Array<{ key: QuickActionKey; label: string }> = [
  { key: 'call',          label: 'Call' },
  { key: 'conversations', label: 'Unread conversations' },
  { key: 'tags',          label: 'Tags' },
  { key: 'notes',         label: 'Notes' },
  { key: 'tasks',         label: 'Tasks' },
  { key: 'appointment',   label: 'Upcoming Confirmed Appointment' },
]

const STORAGE_KEY = 'crm.kanban.cardPrefs.v1'

export function loadCardPrefs(): CardPrefs {
  if (typeof window === 'undefined') return DEFAULT_CARD_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CARD_PREFS
    const parsed = JSON.parse(raw) as Partial<CardPrefs>
    return {
      layout:        parsed.layout === 'compact' ? 'compact' : 'default',
      fields:        Array.isArray(parsed.fields) ? parsed.fields.filter(isFieldKey) : DEFAULT_CARD_PREFS.fields,
      quickActions:  Array.isArray(parsed.quickActions) ? parsed.quickActions.filter(isQuickActionKey) : DEFAULT_CARD_PREFS.quickActions,
    }
  } catch {
    return DEFAULT_CARD_PREFS
  }
}

export function saveCardPrefs(prefs: CardPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage may be full or disabled — best-effort persistence.
  }
}

function isFieldKey(v: unknown): v is CardFieldKey {
  return typeof v === 'string' && ALL_CARD_FIELDS.some((f) => f.key === v)
}

function isQuickActionKey(v: unknown): v is QuickActionKey {
  return typeof v === 'string' && ALL_QUICK_ACTIONS.some((a) => a.key === v)
}
