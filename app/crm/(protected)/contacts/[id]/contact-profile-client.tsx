'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ContactProfile } from '@/components/crm/contacts/contact-profile'

interface ContactProfileClientProps {
  contactId: string
  tenantId: string
  currentUserId: string
}

export function ContactProfileClient({
  contactId,
  tenantId,
  currentUserId,
}: ContactProfileClientProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="text-slate-500 hover:text-slate-700">
            <Link href="/crm/contacts">
              <ChevronLeft className="h-4 w-4" />
              Back to Contacts
            </Link>
          </Button>
        </div>

        <ContactProfile
          contactId={contactId}
          tenantId={tenantId}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  )
}
