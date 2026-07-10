import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import { isValidWeekKey } from "@/lib/burnlist-week";

export const dynamic = "force-dynamic";

/**
 * POST /api/burnlist/entry
 * Body: { weekKey: string, branch: string }
 *
 * Adds a manual (ad-hoc) entry to the given week. studentRecordId is a
 * synthetic "manual-<hex>" id so it never collides with real studentrecords
 * ids. SUPER_ADMIN only.
 */
export async function POST(req: Request) {
  const auth = await requireRole([ROLES.SUPER_ADMIN]);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json().catch(() => ({}))) as { weekKey?: unknown; branch?: unknown };

    if (typeof body.weekKey !== "string" || !isValidWeekKey(body.weekKey)) {
      return NextResponse.json({ error: "weekKey (YYYY-MM-DD) is required" }, { status: 400 });
    }
    if (typeof body.branch !== "string" || !body.branch.trim()) {
      return NextResponse.json({ error: "branch is required" }, { status: 400 });
    }

    const week = await prisma.burnlistWeek.findUnique({ where: { weekKey: body.weekKey } });
    if (!week) return NextResponse.json({ error: "Week not found" }, { status: 404 });

    const studentRecordId = `manual-${randomBytes(8).toString("hex")}`;

    const entry = await prisma.burnlistEntry.create({
      data: {
        weekId: week.id,
        studentRecordId,
        studentName: "",
        branch: body.branch.trim().toUpperCase(),
        expiryDate: "",
      },
    });

    return NextResponse.json({
      entry: {
        id: entry.id,
        studentRecordId: entry.studentRecordId,
        studentName: entry.studentName,
        branch: entry.branch,
        expiryDate: entry.expiryDate,
        cta: entry.cta,
        remarks: entry.remarks,
        done: entry.done,
        updatedAt: entry.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
