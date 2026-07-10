import { NextResponse } from "next/server";
import { fetchAllStudents } from "@fa/_lib/students.server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { students, report } = await fetchAllStudents();
    return NextResponse.json({ students, report });
  } catch (err) {
    console.error("[/api/students] failed:", err);
    const e = err as { message?: string; code?: string };
    return NextResponse.json(
      { error: "Failed to load students", detail: e?.message ?? String(err), code: e?.code },
      { status: 500 },
    );
  }
}
