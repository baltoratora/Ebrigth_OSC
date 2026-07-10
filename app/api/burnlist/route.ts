import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentWeekWednesday, isValidWeekKey } from "@/lib/burnlist-week";
import { ensureWeekSnapshot } from "@/lib/burnlist-snapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/burnlist?week=YYYY-MM-DD
 *
 * Returns the burnlist entries for the requested week + the list of all
 * available weeks (for the date dropdown). If no week is given, defaults to
 * the current Wednesday. Auto-creates the current Wednesday snapshot the
 * first time it's requested.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedWeek = url.searchParams.get("week") ?? "";
    const currentWeek = currentWeekWednesday();
    const weekKey =
      requestedWeek && isValidWeekKey(requestedWeek) ? requestedWeek : currentWeek;

    // Auto-create the snapshot only when the user is looking at the current
    // Wednesday. Past weeks return whatever the DB has (possibly empty).
    if (weekKey === currentWeek) {
      await ensureWeekSnapshot(weekKey);
    }

    const week = await prisma.burnlistWeek.findUnique({
      where: { weekKey },
      include: {
        entries: {
          orderBy: [{ branch: "asc" }, { expiryDate: "desc" }, { studentName: "asc" }],
        },
      },
    });

    // Available weeks for the date picker — newest first.
    const allWeeks = await prisma.burnlistWeek.findMany({
      select: { weekKey: true },
      orderBy: { weekKey: "desc" },
    });

    return NextResponse.json({
      weekKey,
      currentWeek,
      availableWeeks: allWeeks.map((w) => w.weekKey),
      entries: (week?.entries ?? []).map((e) => ({
        id: e.id,
        studentRecordId: e.studentRecordId,
        studentName: e.studentName,
        branch: e.branch,
        expiryDate: e.expiryDate,
        cta: e.cta,
        remarks: e.remarks,
        done: e.done,
        updatedAt: e.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
