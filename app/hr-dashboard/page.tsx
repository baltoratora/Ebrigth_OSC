"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ─── Self-contained palette (no dependency on global CSS tokens) ─── */
const C = {
  text: "#0f172a", muted: "#94a3b8", border: "#e2e8f0", bg: "#f8fafc",
  success: "#059669", successLight: "#ecfdf5",
  brand: "#dc2626", brandLight: "#fef2f2",
  warning: "#d97706", warningLight: "#fffbeb",
  purple: "#7c3aed", purpleLight: "rgba(124,58,237,0.08)",
  orange: "#f97316", orangeLight: "rgba(249,115,22,0.12)",
  red: "#ef4444", redLight: "rgba(239,68,68,0.1)",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16,
  boxShadow: "0 4px 15px -5px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column",
};

function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
// Compact "24 Jun" — used to list the individual leave-days behind an alert.
function fmtDayMon(d: any) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function fmtDateList(dates: any): string {
  if (!Array.isArray(dates) || dates.length === 0) return "";
  return dates.map(fmtDayMon).filter(Boolean).join(", ");
}
function isInRange(dateStr: any, startDaysAgo: number, endDaysAhead: number) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date(new Date().toDateString());
  const start = new Date(today); start.setDate(start.getDate() - startDaysAgo);
  const end = new Date(today); end.setDate(end.getDate() + endDaysAhead);
  return d >= start && d <= end;
}
function daysFromNow(dateStr: any): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date(new Date().toDateString());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
function DaysLabel({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days === 0) return <span style={{ fontSize: 10, fontWeight: 600, color: C.brand, background: C.brandLight, padding: "1px 6px", borderRadius: 4 }}>Today</span>;
  if (days < 0) return <span style={{ fontSize: 10, color: C.muted }}>{Math.abs(days)}d ago</span>;
  return <span style={{ fontSize: 10, color: C.muted }}>in {days}d</span>;
}

