'use client'

import { LogOut } from 'lucide-react'
import { signOut as nextAuthSignOut } from 'next-auth/react'
import { authClient } from '@/lib/crm/auth-client'

/**
 * Awaiting-access Sign-out button.
 *
 * Must clear BOTH auth layers in order:
 *   1. Better Auth (CRM-side cookie + DB session row)
 *   2. NextAuth   (HRMS-side JWT cookie) → redirects to /login
 *
 * Previously this was a plain <Link href="/api/auth/signout">, which only
 * hit NextAuth's GET endpoint (which renders a confirmation form, not a
 * real signout) AND left the Better Auth cookie intact. Signing back in as
 * a different user then read the stale Better Auth session via the SSO
 * bridge, making the new login look like the old user.
 */
export function SignOutButton() {
  async function handle() {
    await authClient.signOut().catch(() => {})
    await nextAuthSignOut({ callbackUrl: '/login' })
  }
  return (
    <button
      type="button"
      onClick={handle}
      className="flex-1 py-3 px-4 bg-white/10 border border-white/20 text-white font-semibold rounded-xl text-center hover:bg-white/20 transition-all flex items-center justify-center gap-2"
    >
      <LogOut className="w-4 h-4" />
      Sign out
    </button>
  )
}
