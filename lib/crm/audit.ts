/**
 * PDPA audit logger — writes to the shared `core_audit_log` table.
 *
 * All calls are fire-and-forget: errors are caught and printed to stderr so
 * that an audit failure never breaks the main request flow.
 *
 * Usage:
 *   void logAudit({
 *     tenantId, userId, userEmail,
 *     action: 'CREATE',
 *     entity: 'crm_contact',
 *     entityId: contact.id,
 *     meta: { source: 'api' },
 *   })
 */

import { Prisma } from '@prisma/client'
import { prisma } from './db'

export type AuditAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'IMPORT'
  | 'ASSIGN'
  | 'IMPERSONATE'

export interface AuditParams {
  /** CRM tenant identifier. Optional for system-level events. */
  tenantId?: string
  /** Auth user ID (crm_auth_user.id). */
  userId?: string
  /** Auth user email for quick human-readable lookup. */
  userEmail?: string
  /** The action being performed. */
  action: AuditAction
  /** The Prisma model / resource name (e.g. 'crm_contact'). */
  entity: string
  /** Primary key of the affected record, if applicable. */
  entityId?: string
  /** Arbitrary structured metadata — keep PII minimal. */
  meta?: Record<string, unknown>
  /** Client IP address extracted from the request. */
  ipAddress?: string
  /** Client User-Agent string. */
  userAgent?: string
}

/**
 * Write an audit record to `core_audit_log`.
 * Returns a Promise that always resolves (errors are swallowed after logging).
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.core_audit_log.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        meta: (params.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    })
  } catch (err) {
    // Never throw — audit failure must not interrupt application flow.
    console.error('[CRM][audit] Failed to write audit log:', err, { params })
  }
}

/**
 * Helper: extract the caller's IP from common proxy headers.
 * Use inside API route handlers:  `getClientIp(request.headers)`
 */
export function getClientIp(headers: Headers): string | undefined {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    undefined
  )
}
