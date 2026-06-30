import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { ROLES, normalizeRole } from "@/lib/roles";
import { getKanban } from "@/lib/recruitment/data";
import { RecruitmentBoard } from "@/components/recruitment/board";
import { PageHeader } from "../_components/placeholders";

// Always read fresh so the board reflects the latest drag-moves.
export const dynamic = "force-dynamic";

export default async function RecruitmentOpportunityPage() {
  const [data, session] = await Promise.all([
    getKanban(),
    getServerSession(authOptions),
  ]);
  // Any HR-portal account may delete a candidate CARD (card only — never the
  // applicant/contact record). The page is already gated to those roles.
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  const canDelete = !!role && new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]).has(role);

  const columns = data.map((c) => ({
    id: c.id,
    name: c.name,
    shortCode: c.shortCode,
    color: c.color,
    recruits: c.recruits.map((r) => ({
      id: r.id, name: r.name, source: r.source, position: r.position, branch: r.branch, hired: r.hired,
      createdAt: r.createdAt.toISOString(),
      ghlCreatedAt: r.ghlCreatedAt ? r.ghlCreatedAt.toISOString() : null,
    })),
  }));
  const total = columns.reduce((s, c) => s + c.recruits.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-10">
        <PageHeader title="Opportunity" subtitle="Drag recruit cards across the hiring pipeline" />
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {total} recruits
        </span>
      </div>
      <RecruitmentBoard columns={columns} canDelete={canDelete} />
    </div>
  );
}
