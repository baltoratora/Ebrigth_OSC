import "server-only";
// Training-day attendance workflow. All rec_* data lives in ebright_hrfs.
import { hrfsPrisma as prisma } from "@/lib/hrfs";

// The three induction training stages, in order. Induction is always Saturday;
// with the office closed Sun+Mon, the next training day falls 3 days later
// (Sat → Tue), which is why a card waits 3 days before HR is asked to confirm.
export const TRAINING_CODES = ["TR1", "TR2", "TR3"] as const;
const TRAINING_SET = new Set<string>(TRAINING_CODES);
// Where an attended card advances to. TR3 has no next — it stays put and HR
// moves it on manually.
const NEXT_TRAINING: Record<string, string | undefined> = { TR1: "TR2", TR2: "TR3" };
export const RESCHEDULE_CODE = "RSD";
// A card must sit in a training stage this long before HR is prompted to confirm.
export const CONFIRM_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

interface StageLite { id: string; shortCode: string; name: string }

async function stageMaps(): Promise<{ byCode: Map<string, StageLite>; byId: Map<string, StageLite> }> {
  const stages = await prisma.recStage.findMany({ select: { id: true, shortCode: true, name: true } });
  return {
    byCode: new Map(stages.map((s) => [s.shortCode, s])),
    byId: new Map(stages.map((s) => [s.id, s])),
  };
}

export function isTrainingCode(code: string | null | undefined): boolean {
  return !!code && TRAINING_SET.has(code);
}

export interface PendingConfirmation {
  id: string;
  name: string;
  stageShort: string;
  stageName: string;
  enteredAt: string; // ISO
}
export interface PendingReschedule {
  id: string;
  name: string;
  returnCode: string;
  returnName: string;
}

/** Leads that need HR action right now: attendance to confirm, or a reschedule
 *  date to pick. Drives the dashboard popup. */
