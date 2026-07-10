/**
 * Tenancy-scoped query helper.
 *
 * Every CRM Prisma query that touches tenant data MUST use `scopedPrisma` so
 * that the `tenantId` filter is never accidentally omitted.
 *
 * Usage:
 *   const scope = scopedPrisma(session.tenantId)
 *   const contacts = await prisma.crm_contact.findMany({
 *     where: scope.where({ branchId }),
 *   })
 */

export interface ScopedContext {
  /** The tenant this scope is bound to. */
  readonly tenantId: string

  /**
   * Merge `tenantId` into an arbitrary where-clause object.
   * TypeScript infers the merged shape, so callers get full autocomplete.
   *
   * @param extra  Additional Prisma where conditions.
   * @returns A new object with `tenantId` plus all `extra` fields.
   */
  where<T extends object>(extra: T): T & { tenantId: string }

  /**
   * Return just the `tenantId` field as a where object.
   * Useful when you have no additional conditions.
   */
  whereOnly(): { tenantId: string }

  /**
   * Create data payload with tenantId injected.
   * Handy for `prisma.model.create({ data: scope.data({ ... }) })`.
   */
  data<T extends object>(fields: T): T & { tenantId: string }
}

/**
 * Build a tenant-scoped helper bound to `tenantId`.
 *
 * @throws In development, throws immediately if `tenantId` is falsy so
 *         mistakes are caught at call-site rather than producing subtle
 *         cross-tenant data leaks.
 */
export function scopedPrisma(tenantId: string): ScopedContext {
  if (!tenantId || tenantId.trim() === '') {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(
        '[CRM] tenantId is required for all CRM queries. ' +
          'Ensure the session is resolved before calling scopedPrisma().',
      )
    }
    // In production: surface as a structured error rather than leaking data.
    throw new Error('[CRM] Unauthorized — missing tenant context')
  }

  const tid = tenantId.trim()

  return {
    tenantId: tid,

    where<T extends object>(extra: T): T & { tenantId: string } {
      return { ...extra, tenantId: tid }
    },

    whereOnly(): { tenantId: string } {
      return { tenantId: tid }
    },

    data<T extends object>(fields: T): T & { tenantId: string } {
      return { ...fields, tenantId: tid }
    },
  }
}

export type ScopedPrisma = ReturnType<typeof scopedPrisma>
