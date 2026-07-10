import "server-only";
import { pool } from "./db";
import { BranchCode, FAReport } from "@fa/_types";

const TENANT = "ebright";

interface ReportRow {
  id: string;
  invitation_id: string;
  student_id: string;
  student_name: string;
  branch: string;
  grade: number;
  assessment_date: Date | string;
  communication_score: number;
  analysis_score: number;
  interaction_score: number;
  performance_score: number;
  remarks: string;
  prepared_by: string;
  prepared_by_id: string | null;
  video_link: string | null;
  evidence_photo_link: string | null;
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

function rowToReport(r: ReportRow): FAReport {
  return {
    id: r.id,
    invitationId: r.invitation_id,
    studentId: r.student_id,
    studentName: r.student_name,
    branch: r.branch as BranchCode,
    grade: r.grade,
    assessmentDate: isoDate(r.assessment_date),
    communicationScore: r.communication_score,
    analysisScore: r.analysis_score,
    interactionScore: r.interaction_score,
    performanceScore: r.performance_score,
    remarks: r.remarks,
    preparedBy: r.prepared_by,
    preparedById: r.prepared_by_id ?? undefined,
    videoLink: r.video_link ?? undefined,
    evidencePhotoLink: r.evidence_photo_link ?? undefined,
    createdAt: isoTs(r.created_at),
    updatedAt: isoTs(r.updated_at),
  };
}

const COLS = `id, invitation_id, student_id, student_name, branch, grade,
              assessment_date, communication_score, analysis_score,
              interaction_score, performance_score, remarks,
              prepared_by, prepared_by_id, video_link, evidence_photo_link,
              created_at, updated_at`;

// Legacy column set without video_link — used as a fallback on
// databases where the 2026-06-04-reports-video-link migration hasn't
// been applied yet. Lets the code deploy ahead of the migration without
// breaking the reports endpoint.
const COLS_LEGACY = `id, invitation_id, student_id, student_name, branch, grade,
                     assessment_date, communication_score, analysis_score,
                     interaction_score, performance_score, remarks,
                     prepared_by, prepared_by_id,
                     created_at, updated_at`;

export async function fetchAllFaReports(): Promise<FAReport[]> {
  // Wrapped so the dashboard still loads on a fresh deploy:
  //   • 42P01 (undefined_table) → table doesn't exist yet → return []
  //   • 42703 (undefined_column) → video_link migration not applied yet
  //     → retry the SELECT without that column.
  try {
    const { rows } = await pool.query<ReportRow>(
      `SELECT ${COLS} FROM fa_assessment_reports WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [TENANT],
    );
    return rows.map(rowToReport);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42P01") return [];
    if (code === "42703") {
      const { rows } = await pool.query<Omit<ReportRow, "video_link" | "evidence_photo_link">>(
        `SELECT ${COLS_LEGACY} FROM fa_assessment_reports WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [TENANT],
      );
      return rows.map(r => rowToReport({ ...r, video_link: null, evidence_photo_link: null }));
    }
    throw err;
  }
}

export async function upsertFaReportRow(
  args: Omit<FAReport, "id" | "createdAt" | "updatedAt">,
): Promise<FAReport> {
  // One report per invitation — INSERT ... ON CONFLICT serves both first
  // save and edit without the caller having to branch.
  try {
    const { rows } = await pool.query<ReportRow>(
      `INSERT INTO fa_assessment_reports
        (tenant_id, invitation_id, student_id, student_name, branch, grade,
         assessment_date, communication_score, analysis_score,
         interaction_score, performance_score, remarks,
         prepared_by, prepared_by_id, video_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (invitation_id) DO UPDATE SET
         student_name        = EXCLUDED.student_name,
         branch              = EXCLUDED.branch,
         grade               = EXCLUDED.grade,
         assessment_date     = EXCLUDED.assessment_date,
         communication_score = EXCLUDED.communication_score,
         analysis_score      = EXCLUDED.analysis_score,
         interaction_score   = EXCLUDED.interaction_score,
         performance_score   = EXCLUDED.performance_score,
         remarks             = EXCLUDED.remarks,
         prepared_by         = EXCLUDED.prepared_by,
         prepared_by_id      = EXCLUDED.prepared_by_id,
         video_link          = EXCLUDED.video_link,
         updated_at          = now()
       RETURNING ${COLS}`,
      [
        TENANT, args.invitationId, args.studentId, args.studentName, args.branch, args.grade,
        args.assessmentDate, args.communicationScore, args.analysisScore,
        args.interactionScore, args.performanceScore, args.remarks,
        args.preparedBy, args.preparedById ?? null, args.videoLink ?? null,
      ],
    );
    return rowToReport(rows[0]);
  } catch (err) {
    // video_link column not present yet on this DB — re-run the same
    // upsert without that column so the save still succeeds (videoLink
    // is just silently dropped until migration is applied).
    if ((err as { code?: string }).code !== "42703") throw err;
    const { rows } = await pool.query<Omit<ReportRow, "video_link" | "evidence_photo_link">>(
      `INSERT INTO fa_assessment_reports
        (tenant_id, invitation_id, student_id, student_name, branch, grade,
         assessment_date, communication_score, analysis_score,
         interaction_score, performance_score, remarks,
         prepared_by, prepared_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (invitation_id) DO UPDATE SET
         student_name        = EXCLUDED.student_name,
         branch              = EXCLUDED.branch,
         grade               = EXCLUDED.grade,
         assessment_date     = EXCLUDED.assessment_date,
         communication_score = EXCLUDED.communication_score,
         analysis_score      = EXCLUDED.analysis_score,
         interaction_score   = EXCLUDED.interaction_score,
         performance_score   = EXCLUDED.performance_score,
         remarks             = EXCLUDED.remarks,
         prepared_by         = EXCLUDED.prepared_by,
         prepared_by_id      = EXCLUDED.prepared_by_id,
         updated_at          = now()
       RETURNING ${COLS_LEGACY}`,
      [
        TENANT, args.invitationId, args.studentId, args.studentName, args.branch, args.grade,
        args.assessmentDate, args.communicationScore, args.analysisScore,
        args.interactionScore, args.performanceScore, args.remarks,
        args.preparedBy, args.preparedById ?? null,
      ],
    );
    return rowToReport({ ...rows[0], video_link: null, evidence_photo_link: null });
  }
}

export async function deleteFaReportRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_assessment_reports WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// Set (or clear, when link is null) the report-delivery evidence photo for one
// invitation. This is a BRANCH action proving the branch handed the printed
// report to the student — separate from upsertFaReportRow (which Marketing uses
// to fill scores) so a photo upload never touches the assessment data, and a
// report re-save never wipes the photo. Returns null when no report exists yet
// (the branch can only attach a photo once the report has been filled).
export async function setFaReportEvidence(
  invitationId: string,
  link: string | null,
): Promise<FAReport | null> {
  const { rows } = await pool.query<ReportRow>(
    `UPDATE fa_assessment_reports
        SET evidence_photo_link = $1, updated_at = now()
      WHERE invitation_id = $2 AND tenant_id = $3
      RETURNING ${COLS}`,
    [link, invitationId, TENANT],
  );
  return rows[0] ? rowToReport(rows[0]) : null;
}
