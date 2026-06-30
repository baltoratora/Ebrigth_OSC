import "server-only";
// Recruitment lives in the ebright_hrfs database — use the HRFS client.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
import { syncCareerApplications } from "@/lib/recruitment/career-sync";

// Shared server-side data access for the Recruitment module. All reads are
// scoped to non-deleted recruits and ordered by the canonical stage order.

export interface RecCard {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  position: string | null;
  branch: string | null;
  hired: boolean;
  branchStaffId: number | null;
  ghlCreatedAt: Date | null;
  createdAt: Date;
}

export interface RecColumn {
  id: string;
  name: string;
  shortCode: string;
  order: number;
  color: string;
  recruits: RecCard[];
}

const CARD_SELECT = {
  id: true, name: true, email: true, phone: true, source: true, position: true,
  branch: true, hired: true, branchStaffId: true, ghlCreatedAt: true, createdAt: true,
} as const;

/** Stages (ordered) each with their non-deleted recruits — the kanban payload. */
export async function getKanban(): Promise<RecColumn[]> {
  // Pull in any new "Join the Team" form submissions before rendering the board,
  // so a freshly-filled application shows as a candidate card. Best-effort.
  await syncCareerApplications();
  const stages = await prisma.recStage.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true, name: true, shortCode: true, order: true, color: true,
      recruits: {
        where: { deletedAt: null },
        orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
        select: CARD_SELECT,
      },
    },
  });
  return stages;
}

/** Flat recruit list for the Contacts table. */
export async function getRecruitsList(): Promise<(RecCard & { stageName: string; stageShort: string })[]> {
  await syncCareerApplications();
  const rows = await prisma.recRecruit.findMany({
    where: { deletedAt: null },
    orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
    select: { ...CARD_SELECT, stage: { select: { name: true, shortCode: true } } },
  });
  return rows.map((r) => ({ ...r, stageName: r.stage.name, stageShort: r.stage.shortCode }));
}

export interface RecMetrics {
  total: number;
  hired: number;
  rate: number; // hired / total
  stages: { name: string; shortCode: string; color: string; order: number; count: number }[];
}

