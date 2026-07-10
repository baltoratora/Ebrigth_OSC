"use server";

import { revalidatePath } from "next/cache";
import { requireRecruitmentAccess } from "@/lib/recruitment/access";
import {
  getPendingTrainingWork,
  confirmTrainingAttendance,
  setTrainingRescheduleDate,
  type PendingConfirmation,
  type PendingReschedule,
} from "@/lib/recruitment/training";

export interface TrainingResult {
  ok: boolean;
  error?: string;
}

/** Pending attendance confirmations + reschedule-date picks (drives the popup). */
export async function fetchPendingTrainingWork(): Promise<{
  ok: boolean;
  confirmations: PendingConfirmation[];
  reschedulePicks: PendingReschedule[];
}> {
  try {
    await requireRecruitmentAccess();
    const work = await getPendingTrainingWork();
    return { ok: true, ...work };
  } catch {
    return { ok: false, confirmations: [], reschedulePicks: [] };
  }
}

function revalidate() {
  revalidatePath("/recruitment/opportunity");
  revalidatePath("/recruitment/dashboard");
}

/** HR confirms a lead attended (advance) or was a no-show (→ Reschedule). */
export async function confirmAttendance(recruitId: string, attended: boolean): Promise<TrainingResult> {
  try {
    const { userId } = await requireRecruitmentAccess();
    const res = await confirmTrainingAttendance(recruitId, attended, userId);
    if (res.ok) revalidate();
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** HR picks the reschedule date for a training no-show. */
export async function pickRescheduleDate(recruitId: string, dateISO: string): Promise<TrainingResult> {
  try {
    await requireRecruitmentAccess();
    const res = await setTrainingRescheduleDate(recruitId, dateISO);
    if (res.ok) revalidate();
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