export async function getPendingTrainingWork(): Promise<{
  confirmations: PendingConfirmation[];
  reschedulePicks: PendingReschedule[];
}> {
  const { byCode, byId } = await stageMaps();
  const trainingIds = TRAINING_CODES.map((c) => byCode.get(c)?.id).filter(Boolean) as string[];
  const rsd = byCode.get(RESCHEDULE_CODE);
  const cutoff = new Date(Date.now() - CONFIRM_AFTER_MS);

  const confirmRows = trainingIds.length
    ? await prisma.recRecruit.findMany({
        where: {
          deletedAt: null,
          stageId: { in: trainingIds },
          trainingConfirmedAt: null,
          trainingEnteredAt: { not: null, lte: cutoff },
        },
        select: { id: true, name: true, stageId: true, trainingEnteredAt: true },
        orderBy: { trainingEnteredAt: "asc" },
      })
    : [];

  const reschedRows = rsd
    ? await prisma.recRecruit.findMany({
        where: { deletedAt: null, stageId: rsd.id, rescheduleReturnCode: { not: null }, rescheduleAt: null },
        select: { id: true, name: true, rescheduleReturnCode: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return {
    confirmations: confirmRows.map((r) => {
      const st = byId.get(r.stageId);
      return {
        id: r.id,
        name: r.name,
        stageShort: st?.shortCode ?? "",
        stageName: st?.name ?? "",
        enteredAt: r.trainingEnteredAt!.toISOString(),
      };
    }),
    reschedulePicks: reschedRows.map((r) => {
      const rc = r.rescheduleReturnCode!;
      return { id: r.id, name: r.name, returnCode: rc, returnName: byCode.get(rc)?.name ?? rc };
    }),
  };
}

/** Background cron: move any reschedule whose date has arrived back to its
 *  training day and restart its 3-day clock. Best-effort, never throws. */
export async function runTrainingReconcile(): Promise<{ returned: number }> {
  try {
    const { byCode } = await stageMaps();
    const rsd = byCode.get(RESCHEDULE_CODE);
    if (!rsd) return { returned: 0 };
    const due = await prisma.recRecruit.findMany({
      where: {
        deletedAt: null,
        stageId: rsd.id,
        rescheduleReturnCode: { not: null },
        rescheduleAt: { not: null, lte: new Date() },
      },
      select: { id: true, rescheduleReturnCode: true },
    });
    let returned = 0;
    for (const r of due) {
      const target = byCode.get(r.rescheduleReturnCode!);
      if (!target) continue;
      await prisma.$transaction([
        prisma.recRecruit.update({
          where: { id: r.id },
          data: {
            stageId: target.id,
            trainingEnteredAt: new Date(),
            trainingConfirmedAt: null,
            rescheduleAt: null,
            rescheduleReturnCode: null,
          },
        }),
        prisma.recStageHistory.create({
          data: {
            recruitId: r.id,
            fromStageId: rsd.id,
            toStageId: target.id,
            changedBy: "system:reschedule",
            note: "Reschedule date reached — returned to training",
          },
        }),
      ]);
      returned++;
    }
    if (returned) console.log(`[rec-training] returned ${returned} rescheduled lead(s) to training`);
    return { returned };
  } catch (e) {
    console.error("[rec-training] reconcile failed:", (e as Error).message);
    return { returned: 0 };
  }
}

/** Confirm (or deny) a lead's attendance for its current training day.
 *  Attend → advance TR1→TR2→TR3 (TR3 stays); no-show → Reschedule. */
export async function confirmTrainingAttendance(
  recruitId: string,
  attended: boolean,
  changedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const { byCode, byId } = await stageMaps();
  const r = await prisma.recRecruit.findFirst({
    where: { id: recruitId, deletedAt: null },
    select: { id: true, stageId: true },
  });
  if (!r) return { ok: false, error: "Recruit not found" };
  const cur = byId.get(r.stageId);
  if (!cur || !TRAINING_SET.has(cur.shortCode)) return { ok: false, error: "Lead is not in a training stage" };

  if (attended) {
    const nextCode = NEXT_TRAINING[cur.shortCode];
    if (nextCode) {
      const next = byCode.get(nextCode);
      if (!next) return { ok: false, error: `Stage ${nextCode} not configured` };
      await prisma.$transaction([
        prisma.recRecruit.update({
          where: { id: r.id },
          data: { stageId: next.id, trainingEnteredAt: new Date(), trainingConfirmedAt: null },
        }),
        prisma.recStageHistory.create({
          data: { recruitId: r.id, fromStageId: cur.id, toStageId: next.id, changedBy, note: `Attended ${cur.name} — advanced` },
        }),
      ]);
    } else {
      // TR3 attended → stays; just mark confirmed so it stops prompting.
      await prisma.recRecruit.update({ where: { id: r.id }, data: { trainingConfirmedAt: new Date() } });
    }
  } else {
    const rsd = byCode.get(RESCHEDULE_CODE);
    if (!rsd) return { ok: false, error: "Reschedule stage not configured" };
    await prisma.$transaction([
      prisma.recRecruit.update({
        where: { id: r.id },
        // Remember which training day to send them back to; date picked next.
        data: { stageId: rsd.id, rescheduleReturnCode: cur.shortCode, rescheduleAt: null },
      }),
      prisma.recStageHistory.create({
        data: { recruitId: r.id, fromStageId: cur.id, toStageId: rsd.id, changedBy, note: `No-show ${cur.name} — awaiting reschedule` },
      }),
    ]);
  }
  return { ok: true };
}

/** Set the reschedule date for a training no-show sitting in Reschedule. */
export async function setTrainingRescheduleDate(
  recruitId: string,
  dateISO: string,
): Promise<{ ok: boolean; error?: string }> {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date" };
  const r = await prisma.recRecruit.findFirst({
    where: { id: recruitId, deletedAt: null },
    select: { id: true, rescheduleReturnCode: true },
  });
  if (!r) return { ok: false, error: "Recruit not found" };
  if (!r.rescheduleReturnCode) return { ok: false, error: "This lead isn't a training reschedule" };
  await prisma.recRecruit.update({ where: { id: r.id }, data: { rescheduleAt: d } });
  return { ok: true };
}
