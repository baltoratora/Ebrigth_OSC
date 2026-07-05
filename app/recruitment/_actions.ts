"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
// Recruitment lives in the ebright_hrfs database — use the HRFS client.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
import { ROLES, normalizeRole } from "@/lib/roles";
import { getHrfsCandidate, type HrfsCandidate } from "@/lib/recruitment/hrfs-candidate";
import { isTrainingCode } from "@/lib/recruitment/training";
import { phoneKey } from "@/lib/recruitment/dedupe";

const ALLOWED = new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]);

async function requireAccess(): Promise<{ userId: string; email: string }> {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session?.user || !role || !ALLOWED.has(role)) {
    throw new Error("Not authorized for Recruitment.");
  }
  const u = session.user as { id?: string; email?: string };
  return { userId: String(u.id ?? u.email ?? "unknown"), email: String(u.email ?? "") };
}

export interface MoveResult {
  ok: boolean;
  error?: string;
}

/**
 * Mirror a recruit's current pipeline stage back into the canonical
 * `career_applications` store (ebright_hrfs.public), so the applications table
 * HR inspects always reflects where the candidate actually is — instead of
 * being stuck at its default 'new'. The link is rec_recruit.applicationId =
 * career_applications.id. Best-effort: a mirror failure never blocks the move
 * (the board's rec_recruit is still the live source of truth). We write the
 * human-readable stage NAME (what the board column shows).
 */
async function mirrorStageToCareerApplications(
  applicationIds: (number | null | undefined)[],
  stageName: string,
): Promise<void> {
  const ids = applicationIds.filter(
    (x): x is number => typeof x === "number" && Number.isInteger(x),
  );
  if (!ids.length) return;
  try {
    // ids are DB-sourced integers (rec_recruit.applicationId) — safe to inline.
    await prisma.$executeRawUnsafe(
      `UPDATE public.career_applications SET stage = $1, updated_at = now() WHERE id IN (${ids.join(",")})`,
      stageName,
    );
  } catch (e) {
    console.warn(
      "[recruitment] career_applications stage mirror failed (move still applied):",
      (e as Error).message,
    );
  }
}

