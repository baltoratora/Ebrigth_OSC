import "server-only";
// career_applications AND rec_recruit both live in ebright_hrfs now, so the
// whole reconcile is a single same-database operation via hrfsPrisma.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
const hrfsPrisma = prisma;

/**
 * Bring "Join the Team" applications into the Recruitment board.
 *
 * The candidate form writes a row into ebright_hrfs.career_applications. This
 * reconciles those rows into rec_recruit so each new submission shows up as a
 * candidate card in the first pipeline stage. Idempotent: keyed on
 * rec_recruit.applicationId = career_applications.id, so re-running only creates
 * cards for applications not yet ingested — existing cards (and any stage the HR
 * team has since dragged them to) are never touched.
 *
 * Reads through hrfsPrisma (HRFS_DATABASE_URL → ebright_hrfs in prod/staging).
 * In environments where that isn't configured the query throws and we no-op, so
 * the board still renders.
 */
interface CareerApplicationRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  position: string | null;
  created_at: Date;
}

export async function syncCareerApplications(): Promise<{ created: number }> {
  // Best-effort ingest: a fully-wrapped try/catch so ANY problem here (missing
  // career_applications table, a rec_recruit schema that predates applicationId,
  // a transient DB error) degrades to "no new cards" instead of throwing — which
  // would 500 the entire board/dashboard/contacts page that calls this on load.
  try {
    const apps = await hrfsPrisma.$queryRawUnsafe<CareerApplicationRow[]>(
      `SELECT id, name, email, phone, source, "position", created_at
         FROM public.career_applications
        ORDER BY id DESC
        LIMIT 2000`,
    );
    if (!apps.length) return { created: 0 };

    // Which of these applications already have a card?
    const ids = apps.map((a) => a.id);
    const existing = await prisma.recRecruit.findMany({
      where: { applicationId: { in: ids } },
      select: { applicationId: true },
    });
    const have = new Set(existing.map((e) => e.applicationId));
    const toCreate = apps.filter((a) => !have.has(a.id));
    if (!toCreate.length) return { created: 0 };

    // New applications land in the first stage (lowest order — "Candidate (CD)").
    const firstStage = await prisma.recStage.findFirst({
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!firstStage) {
      console.error("[career-sync] no rec_stage configured — cannot ingest applications");
      return { created: 0 };
    }

    const res = await prisma.recRecruit.createMany({
      data: toCreate.map((a) => ({
        name: a.name,
        email: a.email,
        phone: a.phone,
        source: a.source,
        position: a.position,
        stageId: firstStage.id,
        applicationId: a.id,
        // Surface by submission time — the board orders by ghlCreatedAt desc, so a
        // fresh application sorts to the top of the first column.
        ghlCreatedAt: a.created_at,
      })),
      skipDuplicates: true, // race-safe against the unique applicationId index
    });

    return { created: res.count };
  } catch (e) {
    console.error("[career-sync] reconcile skipped:", (e as Error).message);
    return { created: 0 };
  }
}
