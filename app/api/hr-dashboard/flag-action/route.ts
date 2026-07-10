import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireRole } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Records that HR has completed an escalation action (verbal warning / email /
// show-cause) for a flagged employee in a given month. Keyed by (emp, month,
// tier) so each escalation step is tracked independently — completing "verbal"
// at 2 days doesn't clear the "email" step that appears once they hit 3.
const TIERS = ["verbal", "email", "show_cause"];

async function ensureTable(): Promise<void> {
  await hrfsPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.flagged_action_log (
      emp_code     text NOT NULL,
      action_month text NOT NULL,           -- YYYY-MM
      tier         text NOT NULL,           -- verbal | email | show_cause
      completed_by text,
      completed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (emp_code, action_month, tier)
    )`);
}

// POST { code, month:"YYYY-MM", tier:"verbal|email|show_cause", undo?:boolean }
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  try {
    const body = await req.json();
    const code = String(body?.code || "").trim();
    const month = String(body?.month || "").trim();
    const tier = String(body?.tier || "").trim();
    if (!code || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !TIERS.includes(tier)) {
      return NextResponse.json({ error: "code, month (YYYY-MM) and valid tier are required" }, { status: 400 });
    }
    await ensureTable();

    if (body?.undo === true) {
      await hrfsPrisma.$executeRawUnsafe(
        `DELETE FROM public.flagged_action_log WHERE emp_code=$1 AND action_month=$2 AND tier=$3`,
        code, month, tier,
      );
      return NextResponse.json({ ok: true, completed: false });
    }

    const by = (session.user as { email?: string | null; name?: string | null })?.email
      || (session.user as { name?: string | null })?.name || "unknown";
    await hrfsPrisma.$executeRawUnsafe(
      `INSERT INTO public.flagged_action_log (emp_code, action_month, tier, completed_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (emp_code, action_month, tier)
       DO UPDATE SET completed_by = EXCLUDED.completed_by, completed_at = now()`,
      code, month, tier, by,
    );
    return NextResponse.json({ ok: true, completed: true });
  } catch (err) {
    console.error("[api/hr-dashboard/flag-action POST] failed:", err);
    return NextResponse.json({ error: "Failed to save action" }, { status: 500 });
  }
}
