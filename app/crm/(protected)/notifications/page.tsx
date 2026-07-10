import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { redirect } from 'next/navigation'
import { NotificationsPageClient } from '@/components/crm/notifications/notifications-page'

export const metadata = { title: 'Notifications — Ebright Nexus' }

export default async function NotificationsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/crm/login')
  return <NotificationsPageClient userId={session.user.id} />
}
