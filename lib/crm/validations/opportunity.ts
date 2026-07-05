import { z } from 'zod'

export const CreateOpportunitySchema = z.object({
  contactId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  value: z.number().min(0).default(0),
  assignedUserId: z.string().uuid().optional(),
})

export const MoveOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  toStageId: z.string().uuid(),
  note: z.string().optional(),
  /** ISO date string (YYYY-MM-DD) — set when moving into "Confirmed for Trial" */
  trialDate: z.string().optional(),
  /** e.g. "10:00 AM – 11:00 AM" — set when moving into "Confirmed for Trial" */
  trialTimeSlot: z.string().optional(),
  /** 3 | 6 | 9 | 12 | 18 | 24 — set when moving into "Enrolled" */
  enrollmentMonths: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12), z.literal(18), z.literal(24)]).optional(),
  /** ISO date string (YYYY-MM-DD) — set when moving into "Reschedule" */
  rescheduleDate: z.string().optional(),
})

export const UpdateOpportunitySchema = CreateOpportunitySchema.partial()

export const BulkMoveSchema = z.object({
  opportunityIds: z.array(z.string().uuid()).min(1),
  toStageId: z.string().uuid(),
  note: z.string().optional(),
})

export const BulkDeleteSchema = z.object({
  opportunityIds: z.array(z.string().uuid()).min(1),
})

export type CreateOpportunityInput = z.infer<typeof CreateOpportunitySchema>
export type MoveOpportunityInput = z.infer<typeof MoveOpportunitySchema>
export type UpdateOpportunityInput = z.infer<typeof UpdateOpportunitySchema>
export type BulkMoveInput = z.infer<typeof BulkMoveSchema>
export type BulkDeleteInput = z.infer<typeof BulkDeleteSchema>
