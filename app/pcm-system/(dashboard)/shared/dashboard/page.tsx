"use client";

import { useState, useMemo, useEffect } from "react";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { Modal } from "@pcm/_components/shared/Modal";
import {
  Users, CheckCircle2, XCircle, CalendarClock, TrendingUp,
  Calendar, CalendarRange, BadgeCheck, Receipt,
} from "lucide-react";

/** One renewal row from /api/pcm/renewal-details (cash from finance_renewals,
 *  coach resolved by name match — may be blank when no confident match). */
interface RenewalRow {
  docNo: string;
  docDate: string | null;
  branch: string;
  studentName: string;
  studentId: string | null;
  gradeChapter: string | null;
  coachName: string | null;
  package: string | null;
  amount: number;
}
import { BRANCHES, BranchCode, allowedBranchCodes } from "@pcm/_types";
import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, isWithinInterval,
} from "date-fns";

type RangePreset = "thisWeek" | "thisMonth" | "thisYear" | "custom" | "all";

export default function DashboardPage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);
  const students = useFAStore(s => s.students);
  const loadStudents = useFAStore(s => s.loadStudents);
  // Ensure the per-branch student counts are available for the coverage cards
  // (no-op if the store already loaded them on login).
  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Default to "all" so the dashboard isn't accidentally empty when the
  // current month happens to have no events yet. BMs can narrow down with
  // the range buttons.
  const [rangePreset, setRangePreset] = useState<RangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">(
    user?.role === "BM" && user.branch ? user.branch : "all"
  );

  const effectiveBranch: BranchCode | "all" =
    user?.role === "BM" ? (user.branch ?? "all") : branchFilter;
  // Hard region boundary: null = all branches (MKT); RM = only their region.
  const allowedBranches = useMemo(() => allowedBranchCodes(user), [user]);

  // Active date range
  const range = useMemo(() => {
    const now = new Date();
    if (rangePreset === "custom") {
      if (!customStart || !customEnd) return null;
      return { start: parseISO(customStart), end: parseISO(customEnd), label: `${customStart} → ${customEnd}` };
    }
    if (rangePreset === "thisWeek")  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }), label: "This week" };
    if (rangePreset === "thisMonth") return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM yyyy") };
    if (rangePreset === "thisYear")  return { start: startOfYear(now),  end: endOfYear(now),  label: String(now.getFullYear()) };
    return null; // "all"
  }, [rangePreset, customStart, customEnd]);

  const eventsInRange = useMemo(() => {
    if (!range) return events;
    return events.filter(e =>
      isWithinInterval(parseISO(e.startDate), { start: range.start, end: range.end }),
    );
  }, [events, range]);

  const sessionIdsInRange = useMemo(
    () => new Set(sessions.filter(s => eventsInRange.some(e => e.id === s.eventId)).map(s => s.id)),
    [sessions, eventsInRange],
  );

  const filteredInvs = useMemo(() => {
    return invitations.filter(i => {
      if (!sessionIdsInRange.has(i.sessionId)) return false;
      if (allowedBranches && !allowedBranches.includes(i.branch)) return false; // region boundary
      if (effectiveBranch !== "all" && i.branch !== effectiveBranch) return false;
      return true;
    });
  }, [invitations, sessionIdsInRange, effectiveBranch, allowedBranches]);

  const stats = useMemo(() => {
    const invited      = filteredInvs.length;
    const confirmed    = filteredInvs.filter(i => i.status === "confirmed" || i.status === "attended").length;
    const attended     = filteredInvs.filter(i => i.status === "attended").length;
    const absent       = filteredInvs.filter(i => i.status === "no_show" || i.status === "declined").length;
    const rescheduled  = filteredInvs.filter(i => i.status === "rescheduled").length;

    // Payment breakdown — academy wants visibility into who attended AND
    // paid, who attended but hasn't paid yet, and who didn't show.
    const attendedPaid    = filteredInvs.filter(i => i.status === "attended" && i.paid).length;
    const attendedUnpaid  = filteredInvs.filter(i => i.status === "attended" && !i.paid).length;
    const notAttended     = invited - attended;

    const progressInvs = filteredInvs.filter(i => i.inviteType === "progress");
    const renewalInvs  = filteredInvs.filter(i => i.inviteType === "renewal");
    const progressAttended = progressInvs.filter(i => i.status === "attended").length;
    const renewalAttended  = renewalInvs.filter(i => i.status === "attended").length;

    // Attendance rate = attended / invited (the user-specified formula)
    const attendancePct = invited > 0 ? Math.round((attended / invited) * 100) : 0;

    return {
      invited, confirmed, attended, absent, rescheduled,
      attendedPaid, attendedUnpaid, notAttended,
      progressInvited: progressInvs.length,
      progressAttended,
      renewalInvited: renewalInvs.length,
      renewalAttended,
      attendancePct,
    };
  }, [filteredInvs]);

  // Outcome breakdown scope. Paid/Unpaid only applies to RENEWAL students, so
  // "Overall" mixes in Progress attendees (who never pay) — the "PCM Renewal"
  // scope answers the payment question accurately.
  const [outcomeScope, setOutcomeScope] = useState<"overall" | "renewal">("overall");
  const outcomeInvs = useMemo(
    () => outcomeScope === "renewal" ? filteredInvs.filter(i => i.inviteType === "renewal") : filteredInvs,
    [filteredInvs, outcomeScope],
  );

  // ── Renewal cash drill-down ──────────────────────────────────────────────
  // Who renewed (paid), their coach, package and RM — pulled live from
  // finance_renewals (actual invoiced money), filtered by the same branch +
  // date range as the dashboard.
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalData, setRenewalData] =
    useState<{ rows: RenewalRow[]; total: number; packs: number } | null>(null);

  async function openRenewalDetails() {
    setRenewalModalOpen(true);
    setRenewalLoading(true);
    setRenewalData(null);
    const p = new URLSearchParams();
    if (effectiveBranch !== "all") p.set("branch", effectiveBranch);
    if (range) {
      p.set("start", format(range.start, "yyyy-MM-dd"));
      p.set("end", format(range.end, "yyyy-MM-dd"));
    }
    try {
      const res = await fetch(`/api/pcm/renewal-details?${p.toString()}`, { cache: "no-store" });
      const data = res.ok ? await res.json() : { rows: [], total: 0, packs: 0 };
      if (allowedBranches) {
        // RM: keep only their region's rows and recompute totals.
        const rows = (data.rows ?? []).filter((r: { branch: string }) => allowedBranches.includes(r.branch));
        const total = rows.reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0);
        const packs = new Set(rows.map((r: { docNo: string }) => r.docNo)).size;
        setRenewalData({ rows, total, packs });
      } else {
        setRenewalData(data);
      }
    } catch {
      setRenewalData({ rows: [], total: 0, packs: 0 });
    } finally {
      setRenewalLoading(false);
    }
  }
  const outcomeStats = useMemo(() => {
    // Payment is now independent of attendance (a student can pay without
    // attending), so the primary split is Paid vs Unpaid; attendance is shown
    // as a sub-count under each.
    const isAtt = (i: typeof outcomeInvs[number]) => i.status === "attended";
    const paidList   = outcomeInvs.filter(i => i.paid);
    const unpaidList = outcomeInvs.filter(i => !i.paid);
    return {
      invited: outcomeInvs.length,
      paid: paidList.length,
      unpaid: unpaidList.length,
      paidAttended:      paidList.filter(isAtt).length,
      paidNotAttended:   paidList.filter(i => !isAtt(i)).length,
      unpaidAttended:    unpaidList.filter(isAtt).length,
      unpaidNotAttended: unpaidList.filter(i => !isAtt(i)).length,
    };
  }, [outcomeInvs]);

  // Per-(event, branch) breakdown. Each row is one branch within one event.
  // Branches with zero invitations in an event are skipped so the table
  // stays compact. When the page-level branch filter is set, only that
  // branch's rows survive.
  // Per-branch invite-coverage cards. Target ("should invite") = the branch's
  // total students ÷ 12; invited = invitations in the selected period. Respects
  // region (RM) and branch (BM) scope like the rest of the page.
  const branchCards = useMemo(() => {
    const inScope = (code: string) => {
      if (allowedBranches && !allowedBranches.includes(code)) return false;
      if (effectiveBranch !== "all" && code !== effectiveBranch) return false;
      return true;
    };
    return BRANCHES
      .filter(b => inScope(b.code))
      .map(b => {
        const totalStudents = students.filter(s => s.branch === b.code).length;
        const shouldInvite = Math.round(totalStudents / 12);
        const invited = filteredInvs.filter(i => i.branch === b.code).length;
        const pct = shouldInvite > 0 ? Math.round((invited / shouldInvite) * 100) : 0;
        return { code: b.code, name: b.name, totalStudents, shouldInvite, invited, pct };
      })
      // Hide branches with neither students nor invitations so the grid stays tidy.
      .filter(c => c.totalStudents > 0 || c.invited > 0);
  }, [students, filteredInvs, allowedBranches, effectiveBranch]);

  return (
    <AppShell>
      {/* Slimmer hero — keeps a single gradient as the visual anchor */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <TrendingUp className="absolute -right-4 -top-4 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          PCM · Dashboard
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Performance overview</h1>
        <p className="text-white/80 text-sm mt-1.5">
          {range ? range.label : "All events on record"}
          {effectiveBranch !== "all" && <> · Branch {effectiveBranch}</>}
        </p>
      </div>

      {/* Range + branch filter */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-violet-500" />
          <span className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.12em" }}>
            Show
          </span>
          <div className="inline-flex p-1 rounded-lg bg-ivory-100 border border-ivory-300">
            {([
              { id: "thisWeek",  label: "This week"  },
              { id: "thisMonth", label: "This month" },
              { id: "thisYear",  label: "This year"  },
              { id: "custom",    label: "Custom"     },
              { id: "all",       label: "All time"   },
            ] as { id: RangePreset; label: string }[]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRangePreset(opt.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  rangePreset === opt.id
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {rangePreset === "custom" && (
            <div className="flex items-center gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-violet-500" />
              <input
                type="date"
                className="fa-input"
                style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
              <span className="text-xs text-ink-400">→</span>
              <input
                type="date"
                className="fa-input"
                style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={customEnd}
                min={customStart}
                onChange={e => setCustomEnd(e.target.value)}
              />
            </div>
          )}

          {user?.role !== "BM" && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.12em" }}>
                Branch
              </span>
              <select
                className="fa-input text-xs"
                style={{ minWidth: "160px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
              >
                <option value="all">{allowedBranches ? "All my region" : "All branches"}</option>
                {BRANCHES.filter(b => !allowedBranches || allowedBranches.includes(b.code)).map(b => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Big stat cards — quieter palette. Soft tinted background + colored
          accent strip on the left so each card has identity without screaming. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <CalmStatCard label="Invited"     value={stats.invited}     icon={Users}         accent="violet"  />
        <CalmStatCard label="Confirmed"   value={stats.confirmed}   icon={BadgeCheck}    accent="indigo"  />
        <CalmStatCard label="Attended"    value={stats.attended}    icon={CheckCircle2}  accent="emerald" />
        <CalmStatCard label="Absent"      value={stats.absent}      icon={XCircle}       accent="rose"    />
        <CalmStatCard label="Rescheduled" value={stats.rescheduled} icon={CalendarClock} accent="amber"   />
      </div>

      {/* Type split — Progress and Renewal each show "invited · attended" */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <TypeSplitCard
          label="PCM Progress"
          invited={stats.progressInvited}
          attended={stats.progressAttended}
          totalAttended={stats.attended}
          accent="violet"
        />
        <TypeSplitCard
          label="PCM Renewal"
          invited={stats.renewalInvited}
          attended={stats.renewalAttended}
          totalAttended={stats.attended}
          accent="cyan"
          onViewDetails={openRenewalDetails}
        />
      </div>

      <Modal
        open={renewalModalOpen}
        onClose={() => setRenewalModalOpen(false)}
        kicker="PCM Renewal"
        title="Who renewed — coach, package & cash"
        description={`Actual invoiced renewals (from finance) for ${effectiveBranch === "all" ? "all branches" : effectiveBranch}${range ? ` · ${range.label}` : " · all time"}.`}
        size="xl"
      >
        {renewalLoading ? (
          <div className="p-8 text-center text-sm text-ink-400">Loading renewals…</div>
        ) : !renewalData || renewalData.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No renewals found for this branch / period.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-3 text-sm">
              <span className="text-ink-500">Total packs: <strong className="text-ink-900">{renewalData.packs}</strong></span>
              <span className="text-ink-500">Total renewals: <strong className="text-ink-900">RM {renewalData.total.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              <span className="text-ink-400 text-xs">{renewalData.rows.length} student row{renewalData.rows.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-ivory-300">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ivory-100 text-ink-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">Student</th>
                    <th className="text-left px-3 py-2">Coach</th>
                    {effectiveBranch === "all" && <th className="text-left px-3 py-2">Branch</th>}
                    <th className="text-left px-3 py-2">Package</th>
                    <th className="text-right px-3 py-2">Amount (RM)</th>
                    <th className="text-left px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {renewalData.rows.map((r, i) => (
                    <tr key={`${r.docNo}-${i}`} className="border-t border-ivory-200">
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink-900">{r.studentName}</div>
                        <div className="text-[11px] text-ink-400">
                          {r.studentId ? `#${r.studentId}` : "not matched"}{r.gradeChapter ? ` · ${r.gradeChapter}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ink-700">{r.coachName || <span className="text-ink-300">—</span>}</td>
                      {effectiveBranch === "all" && <td className="px-3 py-2 font-mono text-xs text-ink-600">{r.branch}</td>}
                      <td className="px-3 py-2 font-mono text-xs text-ink-700">{r.package || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-ink-900">{r.amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-xs text-ink-500">{r.docDate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              Coach is matched from the student record by name; a blank coach or "not matched" means no confident name match in the student list.
            </p>
          </>
        )}
      </Modal>

      {/* Payment breakdown — Paid vs Unpaid (payment is independent of
          attendance now), with an attended / not-attended sub-count under
          each so academy still sees who showed up. */}
      <PaymentBreakdown
        paid={outcomeStats.paid}
        unpaid={outcomeStats.unpaid}
        paidAttended={outcomeStats.paidAttended}
        paidNotAttended={outcomeStats.paidNotAttended}
        unpaidAttended={outcomeStats.unpaidAttended}
        unpaidNotAttended={outcomeStats.unpaidNotAttended}
        totalInvited={outcomeStats.invited}
        scope={outcomeScope}
        onScopeChange={setOutcomeScope}
      />

      {/* Per-student list of who fell into which bucket. Useful for chasing
          up unpaid attendees and re-inviting the no-shows. Respects the same
          Overall / PCM Renewal scope toggle. */}
      <OutcomeStudentLists invitations={outcomeInvs} />

      {/* Attendance rate = attended / invited. Single calmer gradient card. */}
      <div className="rounded-2xl shadow-sm mb-6 border border-violet-200 bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-violet-100 to-indigo-100 px-5 py-2 border-b border-violet-200">
          <div className="fa-mono text-[10px] uppercase text-violet-700 font-bold" style={{ letterSpacing: "0.14em" }}>
            Attendance rate
          </div>
        </div>
        <div className="p-6 flex items-center gap-6 flex-wrap">
          <div className="text-6xl font-black text-violet-700 leading-none">{stats.attendancePct}%</div>
          <div className="text-sm text-ink-500">
            <strong className="text-ink-900">{stats.attended}</strong> attended /
            <strong className="text-ink-900 ml-1">{stats.invited}</strong> invited
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="w-full h-2.5 bg-ivory-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                style={{ width: `${stats.attendancePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Invite coverage by branch — card grid. Each card: total students,
          target ("should invite" = total ÷ 12), and invited this period. */}
      <div className="rounded-2xl bg-white shadow-sm border border-ivory-300 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-3 flex items-center justify-between border-b border-ivory-300">
          <h2 className="text-base font-semibold text-violet-900">Invite coverage by branch</h2>
          <span className="text-xs text-ink-500">
            Target = total students ÷ 12 · {branchCards.length} branch{branchCards.length !== 1 ? "es" : ""}
          </span>
        </div>
        {branchCards.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No branch data for this range.
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {branchCards.map(c => {
              const met = c.shouldInvite > 0 && c.invited >= c.shouldInvite;
              const tone = met ? "emerald" : c.pct >= 50 ? "amber" : "rose";
              const head =
                tone === "emerald" ? "from-emerald-500 to-emerald-600"
                : tone === "amber" ? "from-amber-500 to-amber-600"
                : "from-rose-500 to-rose-600";
              const bar =
                tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-rose-500";
              const barPct = Math.min(100, c.pct);
              return (
                <div key={c.code} className="rounded-xl border border-ivory-300 shadow-sm overflow-hidden bg-white">
                  <div className={`bg-gradient-to-r ${head} px-3 py-2 flex items-center justify-between`}>
                    <span className="fa-mono text-xs font-bold uppercase text-white" style={{ letterSpacing: "0.08em" }} title={c.name}>
                      {c.code}
                    </span>
                    <span className="text-[11px] font-bold text-white/90">{c.pct}%</span>
                  </div>
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-ink-900 leading-none">{c.invited}</span>
                      <span className="text-base text-ink-300 font-semibold leading-none">/ {c.shouldInvite}</span>
                    </div>
                    <div className="fa-mono text-[9px] uppercase text-ink-400 mt-1" style={{ letterSpacing: "0.1em" }}>
                      Invited / Target
                    </div>
                    <div className="w-full h-2 bg-ivory-200 rounded-full overflow-hidden mt-2">
                      <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t border-ivory-200">
                    <div className="px-3 py-2 text-center border-r border-ivory-200">
                      <div className="text-lg font-bold text-ink-900 leading-none">{c.totalStudents}</div>
                      <div className="fa-mono text-[9px] uppercase text-ink-400 mt-1" style={{ letterSpacing: "0.08em" }}>
                        Total students
                      </div>
                    </div>
                    <div className="px-3 py-2 text-center">
                      <div className="text-lg font-bold text-violet-700 leading-none">{c.shouldInvite}</div>
                      <div className="fa-mono text-[9px] uppercase text-ink-400 mt-1" style={{ letterSpacing: "0.08em" }}>
                        Should invite
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Card primitives ────────────────────────────────────────────────────

type Accent = "violet" | "indigo" | "emerald" | "rose" | "amber" | "cyan";

const ACCENTS: Record<Accent, { strip: string; text: string; bg: string; iconBg: string }> = {
  violet:  { strip: "bg-violet-500",  text: "text-violet-700",  bg: "bg-violet-50/60",  iconBg: "bg-violet-100  text-violet-600"  },
  indigo:  { strip: "bg-indigo-500",  text: "text-indigo-700",  bg: "bg-indigo-50/60",  iconBg: "bg-indigo-100  text-indigo-600"  },
  emerald: { strip: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50/60", iconBg: "bg-emerald-100 text-emerald-600" },
  rose:    { strip: "bg-rose-500",    text: "text-rose-700",    bg: "bg-rose-50/60",    iconBg: "bg-rose-100    text-rose-600"    },
  amber:   { strip: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50/60",   iconBg: "bg-amber-100   text-amber-600"   },
  cyan:    { strip: "bg-cyan-500",    text: "text-cyan-700",    bg: "bg-cyan-50/60",    iconBg: "bg-cyan-100    text-cyan-600"    },
};

function CalmStatCard({
  label, value, icon: Icon, accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className={`relative rounded-xl ${a.bg} border border-ivory-300 shadow-sm p-4 overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.strip}`} aria-hidden="true" />
      <div className="flex items-start justify-between pl-2">
        <div
          className={`fa-mono text-[10px] uppercase ${a.text} font-bold`}
          style={{ letterSpacing: "0.14em" }}
        >
          {label}
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.iconBg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-3xl font-black text-ink-900 mt-2 pl-2">{value}</div>
    </div>
  );
}

function TypeSplitCard({
  label, invited, attended, totalAttended, accent, onViewDetails,
}: {
  label: string;
  invited: number;
  attended: number;
  totalAttended: number;
  accent: Accent;
  onViewDetails?: () => void;
}) {
  // Two ratios surfaced for the BM:
  //   • internal: this type's attendance rate  (attended / invited)
  //   • of total attended: what share of overall attendance came from this type
  const internalPct = invited > 0 ? Math.round((attended / invited) * 100) : 0;
  const shareOfAttended = totalAttended > 0 ? Math.round((attended / totalAttended) * 100) : 0;
  const a = ACCENTS[accent];
  return (
    <div className={`relative rounded-xl ${a.bg} border border-ivory-300 shadow-sm overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.strip}`} aria-hidden="true" />
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-base font-bold ${a.text}`}>{label}</h3>
          <div className="flex items-center gap-2">
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                className={`inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-0.5 text-[10px] font-semibold ${a.text} hover:bg-white/60 transition-colors`}
                title="See who renewed, their coach, package and RM paid"
              >
                <Receipt className="w-3 h-3" /> View renewals
              </button>
            )}
            <span className={`fa-mono text-[10px] font-bold ${a.text}`} style={{ letterSpacing: "0.06em" }}>
              {internalPct}%
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-black text-ink-900">{invited}</span>
          <span className="text-sm text-ink-500">invited</span>
          <span className="text-ink-300 mx-1">·</span>
          <span className="text-2xl font-bold text-ink-900">{attended}</span>
          <span className="text-sm text-ink-500">attended</span>
        </div>
        <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-ivory-300">
          <div
            className={`h-full ${a.strip} rounded-full transition-all`}
            style={{ width: `${internalPct}%` }}
          />
        </div>
        <div className="text-[11px] text-ink-500 mt-2">
          {shareOfAttended}% of total attended is {label.replace("PCM ", "")}
        </div>
      </div>
    </div>
  );
}

/**
 * Payment breakdown — Paid vs Unpaid (payment is independent of attendance
 * now). A two-segment stacked bar (Paid green / Unpaid rose) plus two cards,
 * each carrying an attended / not-attended sub-count so attendance stays
 * visible without tying it to payment.
 */
function PaymentBreakdown({
  paid, unpaid, paidAttended, paidNotAttended, unpaidAttended, unpaidNotAttended,
  totalInvited, scope, onScopeChange,
}: {
  paid: number;
  unpaid: number;
  paidAttended: number;
  paidNotAttended: number;
  unpaidAttended: number;
  unpaidNotAttended: number;
  totalInvited: number;
  scope: "overall" | "renewal";
  onScopeChange: (s: "overall" | "renewal") => void;
}) {
  const pct = (n: number) => (totalInvited > 0 ? Math.round((n / totalInvited) * 100) : 0);
  const paidPct   = pct(paid);
  const unpaidPct = pct(unpaid);

  return (
    <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h3 className="fa-display text-base text-ink-900">Outcome breakdown</h3>
          {/* Overall vs PCM Renewal — paid/unpaid is only meaningful for renewals */}
          <div className="inline-flex rounded-lg border border-ivory-300 overflow-hidden text-[11px] font-semibold">
            {(["overall", "renewal"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onScopeChange(s)}
                className={`px-3 py-1 transition-colors ${
                  scope === s ? "bg-violet-600 text-white" : "bg-white text-ink-500 hover:bg-ivory-100"
                }`}
              >
                {s === "overall" ? "Overall" : "PCM Renewal"}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-ink-500">
          across {totalInvited} {scope === "renewal" ? "renewal" : "invited"} student{totalInvited !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Stacked bar */}
      <div
        className="w-full h-4 rounded-full overflow-hidden flex bg-ivory-100 border border-ivory-300 mb-3"
        role="img"
        aria-label={`Paid ${paid}, unpaid ${unpaid}`}
      >
        {paid > 0 && (
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${paidPct}%` }}
            title={`Paid: ${paid} (${paidPct}%)`}
          />
        )}
        {unpaid > 0 && (
          <div
            className="h-full bg-rose-400"
            style={{ width: `${unpaidPct}%` }}
            title={`Unpaid: ${unpaid} (${unpaidPct}%)`}
          />
        )}
      </div>

      {/* Two cards — payment split, attendance shown as a sub-count on each */}
      <div className="grid grid-cols-2 gap-3">
        <BucketCard
          label="Paid"
          value={paid}
          pct={paidPct}
          accentBg="bg-emerald-50"
          accentBorder="border-emerald-200"
          accentText="text-emerald-700"
          accentDot="bg-emerald-500"
          sub={`${paidAttended} attended · ${paidNotAttended} not attended`}
        />
        <BucketCard
          label="Unpaid"
          value={unpaid}
          pct={unpaidPct}
          accentBg="bg-rose-50"
          accentBorder="border-rose-200"
          accentText="text-rose-700"
          accentDot="bg-rose-400"
          sub={`${unpaidAttended} attended · ${unpaidNotAttended} not attended`}
        />
      </div>
    </div>
  );
}

function BucketCard({
  label, value, pct, accentBg, accentBorder, accentText, accentDot, sub,
}: {
  label: string; value: number; pct: number;
  accentBg: string; accentBorder: string; accentText: string; accentDot: string;
  sub?: string;
}) {
  return (
    <div className={`rounded-xl ${accentBg} ${accentBorder} border p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${accentDot}`} aria-hidden="true" />
        <span
          className={`fa-mono text-[10px] uppercase ${accentText} font-bold`}
          style={{ letterSpacing: "0.1em" }}
        >
          {label}
        </span>
      </div>
      <div className="text-3xl font-black text-ink-900 leading-none">{value}</div>
      <div className="text-[11px] text-ink-500 mt-1">{pct}% of invited</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">└ {sub}</div>}
    </div>
  );
}

/**
 * Three side-by-side lists naming the students in each outcome bucket.
 * Sits below the stacked breakdown bar and complements its numbers with
 * actionable names — academy wants to chase up the unpaid attendees and
 * re-invite the no-shows.
 *
 * The page already computed `filteredInvs` (event range + branch filter
 * applied), so this component just buckets them and renders.
 */
function OutcomeStudentLists({ invitations }: { invitations: import("@pcm/_types").Invitation[] }) {
  const students = useFAStore(s => s.students);
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);

  // Small lookups so the row rendering stays cheap regardless of how
  // many invitations are in the bucket.
  const studentsById = useMemo(() => {
    const m = new Map<string, import("@pcm/_types").Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);
  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) m.set(e.id, e.name);
    return m;
  }, [events]);
  const sessionLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) m.set(s.id, `D${s.dayNumber}·S${s.sessionNumber} ${s.startTime}`);
    return m;
  }, [sessions]);

  const paid   = invitations.filter(i => i.paid);
  const unpaid = invitations.filter(i => !i.paid);

  function rowOf(inv: import("@pcm/_types").Invitation) {
    const student = studentsById.get(inv.studentId);
    return {
      key: inv.id,
      // Live record name → name resolved server-side (snapshot / archived) → id.
      name: student?.name ?? inv.studentName ?? `#${inv.studentId}`,
      branch: inv.branch,
      grade: inv.targetGrade || student?.grade || "?",
      eventName: eventNameById.get(inv.eventId) ?? "—",
      sessionLabel: sessionLabel.get(inv.sessionId) ?? "—",
      attended: inv.status === "attended",
    };
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
      <OutcomeBucket
        title="Paid"
        rows={paid.map(rowOf)}
        accentBg="bg-emerald-50"
        accentBorder="border-emerald-200"
        accentText="text-emerald-700"
      />
      <OutcomeBucket
        title="Unpaid"
        rows={unpaid.map(rowOf)}
        accentBg="bg-rose-50"
        accentBorder="border-rose-200"
        accentText="text-rose-700"
      />
    </div>
  );
}

function OutcomeBucket({
  title, rows, accentBg, accentBorder, accentText,
}: {
  title: string;
  rows: Array<{ key: string; name: string; branch: string; grade: number | string; eventName: string; sessionLabel: string; attended: boolean }>;
  accentBg: string; accentBorder: string; accentText: string;
}) {
  return (
    <div className={`rounded-xl ${accentBg} ${accentBorder} border overflow-hidden flex flex-col`} style={{ minHeight: 200 }}>
      <div className="px-4 py-2 border-b border-ivory-300 flex items-center justify-between">
        <span
          className={`fa-mono text-[10px] uppercase ${accentText} font-bold`}
          style={{ letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <span className={`fa-mono text-[11px] ${accentText} font-bold`}>{rows.length}</span>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2 space-y-1.5 flex-1">
        {rows.length === 0 ? (
          <div className="p-3 text-center text-xs text-ink-400 italic">No students in this bucket.</div>
        ) : (
          rows.map(r => (
            <div
              key={r.key}
              className="px-2.5 py-1.5 rounded bg-white border border-ivory-300 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink-900 truncate">{r.name}</span>
                <span className="fa-mono text-[10px] font-bold text-ink-500 flex-shrink-0">
                  {r.branch} · G{r.grade}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[10px] text-ink-500 truncate">
                  {r.eventName} · {r.sessionLabel}
                </span>
                <span
                  className={`fa-mono text-[9px] uppercase font-bold flex-shrink-0 px-1.5 py-0.5 rounded ${
                    r.attended ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"
                  }`}
                  style={{ letterSpacing: "0.06em" }}
                >
                  {r.attended ? "Attended" : "Not attended"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
