import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { redirect } from 'next/navigation'
import { AutomationsListClient } from '@/components/crm/automations/automations-list'

export const metadata = { title: 'Automations — Ebright Nexus' }

export default async function AutomationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/crm/login')
  return <AutomationsListClient userId={session.user.id} />
}
