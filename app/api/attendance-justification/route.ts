import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import { isEmployee } from "@/lib/roles";
import { uploadToGoogleDrive, isGoogleDriveConfigured } from "@/lib/googleDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attendance justification — why a "missing" employee was absent on a given day.
//
// Storage: public.attendance_justification in ebright_hrfs (one row per
// emp_no + just_date, upserted). A justified person moves out of the Missing
// box into the Justify box on the Attendance dashboard. Evidence files (optional)
// are uploaded to Google Drive and only the shareable link is stored.
//
//   GET    ?date=YYYY-MM-DD              → all justifications for that date
//   GET    ?empNo=&month=&year=          → one employee's justifications for the month
//   POST   { action: "justify", ... }    → HR/admin creates/updates a justification (auto-approved)
//   POST   { action: "self", ... }       → FT/PT employee submits a reason for their OWN
//                                           record (status starts "pending")
//   POST   { action: "review", ... }     → HR/admin approves/rejects a pending submission
//   DELETE ?empNo=&date=                 → remove a justification (back to Missing) — HR/admin
//
// Reads are open to any signed-in user (the dashboard is already role-gated by
// page middleware). HR-authored writes (justify/review/delete) require a
// cross-branch role. Self-submission requires the FT/PT employee role and is
// always scoped to the CALLER's own record — the body's empNo is ignored for
// that action, resolved server-side from session.user.email instead.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface JustRow {
  emp_no: string;
  branch: string | null;
  emp_name: string | null;
  just_date: string;
  reason: string | null;
  evidence_url: string | null;
  evidence_name: string | null;
  justified_by: string | null;
  status: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

function toClient(r: JustRow) {
  return {
    empNo: r.emp_no,
    branch: r.branch,
    empName: r.emp_name,
    date: r.just_date,
    reason: r.reason,
    evidenceUrl: r.evidence_url,
    evidenceName: r.evidence_name,
    justifiedBy: r.justified_by,
    // Existing rows created before this column existed default to "approved"
    // at the DB level (see ensureReviewColumns) — HR writing a justification
    // directly has always been immediately authoritative.
    status: r.status ?? "approved",
    submittedBy: r.submitted_by,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  };
}

let columnsEnsured: Promise<void> | null = null;
function ensureReviewColumns(): Promise<void> {
  if (!columnsEnsured) {
    columnsEnsured = hrfsPrisma.$executeRawUnsafe(`
      ALTER TABLE public.attendance_justification
        ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'approved',
        ADD COLUMN IF NOT EXISTS submitted_by text,
        ADD COLUMN IF NOT EXISTS reviewed_by  text,
        ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz
    `).then(() => undefined).catch((err) => {
      columnsEnsured = null;
      throw err;
    });
  }
  return columnsEnsured;
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureReviewColumns();
    const date = req.nextUrl.searchParams.get("date") ?? "";
    const empNo = req.nextUrl.searchParams.get("empNo") ?? "";
    const month = req.nextUrl.searchParams.get("month") ?? "";
    const year = req.nextUrl.searchParams.get("year") ?? "";

    if (DATE_RE.test(date)) {
      const rows = await hrfsPrisma.$queryRawUnsafe<JustRow[]>(
        `SELECT emp_no, branch, emp_name, to_char(just_date,'YYYY-MM-DD') AS just_date,
                reason, evidence_url, evidence_name, justified_by,
                status, submitted_by, reviewed_by, reviewed_at
           FROM public.attendance_justification
          WHERE just_date = $1::date
          ORDER BY emp_name ASC`,
        date,
      );
      return NextResponse.json({ justifications: rows.map(toClient) });
    }

    if (empNo && month && year) {
      const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
      const rows = await hrfsPrisma.$queryRawUnsafe<JustRow[]>(
        `SELECT emp_no, branch, emp_name, to_char(just_date,'YYYY-MM-DD') AS just_date,
                reason, evidence_url, evidence_name, justified_by,
                status, submitted_by, reviewed_by, reviewed_at
           FROM public.attendance_justification
          WHERE emp_no = $1
            AND just_date >= $2::date
            AND just_date <  ($2::date + interval '1 month')
          ORDER BY just_date ASC`,
        empNo, firstOfMonth,
      );
      return NextResponse.json({ justifications: rows.map(toClient) });
    }

    return NextResponse.json({ error: "date, or empNo+month+year, is required" }, { status: 400 });
  } catch (err) {
    console.error("GET /api/attendance-justification error:", err);
    return NextResponse.json({ error: "Failed to load justifications" }, { status: 500 });
  }
}

