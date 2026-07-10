/**
 * Catalogue of "built-in" / system automations.
 *
 * These are hard-coded flows that run inside the CRM regardless of whether
 * a super-admin created a matching user automation row. Examples: the lead
 * ingestion pipeline (Wix / Meta / TikTok webhooks → master_leads_base →
 * worker → crm_contact + crm_opportunity), the side-effects of stage moves
 * (CT → create appointment, ENR → set enrolledPackage), and the new-branch
 * auto-pipeline creator.
 *
 * This file is documentation-as-data — it surfaces what's happening in
 * code so super-admins can see the full automation surface area on the
 * /crm/automations page. It does NOT execute anything: editing this list
 * doesn't change any behaviour. Behaviour lives in the linked source
 * files. When you change a system automation, update the entry here too.
 */

export type SystemAutomationCategory =
  | 'lead-ingestion'
  | 'lead-source-flow'
  | 'stage-transition'
  | 'notifications'
  | 'branch-management'
  | 'sibling-handling'

export interface SystemAutomation {
  /** Stable slug — used as the React key, not surfaced in the UI. */
  id: string
  /** Display name. Short and verb-led where possible. */
  name: string
  /** One-line summary shown under the name on the list row. */
  summary: string
  /** Grouping for the UI's section headings. */
  category: SystemAutomationCategory
  /** When this fires — written for a BM, not a developer. */
  trigger: string
  /** Discrete things this automation does, in order. */
  actions: string[]
  /** Repo-relative paths that implement this. Click-to-open in the UI. */
  sources: string[]
}

export const SYSTEM_AUTOMATION_CATEGORY_LABELS: Record<SystemAutomationCategory, string> = {
  'lead-ingestion':     'Lead Ingestion',
  'lead-source-flow':   'Lead Source Flow',
  'stage-transition':   'Stage Transitions',
  'notifications':      'Notifications',
  'branch-management':  'Branch Management',
  'sibling-handling':   'Sibling Handling',
}

