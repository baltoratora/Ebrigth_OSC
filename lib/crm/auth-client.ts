/**
 * CRM Better Auth client — used in 'use client' components.
 * Points at /api/crm/auth so it is isolated from the HRMS auth routes.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? `${window.location.origin}/api/crm/auth`
    : 'http://localhost:3000/api/crm/auth',
})
