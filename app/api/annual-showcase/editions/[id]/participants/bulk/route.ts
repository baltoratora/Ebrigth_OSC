import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

interface BulkRow {
  fullName: string;
  dateOfBirth?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  isEbrighter?: boolean;
  branch?: string;
}

function parseDDMMYYYY(raw: string): Date | null {
  const parts = raw.trim().split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const d = new Date(`${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body = await req.json() as { participants?: BulkRow[] };
    const rows = body.participants;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No participants provided" }, { status: 400 });
    }

    // Fetch existing for duplicate detection (name + dob)
    const existing = await prisma.showcaseParticipant.findMany({
      where: { editionId: id },
      select: { fullName: true, dateOfBirth: true },
    });
    const existingKeys = new Set(
      existing.map(p => `${p.fullName.toLowerCase().trim()}|${p.dateOfBirth?.toISOString().split("T")[0] ?? ""}`)
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = row.fullName?.trim();
      if (!name) { errors.push("Row missing name"); continue; }

      let dob: Date | undefined;
      if (row.dateOfBirth?.trim()) {
        const parsed = parseDDMMYYYY(row.dateOfBirth);
        if (!parsed) {
          errors.push(`"${name}": invalid date "${row.dateOfBirth}" — expected DD/MM/YYYY`);
          continue;
        }
        dob = parsed;
      }

      const key = `${name.toLowerCase()}|${dob?.toISOString().split("T")[0] ?? ""}`;
      if (existingKeys.has(key)) { skipped++; continue; }

      try {
        await prisma.showcaseParticipant.create({
          data: {
            editionId:    id,
            fullName:     name,
            dateOfBirth:  dob,
            parentName:   row.parentName   || undefined,
            parentEmail:  row.parentEmail  || undefined,
            parentPhone:  row.parentPhone  || undefined,
            isEbrighter:  row.isEbrighter  ?? false,
            paymentStatus: "UNPAID",
          },
        });
        existingKeys.add(key);
        created++;
      } catch {
        errors.push(`"${name}": failed to insert`);
      }
    }

    return NextResponse.json({ created, skipped, errors });
  } catch (err) {
    console.error("POST /participants/bulk error:", err);
    return NextResponse.json({ error: "Failed to bulk import" }, { status: 500 });
  }
}
