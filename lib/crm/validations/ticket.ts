/**
 * Zod validation schemas for the Ebright ticketing module.
 *
 * Covers:
 *  - TicketStatus enum
 *  - Per-platform, per-subtype field schemas registry
 *  - CreateTicketSchema / UpdateTicketStatusSchema for API route validation
 *  - getFieldSchema / validateTicketFields helpers
 */

import { z } from 'zod'

// ─── Status ───────────────────────────────────────────────────────────────────

export const TicketStatus = z.enum(['received', 'approved', 'in_progress', 'complete', 'rejected'])
export type TicketStatusType = z.infer<typeof TicketStatus>

// ─── Platform field schema registry ──────────────────────────────────────────
// Each key is a platform slug; each sub-key is a sub_type value.
// Fields are JSON-stored so schemas run at validation time only.

export const ticketFieldSchemas = {
  aone: {
    freeze_student: z.object({
      studentName:   z.string().min(2, 'Student name must be at least 2 characters'),
      startDate:     z.coerce.date({ invalid_type_error: 'Start date is required' }),
      endDate:       z.coerce.date({ invalid_type_error: 'End date is required' }),
      reason:        z.string().min(5, 'Reason must be at least 5 characters'),
      blackWhiteFile: z.string().optional(),
      generalFile:   z.string().optional(),
    }),
    archive_student: z.object({
      studentName: z.string().min(2, 'Student name must be at least 2 characters'),
      reason:      z.string().min(5, 'Reason must be at least 5 characters'),
    }),
    extend: z.object({
      studentName: z.string().min(2, 'Student name must be at least 2 characters'),
      startDate:   z.coerce.date({ invalid_type_error: 'Start date is required' }),
      endDate:     z.coerce.date({ invalid_type_error: 'End date is required' }),
      reason:      z.string().min(5, 'Reason must be at least 5 characters'),
    }),
    delete_invoice: z.object({
      studentName:   z.string().min(2, 'Student name must be at least 2 characters'),
      invoiceNumber: z.string().min(1, 'Invoice number is required'),
      reason:        z.string().min(5, 'Reason must be at least 5 characters'),
    }),
    login_issue: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    others: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
  },

  ghl: {
    leads: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    tally: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    organizing_leads: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    booking: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    workflow: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    others: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
  },

  'process-street': {
    extend: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    others: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
  },

  clickup: {
    missing: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    duplicate: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    linkage: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
    others: z.object({
      remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
    }),
  },

  // Lead tickets all carry the same field shape: Stage + Opportunity
  // identifiers (Name / Contact / Email) + Remarks. The opportunity
  // identifiers let the admin handling the ticket locate the lead in
  // the CRM kanban without back-and-forth.
  lead: (() => {
    const leadFields = z.object({
      stage:              z.string().min(1, 'Stage is required'),
      opportunityName:    z.string().min(1, 'Opportunity name is required'),
      opportunityContact: z.string().min(1, 'Opportunity contact is required'),
      opportunityEmail:   z.string().email('A valid opportunity email is required'),
      remarks:            z.string().min(5, 'Remarks must be at least 5 characters'),
    })
    return {
      missing:   leadFields,
      duplicate: leadFields,
      delete:    leadFields,
      others:    leadFields,
    }
  })(),

  // For the "Others" platform the sub_type IS the department (chosen via
  // department-cards on step 2), so each department gets the same Position
  // + Remarks schema. Both `other` (singular) and `others` (plural) keys
  // exist so validation works regardless of which slug the DB seeded.
  other:  buildOthersDepartmentSchemas(),
  others: buildOthersDepartmentSchemas(),
} as const

// ─── Helper: per-department Position+Remarks schema ──────────────────────────

function buildOthersDepartmentSchemas() {
  const positionEnum = z.enum([
    'ceo', 'hod', 'executive', 'branch_manager',
    'intern', 'full_time_coach', 'part_time_coach',
  ], { errorMap: () => ({ message: 'Position is required' }) })
  const fields = z.object({
    position: positionEnum,
    remarks:  z.string().min(5, 'Remarks must be at least 5 characters'),
  })
  return {
    ceo:            fields,
    optimisation:   fields,
    finance:        fields,
    human_resource: fields,
    operation:      fields,
    academy:        fields,
    marketing:      fields,
    // Backwards-compat: the previous design used a single 'others' subtype
    // for the Others platform. Keep accepting it so old tickets still
    // re-validate cleanly if they're ever re-saved.
    others:         fields,
  }
}

// ─── Default fallback field schema ───────────────────────────────────────────

const fallbackFieldSchema = z.object({
  remarks: z.string().min(5, 'Remarks must be at least 5 characters'),
})

// ─── Typed lookup ─────────────────────────────────────────────────────────────

type PlatformSlug = keyof typeof ticketFieldSchemas

function isPlatformSlug(slug: string): slug is PlatformSlug {
  return slug in ticketFieldSchemas
}

/**
 * Return the Zod schema for a given (platformSlug, subType) combination.
 * Falls back to `z.object({ remarks: z.string().min(5) })` for unknown combos.
 */
export function getFieldSchema(platformSlug: string, subType: string): z.ZodTypeAny {
  if (!isPlatformSlug(platformSlug)) return fallbackFieldSchema

  const platformSchemas = ticketFieldSchemas[platformSlug] as Record<string, z.ZodTypeAny>
  return platformSchemas[subType] ?? fallbackFieldSchema
}

/**
 * Parse and validate ticket fields for the given platform + subType.
 * Returns the parsed (coerced) data or throws a `z.ZodError`.
 *
 * @throws {z.ZodError}
 */
export function validateTicketFields(
  platformSlug: string,
  subType: string,
  fields: unknown,
): unknown {
  const schema = getFieldSchema(platformSlug, subType)
  return schema.parse(fields)
}

// ─── CreateTicketSchema ───────────────────────────────────────────────────────

export const CreateTicketSchema = z.object({
  /** tkt_branch.id */
  branchId: z.string().uuid('Invalid branch ID'),

  /** tkt_platform.slug e.g. "aone", "ghl" */
  platformSlug: z.string().min(1, 'Platform is required'),

  /** Platform-specific sub-type e.g. "freeze_student", "leads" */
  subType: z.string().min(1, 'Sub-type is required'),

  /**
   * Platform-specific dynamic fields.
   * Deeper validation is performed by validateTicketFields() after the
   * platform slug is resolved to its tkt_platform.id.
   */
  fields: z.record(z.unknown()),

  /**
   * Optional array of tkt_ticket_attachment.id values created during
   * the file-upload step. The API route links them to the ticket.
   */
  attachmentIds: z.array(z.string().uuid()).optional(),
})

export type CreateTicketInput = z.infer<typeof CreateTicketSchema>

// ─── UpdateTicketStatusSchema ─────────────────────────────────────────────────

export const UpdateTicketStatusSchema = z
  .object({
    status: TicketStatus,

    /** Free-text remark visible to the submitter (optional for all statuses). */
    adminRemark: z.string().min(1).max(2000).optional(),

    /**
     * Required when status === 'rejected'.
     * Optional (and ignored) for other statuses.
     */
    rejectionReason: z.string().min(5, 'Rejection reason must be at least 5 characters').optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'rejected') {
        return (
          typeof data.rejectionReason === 'string' &&
          data.rejectionReason.trim().length >= 5
        )
      }
      return true
    },
    {
      message: 'Rejection reason is required when status is "rejected"',
      path: ['rejectionReason'],
    },
  )

export type UpdateTicketStatusInput = z.infer<typeof UpdateTicketStatusSchema>
