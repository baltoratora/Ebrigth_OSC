import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/auth";
import { ROLES, isSuperAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";

const ALLOWED_CTA = new Set(["", "Extend", "Archive", "Renew", "No Action"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/burnlist/entry/[id]
 *
 * Editable fields:
 *   • Any role: `cta`, `remarks`
 *   • SUPER_ADMIN only: `studentName`, `done`, `branch`, `expiryDate`
 *
 * Body is shape-checked. Non-super-admins sending a privileged field get 403.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  const role = (auth.session.user as { role?: unknown } | undefined)?.role;
  const superAdmin = isSuperAdmin(role);

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};

    // Universally editable fields
    if (typeof body.cta === "string") {
      if (!ALLOWED_CTA.has(body.cta)) {
        return NextResponse.json({ error: `Invalid cta value: ${body.cta}` }, { status: 400 });
      }
      patch.cta = body.cta;
    }
    if (typeof body.remarks === "string") patch.remarks = body.remarks;

    // SUPER_ADMIN-only fields
    const privilegedFields = ["done", "studentName", "branch", "expiryDate"] as const;
    for (const field of privilegedFields) {
      if (body[field] === undefined) continue;
      if (!superAdmin) {
        return NextResponse.json(
          { error: `Forbidden: only SUPER_ADMIN can edit '${field}'` },
          { status: 403 },
        );
      }
      if (field === "done") {
        if (typeof body.done !== "boolean") {
          return NextResponse.json({ error: "'done' must be boolean" }, { status: 400 });
        }
        patch.done = body.done;
      } else {
        if (typeof body[field] !== "string") {
          return NextResponse.json({ error: `'${field}' must be a string` }, { status: 400 });
        }
        patch[field] = body[field];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No editable fields in body" }, { status: 400 });
    }

    const updated = await prisma.burnlistEntry.update({
      where: { id },
      data: patch,
    });

    return NextResponse.json({
      entry: {
        id: updated.id,
        studentRecordId: updated.studentRecordId,
        studentName: updated.studentName,
        branch: updated.branch,
        expiryDate: updated.expiryDate,
        cta: updated.cta,
        remarks: updated.remarks,
        done: updated.done,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("P2025") || message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/burnlist/entry/[id]
 * SUPER_ADMIN only.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const auth = await requireRole([ROLES.SUPER_ADMIN]);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    await prisma.burnlistEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("P2025") || message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
