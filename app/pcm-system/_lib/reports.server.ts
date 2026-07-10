import "server-only";
import { pool } from "./db";
import { BranchCode, PcmReport } from "@pcm/_types";

const TENANT = "ebright";

interface ReportRow {
  id: string;
  invitation_id: string;
  student_id: string;
  student_name: string;
  branch: string;
  grade: number;
  assessment_date: Date | string;
  confidence_score: number;
  voice_clarity_score: number;
  eye_contact_score: number;
  idea_expression_score: number;
  strengths: string;
  improvement_plan: string;
  prepared_by: string;
  prepared_by_id: string | null;
  prepared_by_signature: string | null;
  received_by: string;
  video_link: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function isoDate(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
}
function isoTs(d: Date | string): string {
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function rowToReport(r: ReportRow): PcmReport {
  return {
    id: r.id,
    invitationId: r.invitation_id,
    studentId: r.student_id,
    studentName: r.student_name,
    branch: r.branch as BranchCode,
    grade: r.grade,
    assessmentDate: isoDate(r.assessment_date),
    confidenceScore: r.confidence_score,
    voiceClarityScore: r.voice_clarity_score,
    eyeContactScore: r.eye_contact_score,
    ideaExpressionScore: r.idea_expression_score,
    strengths: r.strengths,
    improvementPlan: r.improvement_plan,
    preparedBy: r.prepared_by,
    preparedById: r.prepared_by_id ?? undefined,
    preparedBySignature: r.prepared_by_signature ?? undefined,
    receivedBy: r.received_by,
    videoLink: r.video_link ?? undefined,
    createdAt: isoTs(r.created_at),
    updatedAt: isoTs(r.updated_at),
  };
}

const COLS = `id, invitation_id, student_id, student_name, branch, grade,
              assessment_date, confidence_score, voice_clarity_score,
              eye_contact_score, idea_expression_score, strengths,
              improvement_plan, prepared_by, prepared_by_id,
              prepared_by_signature, received_by, video_link,
              created_at, updated_at`;

// Legacy column set without video_link — used as a fallback on DBs
// where the 2026-06-04-reports-video-link migration hasn't been applied
// yet. Lets the code deploy ahead of the migration without 500'ing.
const COLS_LEGACY = `id, invitation_id, student_id, student_name, branch, grade,
                     assessment_date, confidence_score, voice_clarity_score,
                     eye_contact_score, idea_expression_score, strengths,
                     improvement_plan, prepared_by, prepared_by_id,
                     prepared_by_signature, received_by,
                     created_at, updated_at`;

export async function fetchAllReports(): Promise<PcmReport[]> {
  // 42P01 → table doesn't exist → return [].
  // 42703 → video_link column missing (migration not applied) → retry
  //         the SELECT without that column.
  try {
    const { rows } = await pool.query<ReportRow>(
      `SELECT ${COLS} FROM pcm_assessment_reports WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [TENANT],
    );
    return rows.map(rowToReport);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42P01") return [];
    if (code === "42703") {
      const { rows } = await pool.query<Omit<ReportRow, "video_link">>(
        `SELECT ${COLS_LEGACY} FROM pcm_assessment_reports WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [TENANT],
      );
      return rows.map(r => rowToReport({ ...r, video_link: null }));
    }
    throw err;
  }
}

export async function upsertReportRow(args: Omit<PcmReport, "id" | "createdAt" | "updatedAt">): Promise<PcmReport> {
  // One report per invitation — use INSERT ... ON CONFLICT to make this
  // call serve both "first save" and "edit" without the caller having to
  // know which one. If the video_link column isn't there yet, fall back
  // to an upsert that omits it (the videoLink is silently dropped until
  // the migration runs).
  try {
    const { rows } = await pool.query<ReportRow>(
      `INSERT INTO pcm_assessment_reports
        (tenant_id, invitation_id, student_id, student_name, branch, grade,
         assessment_date, confidence_score, voice_clarity_score,
         eye_contact_score, idea_expression_score, strengths,
         improvement_plan, prepared_by, prepared_by_id,
         prepared_by_signature, received_by, video_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (invitation_id) DO UPDATE SET
         student_name          = EXCLUDED.student_name,
         branch                = EXCLUDED.branch,
         grade                 = EXCLUDED.grade,
         assessment_date       = EXCLUDED.assessment_date,
         confidence_score      = EXCLUDED.confidence_score,
         voice_clarity_score   = EXCLUDED.voice_clarity_score,
         eye_contact_score     = EXCLUDED.eye_contact_score,
         idea_expression_score = EXCLUDED.idea_expression_score,
         strengths             = EXCLUDED.strengths,
         improvement_plan      = EXCLUDED.improvement_plan,
         prepared_by           = EXCLUDED.prepared_by,
         prepared_by_id        = EXCLUDED.prepared_by_id,
         prepared_by_signature = EXCLUDED.prepared_by_signature,
         received_by           = EXCLUDED.received_by,
         video_link            = EXCLUDED.video_link,
         updated_at            = now()
       RETURNING ${COLS}`,
      [
        TENANT, args.invitationId, args.studentId, args.studentName, args.branch, args.grade,
        args.assessmentDate, args.confidenceScore, args.voiceClarityScore,
        args.eyeContactScore, args.ideaExpressionScore, args.strengths,
        args.improvementPlan, args.preparedBy, args.preparedById ?? null,
        args.preparedBySignature ?? null, args.receivedBy, args.videoLink ?? null,
      ],
    );
    return rowToReport(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code !== "42703") throw err;
    const { rows } = await pool.query<Omit<ReportRow, "video_link">>(
      `INSERT INTO pcm_assessment_reports
        (tenant_id, invitation_id, student_id, student_name, branch, grade,
         assessment_date, confidence_score, voice_clarity_score,
         eye_contact_score, idea_expression_score, strengths,
         improvement_plan, prepared_by, prepared_by_id,
         prepared_by_signature, received_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (invitation_id) DO UPDATE SET
         student_name          = EXCLUDED.student_name,
         branch                = EXCLUDED.branch,
         grade                 = EXCLUDED.grade,
         assessment_date       = EXCLUDED.assessment_date,
         confidence_score      = EXCLUDED.confidence_score,
         voice_clarity_score   = EXCLUDED.voice_clarity_score,
         eye_contact_score     = EXCLUDED.eye_contact_score,
         idea_expression_score = EXCLUDED.idea_expression_score,
         strengths             = EXCLUDED.strengths,
         improvement_plan      = EXCLUDED.improvement_plan,
         prepared_by           = EXCLUDED.prepared_by,
         prepared_by_id        = EXCLUDED.prepared_by_id,
         prepared_by_signature = EXCLUDED.prepared_by_signature,
         received_by           = EXCLUDED.received_by,
         updated_at            = now()
       RETURNING ${COLS_LEGACY}`,
      [
        TENANT, args.invitationId, args.studentId, args.studentName, args.branch, args.grade,
        args.assessmentDate, args.confidenceScore, args.voiceClarityScore,
        args.eyeContactScore, args.ideaExpressionScore, args.strengths,
        args.improvementPlan, args.preparedBy, args.preparedById ?? null,
        args.preparedBySignature ?? null, args.receivedBy,
      ],
    );
    return rowToReport({ ...rows[0], video_link: null });
  }
}

export async function deleteReportRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM pcm_assessment_reports WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}
