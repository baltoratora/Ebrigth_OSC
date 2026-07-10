import { z } from 'zod'

export const CreateContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  leadSourceId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  preferredBranchId: z.string().uuid().optional(),
  preferredTrialDay: z.enum(['WED', 'THU', 'FRI', 'SAT', 'SUN']).optional(),
  enrolledPackage: z.string().optional(),
  childName1: z.string().optional(),
  childAge1: z.string().optional(),
  childName2: z.string().optional(),
  childAge2: z.string().optional(),
  childName3: z.string().optional(),
  childAge3: z.string().optional(),
  childName4: z.string().optional(),
  childAge4: z.string().optional(),
  /** Parent's display name when the contact row represents a child (sibling-
   *  exploded import). Editable so a BM can correct misimported leads. */
  parentFullName: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
})

export const UpdateContactSchema = CreateContactSchema.partial()

export type CreateContactInput = z.infer<typeof CreateContactSchema>
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>
