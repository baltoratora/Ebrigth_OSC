import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { ROLES, normalizeRole } from "@/lib/roles";
import { getResumes } from "@/lib/recruitment/data";
import { LibraryTable } from "@/components/recruitment/library-table";
import { PageHeader } from "../_components/placeholders";

// Access enforced by middleware (the /recruitment prefix is role-gated).
export const dynamic = "force-dynamic";

export default async function RecruitmentLibraryPage() {
  const [resumes, session] = await Promise.all([getResumes(), getServerSession(authOptions)]);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  const canDelete = !!role && new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]).has(role);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-10">
        <PageHeader title="Library" subtitle="Uploaded candidate resumes" />
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {resumes.length} file{resumes.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        <LibraryTable resumes={resumes} canDelete={canDelete} />
      </div>
    </div>
  );
}
