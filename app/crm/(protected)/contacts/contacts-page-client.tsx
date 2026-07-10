'use client'

import { ContactsList } from '@/components/crm/contacts/contacts-list'

interface ContactsPageClientProps {
  branchId: string
  tenantId: string
  currentUserId: string
  stages: Array<{ id: string; name: string; color: string }>
  leadSources: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string | null; email: string; image: string | null }>
  branches: Array<{ id: string; name: string }>
  tags: Array<{ id: string; name: string; color: string }>
  canDelete: boolean
}

export function ContactsPageClient({
  branchId,
  tenantId,
  currentUserId,
  stages,
  leadSources,
  users,
  branches,
  tags,
  canDelete,
}: ContactsPageClientProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page header — title only; count pill lives next to the toolbar */}
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Contacts</h1>
        </div>

        <ContactsList
          branchId={branchId}
          tenantId={tenantId}
          currentUserId={currentUserId}
          stages={stages}
          leadSources={leadSources}
          users={users}
          branches={branches}
          tags={tags}
          canDelete={canDelete}
        />
      </div>
    </div>
  )
}
