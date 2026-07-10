"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import { ArrowLeft, CalendarDays, MapPin, Users, Info } from "lucide-react";
import { addDays, format } from "date-fns";

import { MONTHS } from "@fa/_lib/constants";

export default function NewEventPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const createEvent = useFAStore(s => s.createEvent);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    name: "",
    venue: "",
    startDate: "",
    endDate: "",
    numberOfDays: 2 as 1 | 2 | 3,
    invitationOpenDate: "",
    invitationCloseDate: "",
    notes: "",
  });

  const [error, setError] = useState<string | null>(null);

  if (!user || user.role !== "MKT") return null;

  // Derived — month/year from start date
  const startD = form.startDate ? new Date(form.startDate) : null;
  const month = startD ? startD.getMonth() + 1 : 0;
  const year = startD ? startD.getFullYear() : 0;

  // Auto-suggest event name when start date changes
  function handleStartDateChange(v: string) {
    const d = new Date(v);
    const autoName = `${MONTHS[d.getMonth()]} ${d.getFullYear()} Foundation Appraisal`;
    setForm(f => ({
      ...f,
      startDate: v,
      name: f.name || autoName,
      // auto-adjust endDate based on numberOfDays
      endDate: f.numberOfDays === 1
        ? v
        : format(addDays(d, f.numberOfDays - 1), "yyyy-MM-dd"),
    }));
  }

  function handleDaysChange(n: 1 | 2 | 3) {
    setForm(f => {
      let endDate = f.endDate;
      if (f.startDate) {
        const d = new Date(f.startDate);
        endDate = format(addDays(d, n - 1), "yyyy-MM-dd");
      }
      return { ...f, numberOfDays: n, endDate };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (!form.name.trim())       return setError("Event name is required.");
    if (!form.venue.trim())      return setError("Venue is required.");
    if (!form.startDate)         return setError("Start date is required.");
    if (!form.endDate)           return setError("End date is required.");
    if (!form.invitationOpenDate)  return setError("Invitation open date is required.");
    if (!form.invitationCloseDate) return setError("Invitation close date is required.");

    if (new Date(form.endDate) < new Date(form.startDate)) {
      return setError("End date must be on or after start date.");
    }
    if (new Date(form.invitationCloseDate) < new Date(form.invitationOpenDate)) {
      return setError("Invitation close date must be after open date.");
    }
    if (new Date(form.invitationCloseDate) > new Date(form.startDate)) {
      return setError("Invitations must close before the event starts.");
    }

    if (!user) return;

    try {
      const created = await createEvent({
        name: form.name.trim(),
        month,
        year,
        venue: form.venue.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        numberOfDays: form.numberOfDays,
        invitationOpenDate: form.invitationOpenDate,
        invitationCloseDate: form.invitationCloseDate,
        status: "draft",
        createdBy: user.id,
        notes: form.notes.trim() || undefined,
      });
      router.push(`/fa-system/marketing/events/${created.id}`);
    } catch (err) {
      console.error("[new event] failed:", err);
      setError("Could not create event. Try again.");
    }
  }

  return (
    <AppShell>
      {/* Breadcrumb */}
      <Link href="/fa-system/marketing" className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      <div className="mb-8 fa-enter">
        <div
          className="fa-mono text-[10px] uppercase text-gold-600 mb-3"
          style={{ letterSpacing: "0.12em" }}
        >
          New event
        </div>
        <h1 className="fa-display-italic text-6xl text-ink-900">Create Foundation Appraisal</h1>
        <hr className="border-0 border-t border-gold-200 mt-5 mb-4" />
        <p className="text-sm text-ink-500">
          Fill in the event details. You&apos;ll add sessions and branch quotas on the next screen.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">
        {/* Left: form */}
        <div className="lg:col-span-2 space-y-5">
          <section className="fa-card p-6">
            <div className="mb-5">
              <div
                className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5"
                style={{ letterSpacing: "0.12em" }}
              >
                Event details
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-gold-500" />
                <h2 className="fa-display text-2xl text-ink-900">Event details</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="fa-label">Event name</label>
                <input
                  className="fa-input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. April 2026 Foundation Appraisal"
                />
                <p className="text-xs text-ink-400 mt-1">Auto-generated from start date, but you can edit it.</p>
              </div>

              <div>
                <label className="fa-label">Venue</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    className="fa-input fa-input-icon-left"
                    value={form.venue}
                    onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                    placeholder="e.g. eBright HQ Subang"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="fa-label">Start date</label>
                  <input
                    type="date"
                    className="fa-input"
                    value={form.startDate}
                    min={today}
                    onChange={e => handleStartDateChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="fa-label">End date</label>
                  <input
                    type="date"
                    className="fa-input"
                    value={form.endDate}
                    min={form.startDate || today}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="fa-label">Number of days</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleDaysChange(n as 1 | 2 | 3)}
                      className={`flex-1 px-4 py-2.5 rounded-[10px] border text-sm font-medium transition-all ${
                        form.numberOfDays === n
                          ? "bg-ink-900 text-ivory-50 border-ink-900"
                          : "bg-ivory-50 text-ink-700 border-ink-200 hover:border-gold-400"
                      }`}
                    >
                      {n} day{n > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="fa-card p-6">
            <div className="mb-5">
              <div
                className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5"
                style={{ letterSpacing: "0.12em" }}
              >
                Invitation window
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gold-500" />
                <h2 className="fa-display text-2xl text-ink-900">Invitation window</h2>
              </div>
            </div>
            <p className="text-sm text-ink-500 mb-4">
              The period when Branch Managers can invite their students to this event.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="fa-label">Open date</label>
                <input
                  type="date"
                  className="fa-input"
                  value={form.invitationOpenDate}
                  onChange={e => setForm(f => ({ ...f, invitationOpenDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="fa-label">Close date</label>
                <input
                  type="date"
                  className="fa-input"
                  value={form.invitationCloseDate}
                  min={form.invitationOpenDate}
                  max={form.startDate}
                  onChange={e => setForm(f => ({ ...f, invitationCloseDate: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="fa-card p-6">
            <div className="mb-4">
              <div
                className="fa-mono text-[10px] uppercase text-gold-600 mb-1.5"
                style={{ letterSpacing: "0.12em" }}
              >
                Notes
              </div>
              <h2 className="fa-display text-2xl text-ink-900">Notes</h2>
            </div>
            <label className="fa-label">Internal notes (optional)</label>
            <textarea
              className="fa-input min-h-[80px] resize-y"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes about this event…"
            />
          </section>

          {error && (
            <div className="rounded-[10px] bg-danger-soft text-danger px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Link href="/fa-system/marketing" className="fa-btn-secondary">Cancel</Link>
            <button type="submit" className="fa-btn-primary">
              Create event
            </button>
          </div>
        </div>

        {/* Right: preview */}
        <div className="space-y-4">
          <div className="fa-card p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-ink-500" />
              <h3 className="fa-display text-base text-ink-900">Preview</h3>
            </div>
            <dl className="space-y-3">
              <div>
                <dt className="fa-mono text-[10px] uppercase text-gold-600" style={{ letterSpacing: "0.12em" }}>Name</dt>
                <dd className="fa-display text-base text-ink-900 mt-0.5">{form.name || "—"}</dd>
              </div>
              <div>
                <dt className="fa-mono text-[10px] uppercase text-gold-600" style={{ letterSpacing: "0.12em" }}>When</dt>
                <dd className="fa-mono text-sm text-ink-800 mt-0.5">
                  {form.startDate && form.endDate
                    ? `${form.startDate} → ${form.endDate} (${form.numberOfDays} day${form.numberOfDays > 1 ? "s" : ""})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="fa-mono text-[10px] uppercase text-gold-600" style={{ letterSpacing: "0.12em" }}>Venue</dt>
                <dd className="fa-display text-base text-ink-900 mt-0.5">{form.venue || "—"}</dd>
              </div>
              <div>
                <dt className="fa-mono text-[10px] uppercase text-gold-600" style={{ letterSpacing: "0.12em" }}>Invitation window</dt>
                <dd className="fa-mono text-sm text-ink-800 mt-0.5">
                  {form.invitationOpenDate && form.invitationCloseDate
                    ? `${form.invitationOpenDate} → ${form.invitationCloseDate}`
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 pt-4 border-t border-gold-200 text-xs text-ink-500">
              After creating, you&apos;ll add <strong className="text-ink-600">sessions</strong> and
              assign <strong className="text-ink-600">branch quotas</strong> before opening the event to BMs.
            </div>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