/** Employment types a manually-added candidate can be filed under. */
export const EMPLOYMENT_TYPES = ["Internship", "Part Time", "Full Time"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export interface CreateRecruitInput {
  name: string;
  employmentType: EmploymentType;
  phone?: string | null;
  email?: string | null;
  branch?: string | null;
}

/**
 * Manually add a candidate opportunity (the "Add Opportunity" button).
 *
 * Writes the canonical record into `career_applications` (ebright_hrfs.public)
 * FIRST — that table is the store of record — then creates the linked board
 * card (rec_recruit) filed under the chosen employment type's stage
 * (Internship→INTERN, Full Time→FT, Part Time→PT). The applicationId link keeps
 * the two in sync (career-sync won't duplicate, and stage moves mirror back).
 */
const STAGE_BY_TYPE: Record<EmploymentType, string> = {
  Internship: "INTERN",
  "Full Time": "FT",
  "Part Time": "PT",
};

export async function createRecruit(
  input: CreateRecruitInput,
): Promise<MoveResult & { id?: string }> {
  try {
    const { userId } = await requireAccess();

    const name = input.name?.trim();
    if (!name) return { ok: false, error: "Candidate name is required" };
    if (!EMPLOYMENT_TYPES.includes(input.employmentType)) {
      return { ok: false, error: "Choose Internship, Part Time or Full Time" };
    }

    // File the card under the type's stage; fall back to the first stage if that
    // shortCode isn't configured on this pipeline.
    const stage =
      (await prisma.recStage.findFirst({
        where: { shortCode: STAGE_BY_TYPE[input.employmentType] },
        select: { id: true, name: true },
      })) ??
      (await prisma.recStage.findFirst({ orderBy: { order: "asc" }, select: { id: true, name: true } }));
    if (!stage) return { ok: false, error: "No recruitment stages configured" };

    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    const branch = input.branch?.trim() || null;

    // Canonical store first: insert into career_applications. Its NOT NULL text
    // columns get '' when unknown; stage carries the readable stage name.
    let applicationId: number | null = null;
    try {
      const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO public.career_applications
           (name, phone, email, gender, education_level, city, position, stage, source)
         VALUES ($1, $2, $3, '', '', '', $4, $5, 'manual')
         RETURNING id`,
        name, phone ?? "", email ?? "", input.employmentType, stage.name,
      );
      applicationId = rows[0]?.id ?? null;
    } catch (e) {
      return {
        ok: false,
        error:
          "Could not write to career_applications — check HRFS_DATABASE_URL points to ebright_hrfs (" +
          (e as Error).message + ")",
      };
    }

    // Working board card, linked back to the application it represents.
    const recruit = await prisma.recRecruit.create({
      data: {
        name,
        email,
        phone,
        branch,
        source: "manual",
        position: input.employmentType,
        stageId: stage.id,
        applicationId: applicationId ?? undefined,
      },
      select: { id: true },
    });

    // Best-effort initial history entry — never block the create on it.
    try {
      await prisma.recStageHistory.create({
        data: { recruitId: recruit.id, fromStageId: null, toStageId: stage.id, changedBy: userId, note: "Added manually" },
      });
    } catch {
      /* history is secondary — the card already exists */
    }

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/contacts");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, id: recruit.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add opportunity" };
  }
}

/** Move a recruit to a new stage (kanban drag) + record the transition. */
export async function moveRecruit(recruitId: string, toStageId: string): Promise<MoveResult> {
  try {
    const { userId } = await requireAccess();

    const recruit = await prisma.recRecruit.findFirst({
      where: { id: recruitId, deletedAt: null },
      select: { id: true, stageId: true, applicationId: true },
    });
    if (!recruit) return { ok: false, error: "Recruit not found" };
    if (recruit.stageId === toStageId) return { ok: true };

    const toStage = await prisma.recStage.findUnique({ where: { id: toStageId }, select: { id: true, shortCode: true, name: true } });
    if (!toStage) return { ok: false, error: "Stage not found" };

    // Dragging into a training stage (re)starts its 3-day attendance clock; any
    // manual move also cancels a pending reschedule auto-return.
    const enteringTraining = isTrainingCode(toStage.shortCode);
    // The stage change is the primary write and must commit on its own. The
    // history entry is a secondary audit log — kept best-effort so a problem
    // writing it (e.g. rec_stage_history not provisioned) can never roll back
    // and silently lose the actual move.
    await prisma.recRecruit.update({
      where: { id: recruitId },
      data: {
        stageId: toStageId,
        trainingEnteredAt: enteringTraining ? new Date() : undefined,
        trainingConfirmedAt: enteringTraining ? null : undefined,
        rescheduleAt: null,
        rescheduleReturnCode: null,
      },
    });
    try {
      await prisma.recStageHistory.create({
        data: { recruitId, fromStageId: recruit.stageId, toStageId, changedBy: userId },
      });
    } catch (e) {
      console.warn("[recruitment] stage-history write failed (move still applied):", (e as Error).message);
    }

    // Mirror the new stage into the canonical career_applications store.
    await mirrorStageToCareerApplications([recruit.applicationId], toStage.name);

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Move failed" };
  }
}

/** Move many recruits to one stage at once (bulk action) + record each transition. */
export async function bulkMoveRecruits(
  ids: string[],
  toStageId: string,
): Promise<MoveResult & { moved?: number }> {
  try {
    const { userId } = await requireAccess();
    if (!ids.length) return { ok: true, moved: 0 };

    const toStage = await prisma.recStage.findUnique({ where: { id: toStageId }, select: { id: true, shortCode: true, name: true } });
    if (!toStage) return { ok: false, error: "Stage not found" };

    const recruits = await prisma.recRecruit.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, stageId: true, applicationId: true },
    });
    const toMove = recruits.filter((r) => r.stageId !== toStageId);
    if (!toMove.length) return { ok: true, moved: 0 };

    const enteringTraining = isTrainingCode(toStage.shortCode);
    // Primary write (the actual move) commits on its own; history is best-effort
    // so it can never roll back a successful move (see moveRecruit).
    await prisma.recRecruit.updateMany({
      where: { id: { in: toMove.map((r) => r.id) } },
      data: {
        stageId: toStageId,
        trainingEnteredAt: enteringTraining ? new Date() : undefined,
        trainingConfirmedAt: enteringTraining ? null : undefined,
        rescheduleAt: null,
        rescheduleReturnCode: null,
      },
    });
    try {
      await prisma.recStageHistory.createMany({
        data: toMove.map((r) => ({ recruitId: r.id, fromStageId: r.stageId, toStageId, changedBy: userId })),
      });
    } catch (e) {
      console.warn("[recruitment] bulk stage-history write failed (moves still applied):", (e as Error).message);
    }

    // Mirror the new stage into the canonical career_applications store.
    await mirrorStageToCareerApplications(toMove.map((r) => r.applicationId), toStage.name);

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, moved: toMove.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk move failed" };
  }
}

/**
 * Soft-delete recruit CARDS. Any HR-portal account may delete a card — it only
 * sets rec_recruit.deletedAt, so the card leaves the board but the underlying
 * applicant/contact (the HRFS record + any matched BranchStaff) is untouched.
 */
export async function bulkDeleteRecruits(ids: string[]): Promise<MoveResult & { deleted?: number }> {
  try {
    await requireAccess();
    if (!ids.length) return { ok: true, deleted: 0 };

    const res = await prisma.recRecruit.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/contacts");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, deleted: res.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

/** Soft-delete a single recruit card (per-card delete button). Card only — the
 *  applicant/contact record is never touched. */
export async function deleteRecruit(id: string): Promise<MoveResult> {
  const res = await bulkDeleteRecruits([id]);
  return { ok: res.ok, error: res.error };
}

// ─── Archive (park, reversibly, off the active board) ───────────────────────

/** Archive recruit cards — hidden from the active board but still viewable via
 *  "Show archived" and restorable. Distinct from delete; reversible. */
export async function archiveRecruits(ids: string[]): Promise<MoveResult & { count?: number }> {
  try {
    await requireAccess();
    if (!ids.length) return { ok: true, count: 0 };
    const res = await prisma.recRecruit.updateMany({
      where: { id: { in: ids }, deletedAt: null, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, count: res.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Archive failed" };
  }
}

/** Restore archived cards back to the active board. */
export async function unarchiveRecruits(ids: string[]): Promise<MoveResult & { count?: number }> {
  try {
    await requireAccess();
    if (!ids.length) return { ok: true, count: 0 };
    const res = await prisma.recRecruit.updateMany({
      where: { id: { in: ids }, deletedAt: null, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, count: res.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Restore failed" };
  }
}

export interface ArchivedCard {
  id: string;
  name: string;
  source: string | null;
  position: string | null;
  branch: string | null;
  hired: boolean;
  createdAt: string;
  ghlCreatedAt: string | null;
  stageId: string;
}

/** All archived cards (flat, with their stage) for the "Show archived" view. */
export async function getArchivedRecruits(): Promise<{ ok: boolean; cards: ArchivedCard[] }> {
  try {
    await requireAccess();
    const rows = await prisma.recRecruit.findMany({
      where: { deletedAt: null, archivedAt: { not: null } },
      orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, name: true, source: true, position: true, branch: true, hired: true,
        createdAt: true, ghlCreatedAt: true, stageId: true,
      },
    });
    return {
      ok: true,
      cards: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        ghlCreatedAt: r.ghlCreatedAt ? r.ghlCreatedAt.toISOString() : null,
      })),
    };
  } catch {
    return { ok: false, cards: [] };
  }
}

/**
 * Archive every active card that isn't backed by a real record in the
 * applications database (ebright_hrfs.career_applications). "Not in database"
 * means: no applicationId link to an existing row AND no email/phone match. The
 * legacy GHL-imported and hand-created cards fall here. Reversible.
 */
export async function archiveOrphanRecruits(): Promise<MoveResult & { count?: number }> {
  try {
    await requireAccess();
    const cards = await prisma.recRecruit.findMany({
      where: { deletedAt: null, archivedAt: null },
      select: { id: true, applicationId: true, email: true, phone: true },
    });

    let apps: { id: number; email: string | null; phone: string | null }[];
    try {
      apps = await prisma.$queryRawUnsafe<{ id: number; email: string | null; phone: string | null }[]>(
        `SELECT id, email, phone FROM public.career_applications LIMIT 100000`,
      );
    } catch (e) {
      return { ok: false, error: "Could not read the applications database: " + (e as Error).message };
    }
    const appIds = new Set(apps.map((a) => a.id));
    const appEmails = new Set(apps.map((a) => a.email?.trim().toLowerCase()).filter(Boolean) as string[]);
    const appPhones = new Set(apps.map((a) => phoneKey(a.phone)).filter(Boolean) as string[]);

    const orphanIds = cards
      .filter((c) => {
        if (c.applicationId != null && appIds.has(c.applicationId)) return false; // linked → backed
        const em = c.email?.trim().toLowerCase();
        const ph = phoneKey(c.phone);
        const matches = (em && appEmails.has(em)) || (ph && appPhones.has(ph));
        return !matches; // no link and no email/phone match → not in the database
      })
      .map((c) => c.id);

    if (!orphanIds.length) return { ok: true, count: 0 };

    const now = new Date();
    let count = 0;
    for (let i = 0; i < orphanIds.length; i += 1000) {
      const res = await prisma.recRecruit.updateMany({
        where: { id: { in: orphanIds.slice(i, i + 1000) } },
        data: { archivedAt: now },
      });
      count += res.count;
    }
    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/dashboard");
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Archive failed" };
  }
}

export interface RecruitDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  position: string | null;
  /** Every distinct position this person applied for (merged duplicate cards). */
  positions: string[];
  branch: string | null;
  hired: boolean;
  branchStaffId: number | null;
  ghlOpportunityId: string | null;
  ghlContactId: string | null;
  stageName: string;
  stageShort: string;
  ghlCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: { id: string; from: string | null; to: string; changedBy: string | null; note: string | null; changedAt: string }[];
  /** Applicant detail pulled from the ebright_hrfs table (null until that table
   *  is configured or when there's no match). The modal renders city / form
   *  type / education / gender from here. */
  hrfs: HrfsCandidate | null;
  /** Scheduled interview, if this recruit has one. */
  interview: { id: string; scheduledAt: string; location: string | null; note: string | null } | null;
  /** Uploaded resumes (newest first) — metadata only; file streams from the API. */
  resumes: { id: string; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string }[];
}

/** Full detail for one recruit (card / row click) including its stage history. */
export async function getRecruitDetail(
  recruitId: string,
): Promise<{ ok: boolean; detail?: RecruitDetail; error?: string }> {
  try {
    await requireAccess();
    const r = await prisma.recRecruit.findFirst({
      where: { id: recruitId, deletedAt: null },
      select: {
        id: true, name: true, email: true, phone: true, source: true, position: true,
        branch: true, hired: true, branchStaffId: true, ghlOpportunityId: true,
        ghlContactId: true, ghlCreatedAt: true, applicationId: true, createdAt: true, updatedAt: true,
        stage: { select: { name: true, shortCode: true } },
        history: {
          orderBy: { changedAt: "desc" },
          select: { id: true, fromStageId: true, toStageId: true, changedBy: true, note: true, changedAt: true },
        },
        interview: { select: { id: true, scheduledAt: true, location: true, note: true } },
        resumes: {
          orderBy: { uploadedAt: "desc" },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
        },
      },
    });
    if (!r) return { ok: false, error: "Recruit not found" };

    // Enrich from ebright_hrfs.career_applications — prefer the applicationId
    // link, fall back to email/phone for older cards. Best-effort.
    const hrfs = await getHrfsCandidate({ applicationId: r.applicationId, email: r.email, phone: r.phone });

    // Aggregate every position this person applied for across their (possibly
    // duplicate) cards — matched by exact phone or email.
    const positions: string[] = [];
    {
      const seen = new Set<string>();
      const add = (p: string | null | undefined) => {
        const v = p?.trim();
        if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); positions.push(v); }
      };
      add(r.position);
      const orFilters: { phone?: string; email?: string }[] = [];
      if (r.phone) orFilters.push({ phone: r.phone });
      if (r.email) orFilters.push({ email: r.email });
      if (orFilters.length) {
        const siblings = await prisma.recRecruit.findMany({
          where: { deletedAt: null, id: { not: r.id }, OR: orFilters },
          select: { position: true },
        });
        for (const s of siblings) add(s.position);
      }
    }

    const stages = await prisma.recStage.findMany({ select: { id: true, name: true } });
    const nameById = new Map(stages.map((s) => [s.id, s.name]));

    return {
      ok: true,
      detail: {
        id: r.id, name: r.name, email: r.email, phone: r.phone, source: r.source,
        position: positions[0] ?? r.position, positions, branch: r.branch, hired: r.hired, branchStaffId: r.branchStaffId,
        ghlOpportunityId: r.ghlOpportunityId, ghlContactId: r.ghlContactId,
        stageName: r.stage.name, stageShort: r.stage.shortCode,
        ghlCreatedAt: r.ghlCreatedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        hrfs,
        interview: r.interview
          ? {
              id: r.interview.id,
              scheduledAt: r.interview.scheduledAt.toISOString(),
              location: r.interview.location,
              note: r.interview.note,
            }
          : null,
        resumes: r.resumes.map((rs) => ({
          id: rs.id,
          fileName: rs.fileName,
          mimeType: rs.mimeType,
          sizeBytes: rs.sizeBytes,
          uploadedAt: rs.uploadedAt.toISOString(),
        })),
        history: r.history.map((h) => ({
          id: h.id,
          from: h.fromStageId ? nameById.get(h.fromStageId) ?? null : null,
          to: nameById.get(h.toStageId) ?? h.toStageId,
          changedBy: h.changedBy,
          note: h.note,
          changedAt: h.changedAt.toISOString(),
        })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load recruit" };
  }
}