/** Headline metrics + per-stage funnel for the dashboard. */
export async function getDashboardMetrics(): Promise<RecMetrics> {
  await syncCareerApplications();
  const [total, hired, stages, grouped] = await Promise.all([
    prisma.recRecruit.count({ where: { deletedAt: null } }),
    prisma.recRecruit.count({ where: { deletedAt: null, hired: true } }),
    prisma.recStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, shortCode: true, color: true, order: true } }),
    prisma.recRecruit.groupBy({ by: ["stageId"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const countByStage = new Map(grouped.map((g) => [g.stageId, g._count._all]));
  return {
    total,
    hired,
    rate: total ? hired / total : 0,
    stages: stages.map((s) => ({
      name: s.name, shortCode: s.shortCode, color: s.color, order: s.order,
      count: countByStage.get(s.id) ?? 0,
    })),
  };
}

/** Most recently-submitted recruits — drives the Notifications feed. */
export async function getRecentRecruits(limit = 40): Promise<(RecCard & { stageName: string })[]> {
  const rows = await prisma.recRecruit.findMany({
    where: { deletedAt: null },
    orderBy: [{ ghlCreatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { ...CARD_SELECT, stage: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, stageName: r.stage.name }));
}

// ─── Calendar + interviews ────────────────────────────────────────────────────
// Interview scheduledAt is stored naive-KL-as-UTC, so its raw UTC value already
// reads as the KL wall-clock. All the KL helpers below lean on that.
const KL_OFFSET_MS = 8 * 3600 * 1000;
function klParts(now = new Date()) {
  const w = new Date(now.getTime() + KL_OFFSET_MS);
  return { y: w.getUTCFullYear(), m: w.getUTCMonth(), d: w.getUTCDate(), dow: w.getUTCDay() };
}
/** Naive-KL midnight (for comparing against scheduledAt). */
function naiveKLDayStart(p = klParts()) {
  return new Date(Date.UTC(p.y, p.m, p.d));
}
/** Real-UTC instant of KL midnight (for comparing against real-UTC createdAt). */
function realKLDayStart(p = klParts()) {
  return new Date(Date.UTC(p.y, p.m, p.d) - KL_OFFSET_MS);
}

export interface InterviewEvent {
  id: string; // interview id
  recruitId: string;
  recruitName: string;
  stageName: string;
  scheduledAt: string; // ISO (naive-KL-as-UTC — render with timeZone:UTC)
  location: string | null;
  note: string | null;
}

/** Interviews within an (optional) naive-KL window — drives the Calendar grid. */
export async function getInterviews(fromIso?: string, toIso?: string): Promise<InterviewEvent[]> {
  const where =
    fromIso || toIso
      ? { scheduledAt: { ...(fromIso ? { gte: new Date(fromIso) } : {}), ...(toIso ? { lte: new Date(toIso) } : {}) } }
      : {};
  const rows = await prisma.recInterview.findMany({
    where: { ...where, recruit: { deletedAt: null } },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true, scheduledAt: true, location: true, note: true,
      recruit: { select: { id: true, name: true, stage: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    recruitId: r.recruit.id,
    recruitName: r.recruit.name,
    stageName: r.recruit.stage.name,
    scheduledAt: r.scheduledAt.toISOString(),
    location: r.location,
    note: r.note,
  }));
}

// ─── Library (uploaded resumes) ───────────────────────────────────────────────
export interface ResumeItem {
  id: string;
  recruitId: string;
  recruitName: string;
  stageName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string;
}

/** All uploaded resumes (newest first) — drives the Library page. */
export async function getResumes(): Promise<ResumeItem[]> {
  const rows = await prisma.recResume.findMany({
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedBy: true, uploadedAt: true,
      recruit: { select: { id: true, name: true, deletedAt: true, stage: { select: { name: true } } } },
    },
  });
  return rows
    .filter((r) => r.recruit.deletedAt === null)
    .map((r) => ({
      id: r.id,
      recruitId: r.recruit.id,
      recruitName: r.recruit.name,
      stageName: r.recruit.stage.name,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      uploadedBy: r.uploadedBy,
      uploadedAt: r.uploadedAt.toISOString(),
    }));
}

// ─── Notifications (bell + push) ──────────────────────────────────────────────
export interface RecNotifications {
  /** New candidate cards created today (KL). */
  newToday: { id: string; name: string; stageName: string; at: string }[];
  /** Interviews scheduled for today (KL). */
  interviewsToday: { id: string; recruitId: string; recruitName: string; scheduledAt: string; location: string | null }[];
  /** Interviews scheduled for the rest of this week (Mon–Sun, KL). */
  interviewsThisWeek: { id: string; recruitId: string; recruitName: string; scheduledAt: string }[];
  counts: { newToday: number; interviewsToday: number; interviewsThisWeek: number };
}

/**
 * Day/week notification payload for the bell + push poller. Derived live (no
 * stored notification table) — "seen" state is tracked per-session on the client.
 */
export async function getRecruitmentNotifications(): Promise<RecNotifications> {
  const p = klParts();
  const dayStartReal = realKLDayStart(p);
  const dayEndReal = new Date(dayStartReal.getTime() + 24 * 3600 * 1000);
  const dayStartNaive = naiveKLDayStart(p);
  const dayEndNaive = new Date(dayStartNaive.getTime() + 24 * 3600 * 1000);
  const daysSinceMon = p.dow === 0 ? 6 : p.dow - 1;
  const weekStartNaive = new Date(dayStartNaive.getTime() - daysSinceMon * 24 * 3600 * 1000);
  const weekEndNaive = new Date(weekStartNaive.getTime() + 7 * 24 * 3600 * 1000);

  const [newToday, interviewsToday, interviewsWeek] = await Promise.all([
    prisma.recRecruit.findMany({
      where: { deletedAt: null, createdAt: { gte: dayStartReal, lt: dayEndReal } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, createdAt: true, stage: { select: { name: true } } },
    }),
    prisma.recInterview.findMany({
      where: { recruit: { deletedAt: null }, scheduledAt: { gte: dayStartNaive, lt: dayEndNaive } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, scheduledAt: true, location: true, recruit: { select: { id: true, name: true } } },
    }),
    prisma.recInterview.findMany({
      where: { recruit: { deletedAt: null }, scheduledAt: { gte: weekStartNaive, lt: weekEndNaive } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, scheduledAt: true, recruit: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    newToday: newToday.map((r) => ({ id: r.id, name: r.name, stageName: r.stage.name, at: r.createdAt.toISOString() })),
    interviewsToday: interviewsToday.map((i) => ({
      id: i.id, recruitId: i.recruit.id, recruitName: i.recruit.name,
      scheduledAt: i.scheduledAt.toISOString(), location: i.location,
    })),
    interviewsThisWeek: interviewsWeek.map((i) => ({
      id: i.id, recruitId: i.recruit.id, recruitName: i.recruit.name, scheduledAt: i.scheduledAt.toISOString(),
    })),
    counts: {
      newToday: newToday.length,
      interviewsToday: interviewsToday.length,
      interviewsThisWeek: interviewsWeek.length,
    },
  };
}
