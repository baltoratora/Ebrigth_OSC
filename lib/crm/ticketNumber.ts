/**
 * Ticket number generator — format: YYMM-BBII-00KT
 *   YY   = last 2 digits of year
 *   MM   = 2-digit month
 *   BB   = branch_number (01..26)
 *   II   = platform code (01..05)
 *   00   = reserved
 *   KT   = 4-digit sequential counter per (tenant, YYMM, branch, platform)
 *
 * Example: 2604-0102-0001 = Apr 2026, Ampang (01), Aone (02), ticket #1
 *
 * The counter upsert and ticket insert happen inside the SAME transaction
 * to guarantee atomicity — no PENDING placeholder, no race window.
 */

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { Prisma } from '@prisma/client'

export type PrismaTx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export interface CreateTicketInput {
  tenant_id: string
  branch_id: string
  platform_id: string
  user_id: string
  issue_context: string
  sub_type: string
  fields: Record<string, unknown>
  branch_number: string   // "01".."26"
  platform_code: string   // "01".."05"
}

export async function createTicketWithNumber(
  tx: PrismaTx,
  input: CreateTicketInput,
) {
  const kl = toZonedTime(new Date(), 'Asia/Kuala_Lumpur')
  const period = format(kl, 'yyMM') // e.g. "2604"
  const year = kl.getFullYear()
  const month = kl.getMonth() + 1

  // `day: 0` is the sentinel for a *monthly* ticket counter. Prisma's composite
  // unique key on tkt_counter requires a non-null `day`, so we encode "no day"
  // as 0. Daily counters elsewhere will use 1..31.
  const counter = await tx.tkt_counter.upsert({
    where: {
      tenant_id_platform_id_branch_id_counter_type_year_month_day: {
        tenant_id: input.tenant_id,
        platform_id: input.platform_id,
        branch_id: input.branch_id,
        counter_type: 'ticket',
        year,
        month,
        day: 0,
      },
    },
    create: {
      tenant_id: input.tenant_id,
      platform_id: input.platform_id,
      branch_id: input.branch_id,
      counter_type: 'ticket',
      year,
      month,
      day: 0,
      current_count: 1,
    },
    update: { current_count: { increment: 1 } },
  })

  const seq = String(counter.current_count).padStart(4, '0')
  const ticket_number = `${period}-${input.branch_number}${input.platform_code}-00${seq}`

  const { branch_number: _bn, platform_code: _pc, fields, ...rest } = input

  return tx.tkt_ticket.create({
    data: { ...rest, ticket_number, fields: fields as Prisma.InputJsonValue },
    include: {
      platform: true,
      branch: true,
      submitter: true,
    },
  })
}
