/**
 * Better Auth handler for all CRM auth routes.
 * Mounted at /api/crm/auth/* — handles GET and POST requests
 * (sign-in, sign-up, session, sign-out, etc.)
 */
import { auth } from '@/lib/crm/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
