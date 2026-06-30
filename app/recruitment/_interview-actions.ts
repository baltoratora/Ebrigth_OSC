"use server";

import { revalidatePath } from "next/cache";
// Recruitment lives in the ebright_hrfs database — use the HRFS client.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
import {
  requireRecruitmentAccess,
  stageIdByShortCode,
  klWallClock,
} from "@/lib/recruitment/access";

export interface InterviewResult {
  ok: boolean;
  error?: string;
}

/**
 * Schedule (or reschedule) an interview for a recruit and move the card into
 * the "Interview Date (ID)" stage. Fired by the drag-to-ID popup. `date` is
 * "YYYY-MM-DD", `time` is "HH:mm" (24h). One interview per recruit — re-running
 * updates the existing row.
 */
export async function scheduleInterview(
  recruitId: string,
  date: string,
  time: string,
  extra?: { location?: string | null; note?: string | null },
): Promise<InterviewResult> {
  try {
    const { userId } = await requireRecruitmentAccess();
    const scheduledAt = klWallClock(date, time);

    const recruit = await prisma.recRecruit.findFirst({
      where: { id: recruitId, deletedAt: null },
      select: { id: true, stageId: true },
    });
    if (!recruit) return { ok: false, error: "Recruit not found" };

    const idStageId = await stageIdByShortCode("ID");
    if (!idStageId) return { ok: false, error: 'Stage "Interview Date (ID)" not found' };

    await prisma.$transaction(async (tx) => {
      await tx.recInterview.upsert({
        where: { recruitId },
        create: {
          recruitId,
          scheduledAt,
          location: extra?.location ?? null,
          note: extra?.note ?? null,
          createdBy: userId,
        },
        update: {
          scheduledAt,
          location: extra?.location ?? undefined,
          note: extra?.note ?? undefined,
        },
      });
      // Move into ID only if it isn't already there (records the transition).
      if (recruit.stageId !== idStageId) {
        await tx.recRecruit.update({ where: { id: recruitId }, data: { stageId: idStageId } });
        await tx.recStageHistory.create({
          data: { recruitId, fromStageId: recruit.stageId, toStageId: idStageId, changedBy: userId, note: "Interview scheduled" },
        });
      }
    });

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to schedule interview" };
  }
}

/** Edit an existing interview's date/time (Calendar page). Does not change stage. */
export async function updateInterview(
  interviewId: string,
  date: string,
  time: string,
  extra?: { location?: string | null; note?: string | null },
): Promise<InterviewResult> {
  try {
    await requireRecruitmentAccess();
    const scheduledAt = klWallClock(date, time);
    await prisma.recInterview.update({
      where: { id: interviewId },
      data: {
        scheduledAt,
        location: extra?.location ?? undefined,
        note: extra?.note ?? undefined,
      },
    });
    revalidatePath("/recruitment/calendar");
    revalidatePath("/recruitment/opportunity");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update interview" };
  }
}

/** Cancel/remove an interview (Calendar page). */
export async function deleteInterview(interviewId: string): Promise<InterviewResult> {
  try {
    await requireRecruitmentAccess();
    await prisma.recInterview.delete({ where: { id: interviewId } });
    revalidatePath("/recruitment/calendar");
    revalidatePath("/recruitment/opportunity");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete interview" };
  }
}