/* ─── Unified Dashboard Card ─── */
function DashCard({ title, subtitle, color, lightColor, records, dateField, datesField, mainCount, mainLabel, smallCount, smallLabel, extraField, typeField, onViewAll, maxItems, extraCounts, monthSelector, alertNames }: any) {
  const displayRecords = records.slice(0, maxItems || 8);
  const dense = !!(extraCounts && extraCounts.length);
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color, letterSpacing: "0.5px" }}>{title}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.3px" }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: dense ? 6 : 12, alignItems: "center" }}>
          {monthSelector && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginRight: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                <button onClick={monthSelector.onPrev} title="Previous month" style={{ background: "transparent", border: "none", padding: "1px 5px", cursor: "pointer", fontSize: 12, color: C.muted }}>‹</button>
                <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 2px", minWidth: 62, textAlign: "center", whiteSpace: "nowrap" }}>{monthSelector.label}</div>
                <button onClick={monthSelector.onNext} title="Next month" style={{ background: "transparent", border: "none", padding: "1px 5px", cursor: "pointer", fontSize: 12, color: C.muted }}>›</button>
              </div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px" }}>Signed In</div>
            </div>
          )}
          {extraCounts && extraCounts.map((ec: any, i: number) => {
            const clickable = typeof ec.onClick === "function";
            return (
              <div key={i} onClick={clickable ? ec.onClick : undefined} title={clickable ? "Click to see details" : undefined}
                style={{ textAlign: "center", cursor: clickable ? "pointer" : "default", padding: clickable ? "2px 4px" : 0, borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: clickable ? color : C.text }}>{ec.value}</div>
                <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{ec.label}</div>
              </div>
            );
          })}
          {smallCount !== undefined && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: dense ? 13 : 14, fontWeight: 700, color: C.text }}>{smallCount}</div>
              <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{smallLabel}</div>
            </div>
          )}
          <div style={{ background: lightColor, borderRadius: 10, padding: dense ? "5px 9px" : "8px 16px", textAlign: "center", minWidth: dense ? 42 : 60 }}>
            <div style={{ fontSize: dense ? 22 : 28, fontWeight: 800, color, lineHeight: 1 }}>{mainCount}</div>
            <div style={{ fontSize: 8, color: C.muted, marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{mainLabel}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, maxHeight: 200, overflowY: "auto", padding: "8px 0" }}>
        {records.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>No records in this period</div>
        ) : (
          displayRecords.map((r: any, i: number) => {
            const within2w = isInRange(r[dateField], 0, 14);
            const highlight = alertNames || within2w;
            const days = daysFromNow(r[dateField]);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 20px", background: highlight ? lightColor : "transparent", borderLeft: highlight ? `3px solid ${color}` : "3px solid transparent" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: highlight ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.muted, display: "flex", gap: 6, marginTop: 1 }}>
                    <span>{r.position || r.department_branch}</span>
                    {r.position && r.department_branch && <span>· {r.department_branch}</span>}
                    {typeField && r[typeField] && <span style={{ fontWeight: 700, color }}>· {r[typeField]}</span>}
                    {extraField && r[extraField] && <span>· {r[extraField]}</span>}
                  </div>
                  {datesField && Array.isArray(r[datesField]) && r[datesField].length > 0 && (
                    <div style={{ fontSize: 10, color, marginTop: 2, whiteSpace: "normal", lineHeight: 1.3 }}>
                      On leave: {fmtDateList(r[datesField])}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{fmtDate(r[dateField])}</div>
                  <DaysLabel days={days} />
                </div>
              </div>
            );
          })
        )}
        {records.length > (maxItems || 8) && (
          <div style={{ textAlign: "center", padding: 8 }}>
            <span style={{ fontSize: 11, color: C.muted }}>+{records.length - (maxItems || 8)} more</span>
          </div>
        )}
      </div>

      {onViewAll && records.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 20px", textAlign: "center" }}>
          <button onClick={onViewAll} style={{ background: "none", border: "none", color, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 12px" }}>
            View All {records.length} Records →
          </button>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { background: C.bg, padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "#475569", borderBottom: `1px solid ${C.border}` };
const td: React.CSSProperties = { padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 14, color: C.text, verticalAlign: "middle" };

function DetailHeader({ title, color, subtitle, onBack }: any) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, black))`, color: "#fff", borderRadius: 12, padding: "20px 24px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{subtitle}</div>
      </div>
      <button onClick={onBack} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>← Back</button>
    </div>
  );
}

function SignedDetailView({ title, color, records, onBack }: any) {
  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <div>
      <DetailHeader title={title} color={color} subtitle={`${records.length} signed in ${monthLabel}`} onBack={onBack} />
      <div style={{ ...cardStyle, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>#</th><th style={th}>Name</th><th style={th}>Position</th><th style={th}>Dept / Branch</th><th style={th}>Signed Date</th><th style={th}>Start Date</th></tr></thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td style={{ ...td, textAlign: "center", color: C.muted, padding: 32 }} colSpan={6}>No staff signed in this month for this category</td></tr>
            ) : records.map((r: any, i: number) => (
              <tr key={r.id}>
                <td style={{ ...td, color: C.muted, fontSize: 11 }}>{i + 1}</td>
                <td style={{ ...td, fontSize: 13 }}><strong>{r.name}</strong></td>
                <td style={{ ...td, fontSize: 12 }}>{r.position || "—"}</td>
                <td style={{ ...td, fontSize: 12 }}>{r.department_branch || "—"}</td>
                <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12, fontWeight: 500 }}>{fmtDate(r.signed_date)}</td>
                <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12 }}>{r.start_date ? fmtDate(r.start_date) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// HR escalation tier for a flagged employee, by their flagged leave-day count.
// 2 days → verbal warning (green); 3 → send email (yellow); 4+ → show-cause (red).
function flagAction(cnt: number): { tier: string; label: string; bg: string; fg: string } {
  if (cnt >= 4) return { tier: "show_cause", label: "Show cause letter", bg: C.redLight, fg: C.red };
  if (cnt === 3) return { tier: "email", label: "Send email", bg: C.warningLight, fg: C.warning };
  return { tier: "verbal", label: "Verbal warning", bg: C.successLight, fg: C.success };
}

function DetailView({ title, color, lightColor, records, dateField, datesField, dateLabel, typeField, typeLabel, alertNames, showAction, actionMonth, onBack }: any) {
  // Local completion overlay: keyed `${empCode}|${tier}`. Seeded by the API's
  // r.actionDone; flipped true when HR marks an action complete in the popup.
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [popup, setPopup] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function markComplete() {
    if (!popup) return;
    setSaving(true);
    try {
      const res = await fetch("/api/hr-dashboard/flag-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: popup.code, month: actionMonth, tier: popup.tier }),
      });
      if (res.ok) {
        setCompleted(prev => ({ ...prev, [`${popup.code}|${popup.tier}`]: true }));
        setPopup(null);
      }
    } finally { setSaving(false); }
  }

  return (
    <div>
      <DetailHeader title={title} color={color} subtitle={`${records.length} staff · Highlighted = within 2 weeks`} onBack={onBack} />
      <div style={{ ...cardStyle, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>#</th><th style={th}>Name</th><th style={th}>Position</th><th style={th}>Dept / Branch</th>{typeField && <th style={th}>{typeLabel || "Leave Type"}</th>}<th style={th}>{dateLabel}</th>{showAction && <th style={th}>HR Action</th>}<th style={th}></th></tr></thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td style={{ ...td, textAlign: "center", color: C.muted, padding: 32 }} colSpan={(typeField ? 7 : 6) + (showAction ? 1 : 0)}>No records</td></tr>
            ) : records.map((r: any, i: number) => {
              const within2w = isInRange(r[dateField], 0, 14);
              const highlight = alertNames || within2w;
              const days = daysFromNow(r[dateField]);
              return (
                <tr key={r.id ?? i} style={highlight ? { background: lightColor } : {}}>
                  <td style={{ ...td, color: C.muted, fontSize: 11 }}>{i + 1}</td>
                  <td style={{ ...td, fontSize: 13 }}>
                    {highlight && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 8 }} />}
                    <strong>{r.name}</strong>
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>{r.position}</td>
                  <td style={{ ...td, fontSize: 12 }}>{r.department_branch}</td>
                  {typeField && <td style={{ ...td, fontSize: 12, fontWeight: 700, color }}>{r[typeField] || "—"}</td>}
                  <td style={{ ...td, fontSize: 12, fontWeight: within2w ? 600 : 400 }}>
                    {datesField && Array.isArray(r[datesField]) && r[datesField].length > 0
                      ? <span style={{ color }}>{fmtDateList(r[datesField])}</span>
                      : <span style={{ whiteSpace: "nowrap" }}>{fmtDate(r[dateField])}</span>}
                  </td>
                  {showAction && (() => {
                    const a = flagAction(Number(r.cnt) || 0);
                    const isDone = r.actionDone || completed[`${r.code}|${a.tier}`];
                    return (
                      <td style={td}>
                        {isDone ? (
                          <span title="Action completed" style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: C.successLight, color: C.success, whiteSpace: "nowrap" }}>
                            ✓ Completed
                          </span>
                        ) : (
                          <button
                            onClick={() => setPopup({ code: r.code, name: r.name, tier: a.tier, label: a.label })}
                            title="Click to mark this HR action complete"
                            style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: a.bg, color: a.fg, whiteSpace: "nowrap", border: "none", cursor: "pointer" }}
                          >
                            {a.label}
                          </button>
                        )}
                      </td>
                    );
                  })()}
                  <td style={td}><DaysLabel days={days} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, boxShadow: "0 10px 40px rgba(0,0,0,0.25)", maxWidth: 420, width: "100%", padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Mark action complete?</div>
            <p style={{ fontSize: 14, color: "#475569", marginTop: 10, lineHeight: 1.5 }}>
              Confirm you have done the <strong style={{ color: C.text }}>{popup.label}</strong> for <strong style={{ color: C.text }}>{popup.name}</strong>.
              Once marked complete, it will show as <strong>✓ Completed</strong>.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPopup(null)} disabled={saving}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#f1f5f9", color: "#334155", border: "none", cursor: "pointer" }}>
                Not yet
              </button>
              <button onClick={markComplete} disabled={saving}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: C.success, color: "#fff", border: "none", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : "Mark complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(ym: string, delta: number) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr) || 1970; const m = Number(mStr) || 1;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatMonthLabel(ym: string) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr) || 1970; const m = Number(mStr) || 1;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function HRDashboardPage() {
  const [detailView, setDetailView] = useState<string | null>(null);
  const [signedMonth, setSignedMonth] = useState(currentYearMonth());
  const [miaMonth, setMiaMonth] = useState(currentYearMonth());
  const [flaggedMonth, setFlaggedMonth] = useState(currentYearMonth());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/hr-dashboard?month=${signedMonth}&miaMonth=${miaMonth}&flaggedMonth=${flaggedMonth}`)
      .then(r => r.ok ? r.json() : r.json().then((j: any) => Promise.reject(new Error(j.error || `HTTP ${r.status}`))))
      .then(d => { setData(d); setError(""); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [signedMonth, miaMonth, flaggedMonth]);
  useEffect(() => { load(); }, [load]);

  const onboarding = data?.onboarding || [];
  const offboarding = data?.offboarding || [];
  const signedCounts = data?.signedCounts || { partTime: 0, fullTime: 0, intern: 0 };
  const signedStaff = data?.signedStaff || [];
  const annualLeave = data?.annualLeave || [];
  const mc = data?.mc || [];
  const flagged = data?.flagged || [];
  const mia = data?.mia || [];
  // MIA card also lists who's missing TODAY (scheduled but not scanned), on top
  // of the current UL-leave condition. This list naturally changes each new day.
  const miaMissingDate = data?.miaMissingDate || null;
  const miaCodes = new Set(mia.map((r: any) => r.code));
  const miaMissingToday = (data?.miaMissingToday || [])
    .filter((m: any) => !miaCodes.has(m.code))
    .map((m: any) => ({ ...m, flag_label: "Missing today", reason: null, last_date: miaMissingDate }));
  const miaCombined = [...mia, ...miaMissingToday];

  const SIGNED_BUCKETS: Record<string, { title: string; bucket: string }> = {
    "signed-partTime": { title: "Part Time — Signed This Month", bucket: "partTime" },
    "signed-fullTime": { title: "Full Time — Signed This Month", bucket: "fullTime" },
    "signed-intern": { title: "Intern — Signed This Month", bucket: "intern" },
  };

  const onb2w = onboarding.filter((r: any) => isInRange(r.start_date, 0, 14)).length;
  const ofb2w = offboarding.filter((r: any) => isInRange(r.end_date, 0, 14)).length;
  const onbTotal = onboarding.filter((r: any) => { const d = daysFromNow(r.start_date); return d !== null && d >= 0; }).length;
  const ofbTotal = offboarding.filter((r: any) => { const d = daysFromNow(r.end_date); return d !== null && d >= 0; }).length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "24px 28px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          <Link href="/dashboards/hrms" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff", fontSize: 13, fontWeight: 600, color: C.text, textDecoration: "none" }}>
            <span style={{ fontSize: 16 }}>←</span><span>Back to HRMS</span>
          </Link>
          <div style={{ marginTop: 16 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px", color: C.text }}>HR Overview Dashboard</h1>
            <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>Onboarding · Offboarding · Annual Leave · MC · Flagged · MIA</p>
          </div>
        </div>

        {loading ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: C.muted }}>Loading…</div>
        ) : error ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: C.brand }}>
            <div style={{ fontWeight: 700 }}>Failed to load</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{error}</div>
          </div>
        ) : detailView && detailView in SIGNED_BUCKETS ? (
          <SignedDetailView title={SIGNED_BUCKETS[detailView].title} color={C.success}
            records={signedStaff.filter((s: any) => s.bucket === SIGNED_BUCKETS[detailView].bucket)} onBack={() => setDetailView(null)} />
        ) : detailView === "onboarding" ? (
          <DetailView title="Onboarding" color={C.success} lightColor={C.successLight} records={onboarding} dateField="start_date" dateLabel="Start Date" onBack={() => setDetailView(null)} />
        ) : detailView === "offboarding" ? (
          <DetailView title="Offboarding" color={C.brand} lightColor={C.brandLight} records={offboarding} dateField="end_date" dateLabel="End Date" onBack={() => setDetailView(null)} />
        ) : detailView === "mc" ? (
          <DetailView title="MC" color={C.warning} lightColor={C.warningLight} records={mc} dateField="mc_date" dateLabel="MC Date" typeField="leave_type" typeLabel="Leave Type" onBack={() => setDetailView(null)} />
        ) : detailView === "annual_leave" ? (
          <DetailView title="Annual Leave" color={C.purple} lightColor={C.purpleLight} records={annualLeave} dateField="al_date" dateLabel="AL Date" onBack={() => setDetailView(null)} />
        ) : detailView === "flagged" ? (
          <DetailView title={`Flagged — ≥2 SL or ≥2 UL days (${formatMonthLabel(flaggedMonth)})`} color={C.orange} lightColor={C.orangeLight} records={flagged} dateField="last_date" datesField="dates" dateLabel="Leave dates" typeField="flag_label" typeLabel="Flag" alertNames showAction actionMonth={flaggedMonth} onBack={() => setDetailView(null)} />
        ) : detailView === "mia" ? (
          <DetailView title={`MIA — Unpaid Leave (${formatMonthLabel(miaMonth)})${miaMissingToday.length ? " + Missing Today" : ""}`} color={C.red} lightColor={C.redLight} records={miaCombined} dateField="last_date" dateLabel="Last UL / Today" typeField="flag_label" typeLabel="Type" alertNames onBack={() => setDetailView(null)} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <DashCard title="ONBOARDING" subtitle="-1 week → +6 months" color={C.success} lightColor={C.successLight}
              records={onboarding} dateField="start_date" mainCount={onb2w} mainLabel="2 Wk" smallCount={onbTotal} smallLabel="6 Mo"
              monthSelector={{ label: formatMonthLabel(signedMonth), onPrev: () => setSignedMonth(shiftMonth(signedMonth, -1)), onNext: () => setSignedMonth(shiftMonth(signedMonth, +1)) }}
              extraCounts={[
                { label: "PT", value: signedCounts.partTime, onClick: () => setDetailView("signed-partTime") },
                { label: "FT", value: signedCounts.fullTime, onClick: () => setDetailView("signed-fullTime") },
                { label: "INT", value: signedCounts.intern, onClick: () => setDetailView("signed-intern") },
              ]}
              onViewAll={() => setDetailView("onboarding")} />
            <DashCard title="OFFBOARDING" subtitle="-1 week → +2 months" color={C.brand} lightColor={C.brandLight}
              records={offboarding} dateField="end_date" mainCount={ofb2w} mainLabel="2 Wk" smallCount={ofbTotal} smallLabel="2 Mo"
              onViewAll={() => setDetailView("offboarding")} />
            <DashCard title="ANNUAL LEAVE" subtitle="today → +2 weeks" color={C.purple} lightColor={C.purpleLight}
              records={annualLeave} dateField="al_date" mainCount={annualLeave.length} mainLabel="Total" extraField="al_duration"
              onViewAll={() => setDetailView("annual_leave")} />
            <DashCard title="MC" subtitle="-1 month → today" color={C.warning} lightColor={C.warningLight}
              records={mc} dateField="mc_date" mainCount={mc.length} mainLabel="Total" typeField="leave_type" extraField="reason"
              onViewAll={() => setDetailView("mc")} />
            <DashCard title="FLAGGED" subtitle="SL or UL ≥ 2 · by month" color={C.orange} lightColor={C.orangeLight}
              records={flagged} dateField="last_date" datesField="dates" mainCount={flagged.length} mainLabel="Flagged" typeField="flag_label" extraField="reason" alertNames
              monthSelector={{ label: formatMonthLabel(flaggedMonth), onPrev: () => setFlaggedMonth(shiftMonth(flaggedMonth, -1)), onNext: () => setFlaggedMonth(shiftMonth(flaggedMonth, +1)) }}
              onViewAll={() => setDetailView("flagged")} />
            <DashCard title="MIA" subtitle="Unpaid leave · by month · + missing today" color={C.red} lightColor={C.redLight}
              records={miaCombined} dateField="last_date" mainCount={mia.length} mainLabel="UL" smallCount={miaMissingToday.length} smallLabel="Missing" typeField="flag_label" extraField="reason" alertNames
              monthSelector={{ label: formatMonthLabel(miaMonth), onPrev: () => setMiaMonth(shiftMonth(miaMonth, -1)), onNext: () => setMiaMonth(shiftMonth(miaMonth, +1)) }}
              onViewAll={() => setDetailView("mia")} />
          </div>
        )}
      </div>
    </div>
  );
}
