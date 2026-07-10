import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pool } from "@/app/fa-system/_lib/db";

interface Ctx { params: Promise<{ id: string }> }

interface FaStudentRow {
  id: number;
  name: string | null;
  status: string | null;
  branch: string | null;
  grade_chapter: string | null;
  guardian_name: string | null;
  guardian_mobile: string | null;
  age_group: string | null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  const search = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const branch = req.nextUrl.searchParams.get("branch")?.trim() ?? "";

  try {
    // Get FA student IDs already registered for this edition
    const registered = await prisma.showcaseParticipant.findMany({
      where: { editionId: id, faStudentId: { not: null } },
      select: { faStudentId: true },
    });
    const registeredIds = new Set(registered.map(r => r.faStudentId));

    const whereParts: string[] = ["status = 'Active'"];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      whereParts.push(`name ILIKE $${params.length}`);
    }
    if (branch) {
      params.push(branch);
      whereParts.push(`branch = $${params.length}`);
    }

    const rows = await pool.query<FaStudentRow>(
      `SELECT id, name, status, branch, grade_chapter, guardian_name, guardian_mobile, age_group
       FROM studentrecords
       WHERE ${whereParts.join(" AND ")}
       ORDER BY name ASC
       LIMIT 200`,
      params,
    );

    const students = rows.rows
      .filter(r => !registeredIds.has(String(r.id)))
      .map(r => ({
        id:          String(r.id),
        name:        r.name ?? "",
        branch:      r.branch ?? "",
        grade:       r.grade_chapter ?? "",
        ageCategory: r.age_group ?? "",
        parentName:  r.guardian_name ?? "",
        parentPhone: r.guardian_mobile ?? "",
      }));

    return NextResponse.json({ students });
  } catch (err) {
    console.error("GET fa-students error:", err);
    return NextResponse.json({ error: "Failed to fetch FA students" }, { status: 500 });
  }
}
