import { headers, cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Clock, Mail, LogOut, Undo2 } from 'lucide-react'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { SignOutButton } from './sign-out-button'

// Splash shown when an HRFS user has been auto-provisioned into the CRM but
// has no crm_user_branch row yet — the SSO bridge couldn't auto-link them
// because their HRFS branchName didn't match any CRM branch (or they're a
// non-elevated role for which we deliberately don't auto-link).
//
// Anyone with at least one branch link is bounced back to /crm/dashboard.
// Anyone unauthenticated is sent to /login.
export default async function AwaitingAccessPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user?.id) {
    redirect('/login')
  }

  const link = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (link) {
    redirect('/crm/dashboard')
  }

  const email = session.user.email ?? 'your account'

  // Are we here because a super admin used "Login As" to impersonate a
  // branch-less user? If so the session above is the IMPERSONATED user, and
  // the impersonation cookie is what pins us to this page. A plain sign-out
  // doesn't clear that cookie, so the SSO bridge re-impersonates on the next
  // request and we bounce straight back here — the "sign out loops" report.
  // When impersonating we offer "Return to admin view" (clears only the
  // impersonation cookie → back to the real admin) as the primary action.
  const cookieStore = await cookies()
  const isImpersonating = !!cookieStore.get('crm_preview_user')?.value

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-lg px-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-linear-to-br from-amber-500 to-orange-400 rounded-2xl mb-4 shadow-lg">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Awaiting access</h1>
            <p className="text-blue-200 text-sm">
              Your account has been created, but it isn&apos;t linked to a branch yet.
            </p>
          </div>

          <div className="space-y-4 text-sm text-blue-100">
            <p>
              You&apos;re signed in as <span className="font-semibold text-white">{email}</span>.
              A super admin needs to grant you access to a branch before you can use the CRM.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <p className="font-medium text-white flex items-center gap-2">
                <Mail className="w-4 h-4" />
                What to do next
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-200">
                <li>Contact your branch manager or a super admin.</li>
                <li>Ask them to add you to your branch in the CRM Users page.</li>
                <li>Once linked, refresh this page to continue.</li>
              </ul>
            </div>
          </div>

          {isImpersonating && (
            <div className="mt-6 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              You&apos;re viewing as <span className="font-semibold text-white">{email}</span> via
              &ldquo;Login As&rdquo;, and this account isn&apos;t linked to a branch. Return to your
              own admin view below — signing out here would log you out entirely.
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {isImpersonating ? (
              <>
                {/* GET route: clears only the impersonation cookie, then 302s
                    back to the dashboard as the real (admin) session. */}
                <a
                  href="/api/crm/preview/resume"
                  className="flex-1 py-3 px-4 bg-linear-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl text-center hover:from-blue-600 hover:to-cyan-500 transition-all flex items-center justify-center gap-2"
                >
                  <Undo2 className="w-4 h-4" />
                  Return to admin view
                </a>
                {/* Full sign-out: clears impersonation + auth cookies → /login.
                    Avoids the previous loop where a plain sign-out left the
                    impersonation cookie set and bounced back here. */}
                <a
                  href="/api/crm/preview/exit"
                  className="flex-1 py-3 px-4 bg-white/10 border border-white/20 text-white font-semibold rounded-xl text-center hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </a>
              </>
            ) : (
              <>
                <Link
                  href="/crm/dashboard"
                  className="flex-1 py-3 px-4 bg-linear-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl text-center hover:from-blue-600 hover:to-cyan-500 transition-all"
                >
                  Try again
                </Link>
                <SignOutButton />
              </>
            )}
          </div>

          <div className="mt-8 text-center">
            <p className="text-blue-200/70 text-xs">
              Reference: <span className="font-mono">{session.user.id}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
