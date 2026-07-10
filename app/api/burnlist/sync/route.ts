import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pool as faPool } from "@/app/fa-system/_lib/db";
import { requireRole } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import { currentWeekWednesday } from "@/lib/burnlist-week";

export const dynamic = "force-dynamic";

/** True only on Wednesday in Asia/Kuala_Lumpur (UTC+8). */
function isMalaysiaWednesday(): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "long",
  }).format(new Date());
  return weekday === "Wednesday";
}

interface StudentRecord {
  id: number;
  name: string;
  branch: string | null;
  expiry: string | null;
}

/**
 * POST /api/burnlist/sync
 *
 * Re-syncs the CURRENT week's burnlist with live studentrecords.
 * SUPER_ADMIN only, Wednesdays only (Malaysia time).
 *
 * HARD mirror of AONE — per user request 2026-06-18:
 *   - Students in AONE but not in burnlist → INSERT (new expired students)
 *   - Students in burnlist but not in AONE → DELETE — ALWAYS, even if the
 *     entry has cta / remarks / done filled in. The burnlist must match
 *     AONE exactly after sync. (We used to keep edited rows as "history"
 *     but that confused users who expected a clean refresh.)
 *   - Students in BOTH → KEEP existing entry (preserve cta/remarks/done),
 *     only update studentName / branch / expiryDate to match AONE.
 */
export async function POST() {
  const auth = await requireRole([ROLES.SUPER_ADMIN]);
  if (auth.error) return auth.error;

  if (!isMalaysiaWednesday()) {
    return NextResponse.json(
      {
        error:
          "Sync is only available on Wednesdays (Malaysia time) to protect Wed-Sat edits.",
      },
      { status: 403 },
    );
  }

  try {
    const weekKey = currentWeekWednesday();

    // Pull live source from ebrightleads_db.studentrecords. Strict-less-than
    // on the Wednesday date — same-day expiries are not yet "expired" from
    // the user's POV (see memory: project-burnlist-same-day-expiry-rule).
    const { rows: srcRows } = await faPool.query<StudentRecord>(
      `SELECT id, name, branch,
              TO_CHAR(credit_expiry_date, 'YYYY-MM-DD') AS expiry
         FROM studentrecords
        WHERE package_status = 'Expired'
          AND status = 'Active'
          AND name IS NOT NULL
          AND TRIM(name) <> ''
          AND credit_expiry_date IS NOT NULL
          AND credit_expiry_date < $1::date`,
      [weekKey],
    );

    // Ensure the week exists (create if first sync of the day)
    const week = await prisma.burnlistWeek.upsert({
      where: { weekKey },
      create: { weekKey },
      update: {},
    });

    const existing = await prisma.burnlistEntry.findMany({
      where: { weekId: week.id },
      select: { id: true, studentRecordId: true },
    });
    const existingByStudentId = new Map(existing.map((e) => [e.studentRecordId, e.id]));
    const srcByStudentId = new Map(srcRows.map((r) => [String(r.id), r]));

    let added = 0;
    let updated = 0;
    let removed = 0;

    // 1) Add or update entries matching live source
    for (const r of srcRows) {
      const sid = String(r.id);
      const entryId = existingByStudentId.get(sid);
      if (entryId) {
        await prisma.burnlistEntry.update({
          where: { id: entryId },
          data: {
            studentName: r.name,
            branch: r.branch ?? "",
            expiryDate: r.expiry ?? "",
          },
        });
        updated++;
      } else {
        await prisma.burnlistEntry.create({
          data: {
            weekId: week.id,
            studentRecordId: sid,
            studentName: r.name,
            branch: r.branch ?? "",
            expiryDate: r.expiry ?? "",
          },
        });
        added++;
      }
    }

    // 2) Remove every entry that no longer matches the live AONE source.
    // Unconditional — cta / remarks / done get wiped along with the row.
    // Sync = mirror AONE; the burnlist must look like AONE after this runs.
    const toRemove = existing.filter((e) => !srcByStudentId.has(e.studentRecordId));
    if (toRemove.length > 0) {
      const deleted = await prisma.burnlistEntry.deleteMany({
        where: { id: { in: toRemove.map((e) => e.id) } },
      });
      removed = deleted.count;
    }

    return NextResponse.json({
      ok: true,
      weekKey,
      summary: {
        liveCount: srcRows.length,
        added,
        updated,
        removed,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