async function handleEvidence(body: Record<string, unknown>, empNo: string, date: string) {
  let evidenceUrl: string | null = null;
  let evidenceName: string | null = null;
  if (body.evidenceBase64) {
    if (!isGoogleDriveConfigured()) {
      throw new EvidenceError("Evidence upload needs Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID). Submit a reason instead, or set up Drive.");
    }
    const mime = String(body.evidenceMime ?? "application/octet-stream");
    const ext = (String(body.evidenceName ?? "").match(/\.[A-Za-z0-9]+$/)?.[0]) ?? "";
    const safe = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "x";
    const fileName = `justify-${safe(empNo)}-${date}-${Date.now()}${ext}`;
    const { webViewLink } = await uploadToGoogleDrive(String(body.evidenceBase64), fileName, mime);
    evidenceUrl = webViewLink;
    evidenceName = body.evidenceName ? String(body.evidenceName).slice(0, 200) : fileName;
  }
  return { evidenceUrl, evidenceName };
}
class EvidenceError extends Error {}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    await ensureReviewColumns();
    const body = await req.json();
    const action = String(body?.action ?? "justify");

    // ── HR/admin review of a pending self-submission ────────────────────────
    if (action === "review") {
      if (!canSeeAllBranches(session)) {
        return NextResponse.json({ error: "Only HR / admin can review a submission" }, { status: 403 });
      }
      const empNo = String(body.empNo ?? "").trim();
      const date = String(body.date ?? "").trim();
      const decision = String(body.decision ?? "").trim();
      if (!empNo || !DATE_RE.test(date)) {
        return NextResponse.json({ error: "empNo and date (YYYY-MM-DD) are required" }, { status: 400 });
      }
      if (decision !== "approved" && decision !== "rejected") {
        return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
      }
      const reviewedBy =
        (session.user as { email?: string | null; name?: string | null })?.email ||
        (session.user as { name?: string | null })?.name || "unknown";
      const affected = await hrfsPrisma.$executeRawUnsafe(
        `UPDATE public.attendance_justification
            SET status = $1, reviewed_by = $2, reviewed_at = now()
          WHERE emp_no = $3 AND just_date = $4::date`,
        decision, reviewedBy, empNo, date,
      );
      if (affected === 0) return NextResponse.json({ error: "No submission found for that day" }, { status: 404 });
      return NextResponse.json({ ok: true, status: decision });
    }

    // ── FT/PT employee self-submitting a reason for their own record ────────
    if (action === "self") {
      if (!isEmployee((session.user as { role?: unknown })?.role)) {
        return NextResponse.json({ error: "Only Full-Time / Part-Time employees can self-submit" }, { status: 403 });
      }
      const sessionEmail = (session.user as { email?: string | null })?.email;
      if (!sessionEmail) return NextResponse.json({ error: "No email on this account" }, { status: 400 });

      // Never trust a client-supplied empNo for self-service — always resolve
      // from the caller's own session, so nobody can submit on someone else's
      // behalf just by editing the request body.
      const self = await hrfsPrisma.branchStaff.findFirst({
        where: { email: { equals: sessionEmail, mode: "insensitive" }, status: "Active" },
        select: { employeeId: true, name: true, branch: true },
      });
      if (!self?.employeeId) return NextResponse.json({ error: "No active staff record found for your account" }, { status: 404 });

      const date = String(body.date ?? "").trim();
      const reason = body.reason ? String(body.reason).trim().slice(0, 1000) : null;
      if (!DATE_RE.test(date)) return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });

      let evidenceUrl: string | null = null;
      let evidenceName: string | null = null;
      try {
        ({ evidenceUrl, evidenceName } = await handleEvidence(body, self.employeeId, date));
      } catch (e) {
        if (e instanceof EvidenceError) return NextResponse.json({ error: e.message }, { status: 503 });
        throw e;
      }
      if (!reason && !evidenceUrl) {
        return NextResponse.json({ error: "Provide a reason or upload evidence" }, { status: 400 });
      }

      const existing = await hrfsPrisma.$queryRawUnsafe<{ status: string | null }[]>(
        `SELECT status FROM public.attendance_justification WHERE emp_no = $1 AND just_date = $2::date`,
        self.employeeId, date,
      );
      if (existing[0]?.status === "approved") {
        return NextResponse.json({ error: "This day is already justified by HR." }, { status: 409 });
      }

      await hrfsPrisma.$executeRawUnsafe(
        `INSERT INTO public.attendance_justification
           (emp_no, branch, emp_name, just_date, reason, evidence_url, evidence_name, justified_by, status, submitted_by, reviewed_by, reviewed_at, updated_at)
         VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,'pending',$8,NULL,NULL, now())
         ON CONFLICT (emp_no, just_date) DO UPDATE SET
           reason        = COALESCE(EXCLUDED.reason, attendance_justification.reason),
           evidence_url  = COALESCE(EXCLUDED.evidence_url, attendance_justification.evidence_url),
           evidence_name = COALESCE(EXCLUDED.evidence_name, attendance_justification.evidence_name),
           status        = 'pending',
           submitted_by  = EXCLUDED.submitted_by,
           reviewed_by   = NULL,
           reviewed_at   = NULL,
           updated_at    = now()`,
        self.employeeId, self.branch, self.name, date, reason, evidenceUrl, evidenceName, sessionEmail,
      );

      return NextResponse.json({ ok: true, status: "pending" });
    }

    // ── Default: HR/admin justifies on someone else's behalf (auto-approved) ─
    if (!canSeeAllBranches(session)) {
      return NextResponse.json({ error: "Only HR / admin can justify attendance" }, { status: 403 });
    }

    const empNo = String(body.empNo ?? "").trim();
    const date = String(body.date ?? "").trim();
    const reason = body.reason ? String(body.reason).trim() : null;
    const branch = body.branch ? String(body.branch).trim() : null;
    const empName = body.empName ? String(body.empName).trim() : null;

    if (!empNo || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "empNo and date (YYYY-MM-DD) are required" }, { status: 400 });
    }

    let evidenceUrl: string | null = null;
    let evidenceName: string | null = null;
    try {
      ({ evidenceUrl, evidenceName } = await handleEvidence(body, empNo, date));
    } catch (e) {
      if (e instanceof EvidenceError) return NextResponse.json({ error: e.message }, { status: 503 });
      throw e;
    }

    if (!reason && !evidenceUrl) {
      return NextResponse.json({ error: "Provide a reason or upload evidence" }, { status: 400 });
    }

    const justifiedBy =
      (session.user as { email?: string | null; name?: string | null })?.email ||
      (session.user as { name?: string | null })?.name ||
      "unknown";

    // Upsert. On update, keep an existing reason/evidence when this request
    // doesn't supply a new one (so adding evidence later doesn't wipe the reason).
    // HR writing directly is immediately authoritative — always "approved".
    await hrfsPrisma.$executeRawUnsafe(
      `INSERT INTO public.attendance_justification
         (emp_no, branch, emp_name, just_date, reason, evidence_url, evidence_name, justified_by, status, reviewed_by, reviewed_at, updated_at)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,'approved',$8, now(), now())
       ON CONFLICT (emp_no, just_date) DO UPDATE SET
         branch        = COALESCE(EXCLUDED.branch, attendance_justification.branch),
         emp_name      = COALESCE(EXCLUDED.emp_name, attendance_justification.emp_name),
         reason        = COALESCE(EXCLUDED.reason, attendance_justification.reason),
         evidence_url  = COALESCE(EXCLUDED.evidence_url, attendance_justification.evidence_url),
         evidence_name = COALESCE(EXCLUDED.evidence_name, attendance_justification.evidence_name),
         justified_by  = EXCLUDED.justified_by,
         status        = 'approved',
         reviewed_by   = EXCLUDED.justified_by,
         reviewed_at   = now(),
         updated_at    = now()`,
      empNo, branch, empName, date, reason, evidenceUrl, evidenceName, justifiedBy,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/attendance-justification error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save justification" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  if (!canSeeAllBranches(session)) {
    return NextResponse.json({ error: "Only HR / admin can change attendance justification" }, { status: 403 });
  }

  const empNo = (req.nextUrl.searchParams.get("empNo") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!empNo || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "empNo and date (YYYY-MM-DD) are required" }, { status: 400 });
  }
  try {
    await hrfsPrisma.$executeRawUnsafe(
      `DELETE FROM public.attendance_justification WHERE emp_no = $1 AND just_date = $2::date`,
      empNo, date,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/attendance-justification error:", err);
    return NextResponse.json({ error: "Failed to remove justification" }, { status: 500 });
  }
}
