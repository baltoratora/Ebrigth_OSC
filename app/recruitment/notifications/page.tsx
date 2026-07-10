import { Bell, UserRoundCheck } from "lucide-react";
import { getRecentRecruits } from "@/lib/recruitment/data";
import { PageHeader } from "../_components/placeholders";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
}

export default async function RecruitmentNotificationsPage() {
  const rows = await getRecentRecruits(40);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Notifications" subtitle="Newest recruits who submitted the recruitment form" />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-emerald-200 bg-white/60 px-6 py-12 text-center text-sm text-slate-500 dark:border-emerald-950/40 dark:bg-slate-900/40">
          No recruits yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-slate-900">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{r.name}</p>
                  {r.hired && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      <UserRoundCheck className="h-2.5 w-2.5" /> Hired
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {r.stageName}{r.source ? ` · ${r.source}` : ""}{r.branch ? ` · ${r.branch.toUpperCase()}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-slate-400">{fmt(r.ghlCreatedAt ?? r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
