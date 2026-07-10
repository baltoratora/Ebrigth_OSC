import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin, User, Tag, Clock, ArrowRight, ArrowRightLeft, Plus, GraduationCap, Users } from 'lucide-react'
import { format } from 'date-fns'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { getOpportunityById } from '@/server/queries/opportunities'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { getAgeCategory, ageCategoryClasses, formatChildAge, type AgeCategory } from '@/lib/crm/age-category'
import { StudentEditCard } from '@/components/crm/opportunities/student-edit-card'
import { NotesPanel, type NotePanelEntry } from '@/components/crm/opportunities/notes-panel'
import { LeadTransferPanel } from '@/components/crm/opportunities/lead-transfer-panel'

export const metadata = {
  title: 'Lead Detail | Ebright Nexus',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/crm/awaiting-access')

  const opp = await getOpportunityById(access.tenantId, id)
  if (!opp) notFound()

  // Branch-scope guard: non-elevated users can only view leads in their branches.
  if (!access.elevated && !access.branchIds.includes(opp.branchId)) {
    notFound()
  }

  const branch = await prisma.crm_branch.findUnique({
    where: { id: opp.branchId },
    select: { name: true },
  })

  const contact = opp.contact
  const childOwnName = `${contact.firstName} ${contact.lastName ?? ''}`.trim() || '(No name)'

  // With master_leads_base as source of truth, the contact's first/last name
  // IS the child when parentFullName is set (sibling-exploded row), or IS the
  // parent themself otherwise. childAge1 holds the child's age in both flows.
  type CExt = typeof contact & {
    parentFullName:     string | null
    campaignName:       string | null
    childName1:         string | null
    childAge1:          string | null
    externalSourceTable: string | null
    externalSourceId:    string | null
    appointments?:      Array<{ id: string; startAt: Date }>
  }
  const cExt = contact as CExt
  // Gated to RSD / CT / SU / SG — same rule the kanban card + modal use.
  // Anything past SU or that never reached CT hides the timeslot pill
  // because the appointment is no longer an "active" datum.
  const TIMESLOT_VISIBLE_STAGES = new Set(['RSD', 'CT', 'SU', 'SG'])
  const normalizedStageCode = (opp.stage.shortCode ?? '').toUpperCase().replace(/_/g, '')
  const stageAllowsTimeslot = TIMESLOT_VISIBLE_STAGES.has(normalizedStageCode)
  const trialAppointment = stageAllowsTimeslot ? (cExt.appointments?.[0] ?? null) : null
  const isChild = !!cExt.parentFullName
  const parentDisplay = isChild ? (cExt.parentFullName ?? '—') : childOwnName
  const studentName = isChild
    ? childOwnName
    : (cExt.childName1?.trim() || childOwnName)
  const studentAge  = cExt.childAge1?.trim() || null
  const studentLevel: AgeCategory | null = getAgeCategory(studentAge)

  // Related leads — any other contact in the same tenant whose parent contact
  // info matches this one (shared phone, shared email, or shared
  // externalSourceId UUID prefix). Older Wix imports used "<uuid>#<idx>" so
  // the prefix match still catches those; the new dash format imports get
  // matched by phone/email instead. The OR keeps it robust across whichever
  // path the rows came in from.
  let siblings: Array<{
    id: string
    name: string
    age: string | null
    level: AgeCategory | null
    opportunityId: string | null
    stageCode: string | null
  }> = []

  const idPrefixMatch =
    cExt.externalSourceTable &&
    cExt.externalSourceId?.includes('#')
      ? {
          externalSourceTable: cExt.externalSourceTable,
          externalSourceId:    { startsWith: `${cExt.externalSourceId.split('#')[0]}#` },
        }
      : null

  // Build the OR clauses — phone and email lookups are skipped when the
  // contact's value is null/blank so we don't match every other contact
  // with a NULL phone (~ a lot of false positives).
  const orClauses: Array<Record<string, unknown>> = []
  if (contact.phone && contact.phone.trim()) orClauses.push({ phone: contact.phone })
  if (contact.email && contact.email.trim()) orClauses.push({ email: contact.email })
  if (idPrefixMatch) orClauses.push(idPrefixMatch)

  if (orClauses.length > 0) {
    const rows = await prisma.crm_contact.findMany({
      where: {
        tenantId: access.tenantId,
        id: { not: contact.id },
        deletedAt: null,
        OR: orClauses,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        childAge1: true,
        parentFullName: true,
        opportunities: {
          where: { deletedAt: null },
          select: { id: true, stage: { select: { shortCode: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    siblings = rows.map((r) => {
      // When the contact came in pre-sibling-explode (firstName actually
      // holds the parent's name), surface that as the row label — at least
      // the link is useful even if the name reads as the parent's.
      const displayName = `${r.firstName} ${r.lastName ?? ''}`.trim()
      const age = r.childAge1?.trim() || null
      const opportunity = r.opportunities[0] ?? null
      return {
        id: r.id,
        name: displayName,
        age,
        level: getAgeCategory(age),
        opportunityId: opportunity?.id ?? null,
        stageCode: opportunity?.stage?.shortCode ?? null,
      }
    })
  }

  // Branch transfer state — transfer history + the dropdown of accessible
  // target branches for the panel at the bottom of the page. Elevated users
  // (super/agency/regional admins) see every branch; everyone else sees the
  // branches their crm_user_branch links grant them.
  const transfers = await prisma.crm_lead_transfer.findMany({
    where:  { tenantId: access.tenantId, opportunityId: opp.id },
    orderBy: { transferredAt: 'asc' },
    select: {
      id:            true,
      reason:        true,
      transferredAt: true,
      fromBranch:    { select: { id: true, name: true } },
      toBranch:      { select: { id: true, name: true } },
      transferredBy: { select: { name: true, email: true } },
    },
  })

  const transferableBranches = await prisma.crm_branch.findMany({
    where: { tenantId: access.tenantId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  // Build the timeline. Source events:
  //   - Opportunity creation (from opp.createdAt)
  //   - Each stage history row
  // Sorted DESC so the newest event appears at the top, GHL-style.
  type TimelineEvent =
    | { kind: 'created'; at: Date; toStage: string; toCode: string }
    | { kind: 'moved'; at: Date; fromStage: string | null; fromCode: string | null; toStage: string; toCode: string; by: string | null; note: string | null }

  const events: TimelineEvent[] = []
  events.push({
    kind: 'created',
    at: opp.createdAt,
    toStage: opp.stage.name,
    toCode: opp.stage.shortCode,
  })
  for (const h of opp.stageHistory) {
    events.push({
      kind: 'moved',
      at: h.changedAt,
      fromStage: h.fromStage?.name ?? null,
      fromCode: h.fromStage?.shortCode ?? null,
      toStage: h.toStage.name,
      toCode: h.toStage.shortCode,
      by: h.changedByUser?.name ?? h.changedByUser?.email ?? null,
      note: h.note ?? null,
    })
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime())

  // Group events by calendar day for date dividers in the feed.
  const groupedByDay = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const key = format(e.at, 'yyyy-MM-dd')
    const list = groupedByDay.get(key) ?? []
    list.push(e)
    groupedByDay.set(key, list)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* Back link */}
      <Link
        href="/crm/opportunities"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" /> Back to opportunities
      </Link>

      {/* Header */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                {studentName}
              </h1>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                {opp.stage.shortCode}
              </span>
            </div>
            {isChild && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Parent: <span className="text-slate-700 dark:text-slate-200">{cExt.parentFullName}</span>
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stage: <span className="text-slate-700 dark:text-slate-200">{opp.stage.name}</span>
              {' · '}
              Pipeline: <span className="text-slate-700 dark:text-slate-200">{opp.pipeline.name}</span>
            </p>
            {/* Trial timeslot pill — surfaced as soon as the lead has a
                booked Trial Class appointment (i.e. after a CT move). */}
            {trialAppointment && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <Clock className="h-3.5 w-3.5" />
                Trial:{' '}
                {new Date(trialAppointment.startAt).toLocaleDateString('en-GB', {
                  weekday:  'short',
                  day:      '2-digit',
                  month:    'short',
                  year:     'numeric',
                  // crm_appointment.startAt is stored as "naive-KL-as-UTC"
                  // — its UTC fields ARE KL wall-clock fields. Force UTC
                  // formatting so the display doesn't get double-shifted on
                  // a browser or server outside the UTC zone.
                  timeZone: 'UTC',
                })}
                {' @ '}
                {new Date(trialAppointment.startAt).toLocaleTimeString('en-GB', {
                  hour:     '2-digit',
                  minute:   '2-digit',
                  timeZone: 'UTC',
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left rail — contact + opportunity facts */}
        <aside className="space-y-4">
          {/* Editable Student & Parent card — BMs / super-admins can correct
              misimported leads (parent-name-shown-as-student-name, missing
              age, etc.). Sibling-explode bugs end up here in production. */}
          <StudentEditCard
            contactId={contact.id}
            initial={{
              firstName:      contact.firstName,
              lastName:       contact.lastName,
              childAge1:      cExt.childAge1,
              parentFullName: cExt.parentFullName,
            }}
            isChild={isChild}
          />

          {/* Student — name, age, and the Junior/Mid/Senior level pill.
              Kept read-only because the StudentEditCard above is the single
              source of edit truth; this section just adds the Level pill
              that doesn't fit the compact editor. */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Student details
            </h3>
            <div className="space-y-2 text-sm">
              <Row icon={<GraduationCap className="h-3.5 w-3.5" />} label="Name" value={studentName} />
              <Row icon={<User className="h-3.5 w-3.5" />} label="Age" value={studentAge ? formatChildAge(studentAge) : '—'} />
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-slate-400"><GraduationCap className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Level</p>
                  {studentLevel ? (
                    <span
                      title={studentLevel}
                      className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${ageCategoryClasses(studentLevel)}`}
                    >
                      {studentLevel[0]}
                    </span>
                  ) : (
                    <p className="text-slate-700 dark:text-slate-200">—</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contact
            </h3>
            <div className="space-y-2 text-sm">
              <Row icon={<User className="h-3.5 w-3.5" />}    label="Parent" value={parentDisplay} />
              <Row icon={<Mail className="h-3.5 w-3.5" />}    label="Email"  value={contact.email ?? '—'} />
              <Row icon={<Phone className="h-3.5 w-3.5" />}   label="Phone"  value={contact.phone ?? '—'} />
              <Row
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Branch"
                value={
                  // Leads routed to "Ebright Marketing" arrived with no
                  // resolvable branch in the source data — display Unknown
                  // so the Marketing team knows to triage + transfer the
                  // lead to the correct branch via the panel below.
                  branch?.name === 'Ebright Marketing'
                    ? 'Unknown'
                    : (branch?.name ?? '—')
                }
              />
              {contact.leadSource && (
                <Row icon={<Tag className="h-3.5 w-3.5" />}   label="Source" value={contact.leadSource.name} />
              )}
              <Row icon={<Tag className="h-3.5 w-3.5" />}     label="Campaign" value={cExt.campaignName || '-'} />
            </div>
          </section>

          {opp.assignedUser && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Owner
              </h3>
              <div className="text-sm text-slate-700 dark:text-slate-200">
                {opp.assignedUser.name ?? opp.assignedUser.email}
              </div>
            </section>
          )}

          {contact.contactTags.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.contactTags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Transfer history — surfaces every cross-branch move so the BM
              can see where this lead has been routed and why. Hidden when
              no transfers have happened. */}
          {transfers.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <ArrowRightLeft className="h-3 w-3" /> Transfer History ({transfers.length}/3)
              </h3>
              <ul className="space-y-2.5">
                {transfers.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <span className="truncate">{t.fromBranch.name}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="truncate">{t.toBranch.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] italic text-slate-600 dark:text-slate-300">
                      &ldquo;{t.reason}&rdquo;
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {format(t.transferredAt, 'd MMM yyyy, HH:mm')}
                      {t.transferredBy && (
                        <> &middot; by {t.transferredBy.name ?? t.transferredBy.email}</>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Related leads — every other lead in the tenant that shares the
              parent's contact info (phone / email) or comes from the same
              raw submission (legacy "<uuid>#<idx>" externalSourceId pattern).
              Rows without an active opportunity render disabled but stay
              visible so the BM can see the full sibling family. */}
          {siblings.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Users className="h-3 w-3" /> Related Leads ({siblings.length})
              </h3>
              <ul className="space-y-2">
                {siblings.map((s) => {
                  const inner = (
                    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-indigo-50 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {(s.name[0] ?? '?').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{s.name || '(No name)'}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {s.age ? formatChildAge(s.age) : '—'}
                        </p>
                      </div>
                      {s.level && (
                        <span
                          title={s.level}
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ageCategoryClasses(s.level)}`}
                        >
                          {s.level[0]}
                        </span>
                      )}
                      {s.stageCode && (
                        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {s.stageCode}
                        </span>
                      )}
                    </div>
                  )
                  return (
                    <li key={s.id}>
                      {s.opportunityId ? (
                        <Link href={`/crm/opportunities/${s.opportunityId}`} className="block">
                          {inner}
                        </Link>
                      ) : (
                        // No active opportunity → render disabled visual but keep the row visible.
                        <div className="opacity-60 cursor-not-allowed" title="No active opportunity for this sibling">
                          {inner}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </aside>

        {/* Right column — Notes + Activity timeline */}
        <div className="space-y-4">
          <NotesPanel
            contactId={contact.id}
            initial={
              ((contact as unknown as { notes?: NotePanelEntry[] }).notes ?? []) as NotePanelEntry[]
            }
          />

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <Clock className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Activity
            </h2>
            <span className="ml-auto text-xs text-slate-400">{events.length} event{events.length === 1 ? '' : 's'}</span>
          </header>

          <div className="max-h-[70vh] overflow-y-auto">
            {Array.from(groupedByDay.entries()).map(([day, list]) => (
              <div key={day}>
                {/* Date divider */}
                <div className="sticky top-0 z-10 flex items-center justify-center bg-slate-50 px-5 py-2 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm dark:bg-slate-900">
                    {format(new Date(day), 'MMM d, yyyy')}
                  </span>
                </div>

                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((e, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          e.kind === 'created'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                        }`}
                      >
                        {e.kind === 'created' ? <Plus className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        {e.kind === 'created' ? (
                          <p className="text-slate-700 dark:text-slate-200">
                            <span className="font-semibold">Lead created</span> in stage{' '}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {e.toCode}
                            </span>
                          </p>
                        ) : (
                          <p className="text-slate-700 dark:text-slate-200">
                            <span className="font-semibold">Stage moved</span> from{' '}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {e.fromCode ?? '—'}
                            </span>{' '}
                            <ArrowRight className="inline h-3 w-3 text-slate-400" />{' '}
                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                              {e.toCode}
                            </span>
                            {e.by && <span className="text-xs text-slate-500"> by {e.by}</span>}
                          </p>
                        )}
                        {e.kind === 'moved' && e.note && (
                          <p className="mt-0.5 text-xs italic text-slate-500 dark:text-slate-400">
                            “{e.note}”
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {format(e.at, 'HH:mm')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {events.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No activity yet.</p>
            )}
          </div>
        </section>

        <LeadTransferPanel
          opportunityId={opp.id}
          currentBranchId={opp.branchId}
          transferCount={transfers.length}
          branches={transferableBranches}
        />
        </div>
      </div>
    </div>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className="truncate text-slate-700 dark:text-slate-200">{value}</p>
      </div>
    </div>
  )
}
