import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["jnr", "mdr", "snr"]);

type RouteParams = { params: Promise<{ level: string; grade: string; chapter: string }> };

function parseParams(
  raw: { level: string; grade: string; chapter: string },
): { level: string; grade: number; chapter: number } | null {
  const level = raw.level?.toLowerCase();
  const grade = Number(raw.grade);
  const chapter = Number(raw.chapter);
  if (!LEVELS.has(level)) return null;
  if (!Number.isInteger(grade) || grade < 1 || grade > 8) return null;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 12) return null;
  return { level, grade, chapter };
}

// GET — fetch the stored Tiptap JSON for this chapter. Returns null content if
// the row doesn't exist yet (first edit will create it).
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const raw = await params;
  const parsed = parseParams(raw);
  if (!parsed) return NextResponse.json({ error: "Invalid params" }, { status: 400 });

  const row = await prisma.academy_chapter_content.findUnique({
    where: {
      level_grade_chapter: {
        level: parsed.level,
        grade: parsed.grade,
        chapter: parsed.chapter,
      },
    },
    select: { content: true, updatedAt: true, updatedBy: true },
  });

  return NextResponse.json({
    content: row?.content ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  });
}

// PUT — upsert the content. Authenticated users only.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const raw = await params;
  const parsed = parseParams(raw);
  if (!parsed) return NextResponse.json({ error: "Invalid params" }, { status: 400 });

  let body: { content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "content (object) required" }, { status: 400 });
  }

  const row = await prisma.academy_chapter_content.upsert({
    where: {
      level_grade_chapter: {
        level: parsed.level,
        grade: parsed.grade,
        chapter: parsed.chapter,
      },
    },
    create: {
      level: parsed.level,
      grade: parsed.grade,
      chapter: parsed.chapter,
      content: body.content as object,
      updatedBy: session.user.email,
    },
    update: {
      content: body.content as object,
      updatedBy: session.user.email,
    },
    select: { updatedAt: true, updatedBy: true },
  });

  return NextResponse.json({ ok: true, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
}
