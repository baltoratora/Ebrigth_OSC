import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import CrmLoginClient from './login-client'

export default async function CrmLoginPage() {
  const cookieStore = await cookies()
  const exitingPreview = cookieStore.get('crm_preview_exit')?.value === '1'

  // Skip login in preview mode UNLESS the user explicitly exited preview
  if (process.env.CRM_PREVIEW_MODE === 'true' && !exitingPreview) {
    redirect('/crm/dashboard')
  }

  // If already authenticated, skip to dashboard
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    redirect('/crm/dashboard')
  }

  return <CrmLoginClient />
}
