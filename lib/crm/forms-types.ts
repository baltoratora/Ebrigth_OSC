/**
 * Shared types for the CRM public-form builder.
 * Stored in crm_website_form.schema as JSON.
 *
 * v2 supports multi-step forms. v1 (flat FormField[]) is still accepted by
 * the public renderer and submit route for backwards compat.
 */

export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select'
  | 'choice'   // big pill-buttons, single select
  | 'date'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  helpText?: string
  required?: boolean
  options?: string[]
}

export interface FormStep {
  id: string
  title?: string
  /** Optional group label above fields (e.g. "Child 1") */
  groupLabel?: string
  fields: FormField[]
  /**
   * If set, this step is dynamically repeated N times where N is the value of
   * the referenced field (choice/number). Used for "how many children" → N child blocks.
   */
  repeatBasedOn?: string
}

export interface FormSchemaV2 {
  version: 2
  steps: FormStep[]
  primaryColor?: string          // defaults to red
  successTitle?: string
  successMessage?: string
}

export type FormSchema = FormSchemaV2 | FormField[]

export function isV2(schema: unknown): schema is FormSchemaV2 {
  return typeof schema === 'object' && schema !== null && (schema as { version?: number }).version === 2
}

export function normalizeToV2(schema: unknown): FormSchemaV2 {
  if (isV2(schema)) return schema
  const fields = Array.isArray(schema) ? (schema as FormField[]) : []
  return {
    version: 2,
    steps: [{ id: 'step-1', fields }],
    successTitle: 'Registration Successful!',
    successMessage: 'Thank you for registering. We will contact you shortly.',
  }
}

// Generate a short random id for new fields/steps
export function genId(prefix = 'fld'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function emptySchema(): FormSchemaV2 {
  // Matches the Trial Class Registration flow exactly — four steps, no extras.
  return {
    version: 2,
    primaryColor: '#dc2626',
    successTitle: 'Registration Successful!',
    successMessage: 'Thank you for registering. We will contact you shortly via WhatsApp to confirm your trial class schedule.',
    steps: [
      {
        id: genId('step'),
        fields: [
          { id: genId(), type: 'text',  label: "Parent's Name",    required: true, placeholder: 'Example: Jonathan Tan, Sara Yahya, Muthu' },
          {
            id: genId(),
            type: 'tel',
            label: "Parent's Contact",
            required: true,
            placeholder: '0123456789',
            helpText: 'Reminders will be sent via WhatsApp, please make sure your number has WhatsApp function.',
          },
          { id: genId(), type: 'email', label: "Parent's Email",   required: true, placeholder: 'Example: Ebright@gmail.com' },
        ],
      },
      {
        id: genId('step'),
        fields: [
          {
            id: genId(),
            type: 'choice',
            label: 'How many children are joining?',
            required: true,
            options: ['1', '2', '3', '4'],
          },
        ],
      },
      {
        id: genId('step'),
        groupLabel: 'Child 1',
        fields: [
          { id: genId(), type: 'text',   label: "Child's Name", required: true },
          {
            id: genId(),
            type: 'select',
            label: "Child's Age",
            required: true,
            placeholder: 'Select age',
            options: ['7-9 years old', '10-12 years old', '13-16 years old'],
          },
        ],
      },
      {
        id: genId('step'),
        fields: [
          {
            id: genId(),
            type: 'select',
            label: 'Preferred branch near you',
            required: true,
            placeholder: 'Please select',
            options: [
              '00 Ebright (OD)',
              '01 Ebright (Online)',
              '02 Ebright (Subang Taipan)',
              '03 Ebright (Setia Alam)',
              '04 Ebright (Sri Petaling)',
              '05 Ebright (Kota Damansara)',
              '06 Ebright (Putrajaya)',
              '07 Ebright (Ampang)',
              '08 Ebright (Cyberjaya)',
              '09 Ebright (Klang)',
              '10 Ebright (Denai Alam)',
              '11 Ebright (Bandar Baru Bangi)',
              '12 Ebright (Danau Kota)',
              '13 Ebright (Shah Alam)',
              '14 Ebright (Bandar Tun Hussein Onn)',
              '15 Ebright (Eco Grandeur)',
              '16 Ebright (Bandar Seri Putra)',
              '17 Ebright (Bandar Rimbayu)',
              '18 Ebright (Taman Sri Gombak)',
              '19 Ebright (Kota Warisan)',
              '20 Ebright (Kajang TTDI Grove)',
              '21 Ebright (Tropicana Sungai Buloh)',
              '22 Ebright (Puncak Jalil)',
              '23 Ebright (Puchong Utama)',
            ],
          },
          {
            id: genId(),
            type: 'textarea',
            label: 'Remarks [If any]',
            placeholder: 'Special needs (e.g. ADHD, autism)',
          },
        ],
      },
    ],
  }
}
