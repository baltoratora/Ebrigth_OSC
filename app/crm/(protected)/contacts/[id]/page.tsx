import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getContactById } from '@/server/queries/contacts'
import { logAudit } from '@/lib/crm/audit'
import { ContactProfileClient } from './contact-profile-client'

export const dynamic = 'force-dynamic'

interface ContactPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ContactPageProps) {
  const { id } = await params
  // Minimal metadata — title resolved client-side after data loads
  return { title: `Contact — Ebright Nexus` }
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/crm/login')

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  if (!userBranch) redirect('/crm/login')

  const tenantId = userBranch.tenantId

  // Verify contact exists and belongs to tenant
  const contact = await getContactById(tenantId, id)
  if (!contact) notFound()

  // PDPA audit log — log READ access on server side
  void logAudit({
    tenantId,
    userId: session.user.id,
    userEmail: session.user.email ?? '',
    action: 'READ',
    entity: 'crm_contact',
    entityId: id,
    meta: { source: 'contact_profile_page' },
  })

  return (
    <ContactProfileClient
      contactId={id}
      tenantId={tenantId}
      currentUserId={session.user.id}
    />
  )
}
