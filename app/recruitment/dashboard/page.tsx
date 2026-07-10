import { TrendingUp, Users, UserRoundCheck, Filter, XCircle } from "lucide-react";
import { getDashboardMetrics } from "@/lib/recruitment/data";
import { PageHeader } from "../_components/placeholders";

export const dynamic = "force-dynamic";

// Stage colour token → static bar class (Tailwind can't see dynamic names).
const BAR: Record<string, string> = {
  slate: "bg-slate-400", zinc: "bg-zinc-400", sky: "bg-sky-500", cyan: "bg-cyan-500",
  indigo: "bg-indigo-500", violet: "bg-violet-500", amber: "bg-amber-500",
  emerald: "bg-emerald-500", teal: "bg-teal-500", rose: "bg-rose-500",
  green: "bg-green-500", lime: "bg-lime-500",
};

export default async function RecruitmentDashboardPage() {
  const m = await getDashboardMetrics();
  const maxCount = Math.max(1, ...m.stages.map((s) => s.count));
  const rejected = m.stages.find((s) => s.shortCode.toUpperCase() === "RJT")?.count ?? 0;
  const active = Math.max(0, m.total - m.hired - rejected);
  const activeStages = m.stages.filter((s) => s.count > 0);

  const kpis = [
    { label: "Total Candidates", value: m.total, hint: "Unique applicants", icon: Users, ring: "from-emerald-500 to-teal-600" },
    { label: "Hired", value: m.hired, hint: "Matched to staff", icon: UserRoundCheck, ring: "from-green-500 to-emerald-600" },
    { label: "In Pipeline", value: active, hint: "Active, not yet decided", icon: Filter, ring: "from-sky-500 to-indigo-600" },
    { label: "Conversion Rate", value: `${(m.rate * 100).toFixed(1)}%`, hint: "Hired ÷ total", icon: TrendingUp, ring: "from-violet-500 to-fuchsia-600" },
  ];

  // Outcomes split (stacked bar).
  const seg = [
    { label: "Active", value: active, cls: "bg-sky-500" },
    { label: "Hired", value: m.hired, cls: "bg-emerald-500" },
    { label: "Rejected", value: rejected, cls: "bg-rose-500" },
  ];
  const segTotal = Math.max(1, active + m.hired + rejected);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Recruitment Dashboard" subtitle="Hiring funnel and recruitment activity across HR" />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br ${k.ring} text-white shadow-sm`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{k.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{k.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Funnel */}
        <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pipeline by stage</h2>
            <span className="text-[11px] text-slate-400">{activeStages.length} of {m.stages.length} stages active</span>
          </div>
          <div className="space-y-1">
            {m.stages.map((s) => {
              const pct = m.total ? Math.round((s.count / m.total) * 100) : 0;
              return (
                <div key={s.shortCode} className={`flex items-center gap-3 rounded-lg px-1.5 py-1 ${s.count === 0 ? "opacity-45" : ""}`}>
                  <div className="w-44 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300" title={s.name}>{s.name}</div>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-md ${BAR[s.color] ?? "bg-slate-400"}`}
                        style={{ width: `${s.count ? Math.max(4, (s.count / maxCount) * 100) : 0}%` }}
                        title={`${s.count} · ${pct}% of total`}
                      />
                    </div>
                  </div>
                  <div className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {s.count}<span className="ml-1 font-normal text-slate-400">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Outcomes */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Outcomes</h2>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {seg.map((s) => (
              <div key={s.label} className={s.cls} style={{ width: `${(s.value / segTotal) * 100}%` }} title={`${s.label}: ${s.value}`} />
            ))}
          </div>
          <ul className="space-y-3">
            {seg.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.cls}`} />
                <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{s.label}</span>
                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{rejected} candidate{rejected === 1 ? "" : "s"} rejected ({m.total ? Math.round((rejected / m.total) * 100) : 0}% of total)</span>
          </div>
        </section>
      </div>
    </div>
  );
}
