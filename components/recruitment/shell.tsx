"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/crm/utils";
import { RecruitmentSidebar } from "@/app/recruitment/_components/recruitment-sidebar";
import { NotificationBell } from "@/components/recruitment/notification-bell";
import { TrainingPopup } from "@/components/recruitment/training-popup";

// App shell for the Recruitment module. Holds a self-contained dark-mode toggle
// — the `.dark` class is applied to THIS subtree's root only, so Tailwind's
// `dark:` variants light up across recruitment without affecting the rest of
// the portal. Preference persists in localStorage.
export function RecruitmentShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDark(localStorage.getItem("rec-theme") === "dark");
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("rec-theme", dark ? "dark" : "light");
  }, [dark, ready]);

  return (
    <div className={cn("flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950", dark && "dark")}>
      <RecruitmentSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle dark mode"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      {/* Fires when HR opens Recruitment: training attendance to confirm +
          reschedule dates to pick. */}
      <TrainingPopup />
    </div>
  );
}