export const SYSTEM_AUTOMATIONS: SystemAutomation[] = [
  // ── Lead ingestion: external sources → master_leads_base → CRM ───────────
  {
    id: 'ingest-wix',
    name: 'Ingest — Wix Form Submission',
    summary: 'Wix lead-capture forms land in the CRM as a new opportunity at New Lead.',
    category: 'lead-ingestion',
    trigger: 'Public POST /api/webhooks/wix/[branchId] from a Wix form',
    actions: [
      'Insert the raw payload into raw_wix_leads in ebrightleads_db',
      'The DB trigger surfaces the row in the master_leads_unified view',
      'The lead-ingest worker picks it up (LISTEN/NOTIFY + polling fallback)',
      'Create a crm_contact (deduped by phone/email)',
      'Create a crm_opportunity in the New Lead stage of the branch pipeline',
      'Fire any user-created FORM_SUBMITTED and NEW_LEAD automations',
    ],
    sources: [
      'app/api/webhooks/wix/[branchId]/route.ts',
      'server/workers/leadIngestWorker.ts',
      'lib/crm/leads-import.ts',
    ],
  },
  {
    id: 'ingest-meta',
    name: 'Ingest — Meta (Facebook / Instagram) Lead Ad',
    summary: 'Meta Lead Ads on Facebook + Instagram flow into the CRM the same way as Wix.',
    category: 'lead-ingestion',
    trigger: 'Public POST /api/webhooks/meta/[branchId] from the Meta Graph API',
    actions: [
      'Validate signature + branch scoping',
      'Insert into raw_meta_leads in ebrightleads_db',
      'Lead-ingest worker creates crm_contact + crm_opportunity in New Lead',
      'Fire FORM_SUBMITTED + NEW_LEAD user automations for this branch',
    ],
    sources: [
      'app/api/webhooks/meta/[branchId]/route.ts',
      'server/workers/leadIngestWorker.ts',
    ],
  },
  {
    id: 'ingest-tiktok',
    name: 'Ingest — TikTok Lead Form',
    summary: 'TikTok Lead Form submissions land in the CRM at New Lead.',
    category: 'lead-ingestion',
    trigger: 'Public POST /api/webhooks/tiktok/[branchId] from TikTok',
    actions: [
      'Validate signature + branch',
      'Insert into raw_tiktok_leads in ebrightleads_db',
      'Lead-ingest worker creates crm_contact + crm_opportunity in New Lead',
      'Fire FORM_SUBMITTED + NEW_LEAD user automations',
    ],
    sources: [
      'app/api/webhooks/tiktok/[branchId]/route.ts',
      'server/workers/leadIngestWorker.ts',
    ],
  },
  {
    id: 'ingest-public-form',
    name: 'Ingest — Public Form Submit',
    summary: 'Forms built in /crm/forms and shared via a public link create CRM leads directly.',
    category: 'lead-ingestion',
    trigger: 'Public POST /api/forms/[slug]/submit',
    actions: [
      'Dedupe contact by phone or email within the form\'s tenant',
      'Create or reuse a crm_contact',
      'Create a crm_opportunity in the form\'s configured stage',
      'Fire FORM_SUBMITTED user automations',
    ],
    sources: [
      'app/api/forms/[slug]/submit/route.ts',
    ],
  },
  {
    id: 'ingest-trial-form',
    name: 'Ingest — In-CRM Trial Form',
    summary: 'Trial sign-up form inside /crm/forms/trial-submit creates contact + opp + trial appointment.',
    category: 'lead-ingestion',
    trigger: 'In-app POST /api/crm/forms/trial-submit',
    actions: [
      'Create a crm_contact for the parent',
      'Create a crm_opportunity at the configured stage (usually CT)',
      'If date + slot were picked, create a crm_appointment titled "Trial Class"',
    ],
    sources: [
      'app/api/crm/forms/trial-submit/route.ts',
    ],
  },
  {
    id: 'ingest-worker-poll',
    name: 'Ingest — Worker Poll Fallback',
    summary: 'Catches lead rows that missed the LISTEN/NOTIFY signal (e.g. worker restart).',
    category: 'lead-ingestion',
    trigger: 'Every 60 seconds, lead-ingest worker queries master_leads_unified for rows newer than its watermark',
    actions: [
      'Skip rows already imported (externalSourceTable + externalSourceId match)',
      'Otherwise run the same crm_contact + crm_opportunity creation as the LISTEN path',
      'Advance the worker\'s watermark',
    ],
    sources: [
      'server/workers/leadIngestWorker.ts',
    ],
  },
  {
    id: 'ingest-whatsapp-meta',
    name: 'Inbound — WhatsApp via Meta',
    summary: 'Incoming WhatsApp messages on Meta-hosted numbers fire INCOMING_MESSAGE automations.',
    category: 'lead-source-flow',
    trigger: 'Public POST /api/webhooks/whatsapp/meta/[branchId]',
    actions: [
      'Match incoming phone number to an existing crm_contact in the branch',
      'Insert a crm_message row with the body + media',
      'Fire INCOMING_MESSAGE user automations',
    ],
    sources: [
      'app/api/webhooks/whatsapp/meta/[branchId]/route.ts',
    ],
  },
  {
    id: 'ingest-whatsapp-twilio',
    name: 'Inbound — WhatsApp via Twilio',
    summary: 'Same as the Meta WhatsApp path, but for numbers hosted on Twilio.',
    category: 'lead-source-flow',
    trigger: 'Public POST /api/webhooks/whatsapp/twilio/[branchId]',
    actions: [
      'Validate Twilio signature',
      'Match phone to a crm_contact in the branch',
      'Insert a crm_message + fire INCOMING_MESSAGE user automations',
    ],
    sources: [
      'app/api/webhooks/whatsapp/twilio/[branchId]/route.ts',
    ],
  },

  // ── Sibling handling — Wix + Meta forms that carry children_details ──────
  {
    id: 'sibling-explode',
    name: 'Sibling Explode — One Card per Child',
    summary: 'A single parent submission with multiple children becomes one CRM card per child.',
    category: 'sibling-handling',
    trigger: 'Lead ingest with children_details array of length > 1 (or inferred from same parent phone)',
    actions: [
      'For each entry in children_details, create a separate crm_contact + crm_opportunity',
      'Set firstName/lastName to the child\'s name; parentFullName to the parent\'s',
      'Set childAge1 to the child\'s age',
      'If sibling_index is NULL (non-Wix sources), infer it from the count of existing contacts with this phone/email',
    ],
    sources: [
      'lib/crm/leads-import.ts',
    ],
  },

  // ── Stage transitions: business logic enforced on every move ──────────────
  {
    id: 'stage-ct',
    name: 'Stage Move — Confirmed for Trial',
    summary: 'Moving a lead to CT validates the slot capacity and books the trial appointment.',
    category: 'stage-transition',
    trigger: 'Drag a lead into Confirmed for Trial (or via the modal stage picker / bulk move)',
    actions: [
      'Require a trial date + time slot from the move modal',
      'Reject if the picked slot already has 18 students at the branch on that date',
      'Insert a crm_appointment titled "Trial Class" for the branch + contact',
      'Append "Trial: <date> @ <slot>" to crm_stage_history.note',
      'Fire any STAGE_CHANGED user automations',
    ],
    sources: [
      'server/actions/opportunities.ts',
      'lib/crm/trial-config.ts',
    ],
  },
  {
    id: 'stage-enrolled',
    name: 'Stage Move — Enrolled',
    summary: 'Moving a lead to Enrolled requires a package choice and records it on the contact.',
    category: 'stage-transition',
    trigger: 'Drag a lead into Enrolled (or via stage picker / bulk move)',
    actions: [
      'Require an enrolment package (3, 6, 9, or 12 months) from the move modal',
      'Set crm_contact.enrolledPackage to "<N> months"',
      'Append "Enrolled — <N>-month package" to crm_stage_history.note',
      'Fire any STAGE_CHANGED user automations',
    ],
    sources: [
      'server/actions/opportunities.ts',
    ],
  },
  {
    id: 'stage-reschedule',
    name: 'Stage Move — Reschedule',
    summary: 'Moving a lead to Reschedule requires a follow-up date.',
    category: 'stage-transition',
    trigger: 'Drag a lead into Reschedule',
    actions: [
      'Require a reschedule follow-up date from the modal',
      'Append "Reschedule follow-up: <date>" to crm_stage_history.note',
    ],
    sources: [
      'server/actions/opportunities.ts',
    ],
  },
  {
    id: 'stage-cold-lead',
    name: 'Stage Move — Cold Lead',
    summary: 'Dropping a lead to Cold Lead requires an explicit reason in the note.',
    category: 'stage-transition',
    trigger: 'Drag a lead into Cold Lead',
    actions: [
      'Require a non-empty remark in the move modal',
      'Record the remark on crm_stage_history.note',
    ],
    sources: [
      'server/actions/opportunities.ts',
      'components/crm/opportunities/stage-change-modal.tsx',
    ],
  },
  {
    id: 'stage-transition-rules',
    name: 'Stage Transition Rules — Lead Pipeline',
    summary: 'Non-admin users can only move leads along the allowed edges of the flow chart.',
    category: 'stage-transition',
    trigger: 'Any drag, stage-picker, or bulk-move action that changes a lead\'s stage',
    actions: [
      'Check the rule map: NL → FU1/CT only; FU1/FU2/FU3 → FU later / CT / CL / DND; CT → SU/CNS/RSD; etc.',
      'Reject the move and show "Invalid stage transition" if the edge isn\'t allowed',
      'Bulk move skips unauthorised leads and reports the count back to the user',
      'Super-admins + agency-admins bypass these rules entirely',
    ],
    sources: [
      'components/crm/opportunities/kanban-board.tsx',
    ],
  },
  {
    id: 'stale-lead-auto-progression',
    name: 'Auto-progress Unresponsive Leads — FU3 → URW1 → URW2 → URW3 → CL',
    summary: 'After 7 days of inactivity at each step, leads walk themselves down the unresponsive funnel.',
    category: 'stage-transition',
    trigger: 'Hourly scan (BullMQ repeatable on Redis-enabled environments) + manual HTTP cron endpoint',
    actions: [
      'Find every opportunity in FU3 whose lastStageChangeAt is older than 7 days → move to UR_W1',
      'Same rule moves UR_W1 → UR_W2 after another 7 days of silence',
      'Same rule moves UR_W2 → UR_W3 after another 7 days of silence',
      'After 7 days in UR_W3 the lead drops to Cold Lead with the stage remark "Unresponsive (Auto-Generated)"',
      'Each move bumps lastStageChangeAt so a lead only advances one step per scan run',
      'Stage remarks are written to crm_stage_history.note so they show under "Stage remarks" on the lead detail',
      'On Redis-less staging the worker is dormant — the same logic can be fired by hitting POST /api/crm/cron/move-stale-leads with the CRON_SECRET',
    ],
    sources: [
      'lib/crm/stale-leads.ts',
      'server/workers/staleLeadWorker.ts',
      'app/api/crm/cron/move-stale-leads/route.ts',
    ],
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  {
    id: 'notif-new-lead-bell',
    name: 'Notification — New Lead Bell',
    summary: 'A new lead lights up the bell badge for every user with access to that branch.',
    category: 'notifications',
    trigger: 'A new crm_opportunity is inserted via the ingest worker',
    actions: [
      'Find every crm_user_branch row for the lead\'s branch',
      'Insert a crm_notification per user with type="new_lead" and a link to the kanban card',
    ],
    sources: [
      'lib/crm/leads-import.ts',
      'lib/crm/notifications.ts',
    ],
  },
  {
    id: 'notif-chat-stub',
    name: 'Notification — Stage Change to Watcher',
    summary: 'STAGE_CHANGED user automations can fan out into in-app notifications for watchers.',
    category: 'notifications',
    trigger: 'Any user-created STAGE_CHANGED automation with a SEND_INTERNAL_NOTIFICATION action',
    actions: [
      'Insert a crm_notification for each recipient',
      'The topbar bell polls /api/crm/notifications every 30s and surfaces the badge',
    ],
    sources: [
      'server/workers/automationWorker.ts',
    ],
  },

  // ── Branch management ────────────────────────────────────────────────────
  {
    id: 'branch-auto-pipeline',
    name: 'New Branch — Auto Pipeline + Stages + Tkt Branch',
    summary: 'Adding a branch via the admin UI bootstraps everything it needs to receive leads.',
    category: 'branch-management',
    trigger: 'POST /api/crm/branches by a super-admin / agency-admin',
    actions: [
      'Insert the crm_branch row',
      'Create a matching crm_pipeline + 17 lead stages (NL, FU1-3, RSD, CT, CNS, SU, SNE, ENR, UR_W1-3, FU3M, CL, DND, SG)',
      'If the name has an "NN" prefix AND a code, also create a tkt_branch so the ticket module picks it up',
    ],
    sources: [
      'server/actions/branches.ts',
      'app/api/crm/branches/route.ts',
    ],
  },
]
