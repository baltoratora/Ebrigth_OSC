import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { redirect } from 'next/navigation'
import { AutomationEditor } from '@/components/crm/automations/automation-editor'

export const metadata = { title: 'Automation Editor — Ebright Nexus' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function AutomationEditorPage({ params }: Props) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/crm/login')
  const { id } = await params
  return <AutomationEditor automationId={id === 'new' ? null : id} userId={session.user.id} />
}
