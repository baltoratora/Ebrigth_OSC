import { z } from 'zod'

// ─── Node & Edge schemas ──────────────────────────────────────────────────────

export const AutomationNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['trigger', 'action', 'condition', 'delay']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
})

export const AutomationEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
})

export const AutomationGraphSchema = z.object({
  nodes: z.array(AutomationNodeSchema),
  edges: z.array(AutomationEdgeSchema),
})

// ─── Trigger types ────────────────────────────────────────────────────────────

export const TRIGGER_TYPES = [
  'NEW_LEAD',
  'STAGE_CHANGED',
  'TAG_ADDED',
  'TAG_REMOVED',
  'TIME_IN_STAGE',
  'SCHEDULED',
  'FORM_SUBMITTED',
  'INCOMING_MESSAGE',
  'CUSTOM_FIELD_CHANGED',
  'APPOINTMENT_BOOKED',
  'CONTACT_REPLIED',
  'NO_REPLY_AFTER',
  'LEAD_TRANSFERRED',
  'WHATSAPP_LEAD',
] as const

export type TriggerType = (typeof TRIGGER_TYPES)[number]

// ─── Action types ─────────────────────────────────────────────────────────────

export const ACTION_TYPES = [
  'SEND_WHATSAPP',
  'SEND_EMAIL',
  'SEND_SMS',
  'ADD_TAG',
  'REMOVE_TAG',
  'MOVE_STAGE',
  'ASSIGN_USER',
  'CREATE_TASK',
  'SEND_INTERNAL_NOTIFICATION',
  'UPDATE_FIELD',
  'SEND_WEBHOOK',
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

// ─── Create / Update schemas ──────────────────────────────────────────────────

export const CreateAutomationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerConfig: z.record(z.unknown()).default({}),
  graph: AutomationGraphSchema,
  enabled: z.boolean().default(false),
  branchId: z.string().uuid().optional(),
})

export const UpdateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  graph: AutomationGraphSchema.optional(),
  enabled: z.boolean().optional(),
  branchId: z.string().uuid().optional().nullable(),
})

// ─── Inferred types ───────────────────────────────────────────────────────────

export type AutomationNode = z.infer<typeof AutomationNodeSchema>
export type AutomationEdge = z.infer<typeof AutomationEdgeSchema>
export type AutomationGraph = z.infer<typeof AutomationGraphSchema>
export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>
export type UpdateAutomationInput = z.infer<typeof UpdateAutomationSchema>

// ─── Trigger type labels ──────────────────────────────────────────────────────

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  NEW_LEAD: 'New Lead',
  STAGE_CHANGED: 'Stage Changed',
  TAG_ADDED: 'Tag Added',
  TAG_REMOVED: 'Tag Removed',
  TIME_IN_STAGE: 'Time in Stage',
  SCHEDULED: 'Scheduled',
  FORM_SUBMITTED: 'Form Submitted',
  INCOMING_MESSAGE: 'Incoming Message',
  CUSTOM_FIELD_CHANGED: 'Custom Field Changed',
  APPOINTMENT_BOOKED: 'Appointment Booked',
  CONTACT_REPLIED: 'Contact Replied',
  NO_REPLY_AFTER: 'No Reply After',
  LEAD_TRANSFERRED: 'Lead Transferred',
  WHATSAPP_LEAD: 'WhatsApp Lead',
}

// ─── Action type labels ───────────────────────────────────────────────────────

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  SEND_WHATSAPP: 'Send WhatsApp',
  SEND_EMAIL: 'Send Email',
  SEND_SMS: 'Send SMS',
  ADD_TAG: 'Add Tag',
  REMOVE_TAG: 'Remove Tag',
  MOVE_STAGE: 'Move Stage',
  ASSIGN_USER: 'Assign User',
  CREATE_TASK: 'Create Task',
  SEND_INTERNAL_NOTIFICATION: 'Send Internal Notification',
  UPDATE_FIELD: 'Update Field',
  SEND_WEBHOOK: 'Send Webhook',
}
