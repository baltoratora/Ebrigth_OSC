import "server-only";
import { pool } from "./db";
import { BRANCHES, BranchCode, Student, AgeCategory, StudentLoadReport } from "@fa/_types";

const BRANCH_CODES = new Set<string>(BRANCHES.map(b => b.code));

// Accept anything that mentions a grade — chapter optional.
//   "G3 — C5", "G 3 - C 5", "G3", "g3-c5", etc.
// The curriculum ladder continues past G8 into two advanced series, GA and GB,
// folded onto the same numeric scale so the rest of the system keeps working on
// plain numbers:
//   G1..G8  → 1..8
//   GA1..GA4 → 9..12   (GA<n> = 8 + n)
//   GB1..GB4 → 13..16  (GB<n> = 12 + n)
// Display converts the number back to the G/GA/GB label via gradeLabel().
const GRADE_RE = /(?:^|\b)g\s*([ab])?\s*(\d+)/i;
const CHAPTER_RE = /c\s*(\d+)/i;

function parseGradeChapter(raw: unknown): { grade: number; credit: number } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const gm = trimmed.match(GRADE_RE);
  if (!gm) return null;
  const series = (gm[1] ?? "").toUpperCase(); // "" | "A" | "B"
  const base = Number(gm[2]);
  if (!Number.isFinite(base) || base < 1) return null;
  const grade = series === "A" ? 8 + base : series === "B" ? 12 + base : base;
  if (grade < 1 || grade > 16) return null;
  const cm = trimmed.match(CHAPTER_RE);
  const credit = cm ? Number(cm[1]) : 1; // default to chapter 1 if absent
  if (!Number.isFinite(credit)) return null;
  return { grade, credit };
}

// Fallback when the ade_group row is missing for a student — keeps the
// Junior/Middler/Senior label working for legacy records that haven't been
// populated yet. Same thresholds the team has been using historically.
function ageCategoryFromGrade(grade: number): AgeCategory {
  if (grade <= 3) return "Junior";
  if (grade <= 6) return "Middler";
  return "Senior";
}

/** Map an arbitrary string from the Heidi `ade_group` table onto the
 *  AgeCategory enum the rest of the system uses. Accepts lowercase /
 *  uppercase / mixed and a few common synonyms (e.g. "Middle" → Middler). */
function normaliseAgeGroup(raw: unknown): AgeCategory | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("jun")) return "Junior";
  if (s.startsWith("mid")) return "Middler";
  if (s.startsWith("sen")) return "Senior";
  return null;
}

function parseFaHistory(raw: unknown, currentGrade: number): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  if (!Array.isArray(raw)) return out;
  // fa_progress_json is an array of booleans, index i = FA done for grade (i+1).
  // Keep entries up to AND INCLUDING the student's current grade so the FA
  // invite picker can show the current-grade FA status — matches the
  // dashboard's per-grade FA-progress checkboxes.
  for (let i = 0; i < raw.length && i < currentGrade; i++) {
    out[i + 1] = raw[i] === true;
  }
  return out;
}

function toIsoDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  if (typeof d === "string") return d.split("T")[0];
  return "";
}

function normaliseBranch(raw: unknown): BranchCode | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return BRANCH_CODES.has(code) ? (code as BranchCode) : null;
}

interface StudentRow {
  id: number;
  name: string | null;
  status: string | null;
  branch: string | null;
  enrollment_date: Date | string | null;
  grade_chapter: string | null;
  fa_progress_json: unknown;
  guardian_name: string | null;
  guardian_mobile: string | null;
  /** Heidi's authoritative age group (Junior/Middler/Senior) straight from
   *  the studentrecords.age_group column. May be null for a few unpopulated
   *  rows, in which case rowToStudent falls back to the grade heuristic. */
  age_group?: string | null;
}

type SkipReason = "missing_branch" | "unknown_branch" | "missing_grade" | "bad_grade_format";

function rowToStudent(row: StudentRow): { student: Student } | { skip: SkipReason } {
  if (!row.branch) return { skip: "missing_branch" };
  const branch = normaliseBranch(row.branch);
  if (!branch) return { skip: "unknown_branch" };
  if (!row.grade_chapter) return { skip: "missing_grade" };
  const gc = parseGradeChapter(row.grade_chapter);
  if (!gc) return { skip: "bad_grade_format" };

  // studentrecords.age_group is the source of truth (matches the student
  // database); fall back to the grade-based heuristic only when it's null.
  const ageCategory = normaliseAgeGroup(row.age_group) ?? ageCategoryFromGrade(gc.grade);

  return {
    student: {
      id: String(row.id),
      name: row.name ?? "",
      branch,
      grade: gc.grade,
      ageCategory,
      credit: gc.credit,
      faHistory: parseFaHistory(row.fa_progress_json, gc.grade),
      parentName: row.guardian_name ?? "",
      parentPhone: row.guardian_mobile ?? "",
      enrolmentDate: toIsoDate(row.enrollment_date),
      active: (row.status ?? "").toLowerCase() === "active",
      archived: false,
    },
  };
}

/** Shape of a row from the separate `archived_students` table. Mirrors the
 *  columns we need from studentrecords, but the primary key is `no` (int) and
 *  `student_id` is frequently a placeholder ("—"), so we namespace the FA id
 *  off `no` instead. */
interface ArchivedStudentRow {
  no: number;
  student_id: string | null;
  name: string | null;
  status: string | null;
  branch: string | null;
  enrollment_date: Date | string | null;
  grade_chapter: string | null;
  fa_progress_json: unknown;
  guardian_name: string | null;
  guardian_mobile: string | null;
  age_group: string | null;
}

/** Stable, collision-free FA id for an archived student. `studentrecords.id`
 *  is a bigint and `archived_students.no` is a separate sequence, so we prefix
 *  to guarantee the two namespaces never clash. Invitations store this string
 *  verbatim (fa_invitations.student_id is free-form text). */
export function archivedStudentId(no: number): string {
  return `arch-${no}`;
}

/** The portal id for an archived student. Prefer the `student_id` column — it's
 *  `arch-<original studentrecords id>`, which stays correct even for archives
 *  created after `no` became a fresh sequence (where `no` no longer equals the
 *  original id). Fall back to `arch-<no>` only for rows still missing student_id.
 *  This is what makes a tolerant lookup of `arch-<original id>` find new archives. */
function archivedRowId(row: { student_id: string | null; no: number }): string {
  const sid = (row.student_id ?? "").trim();
  return /^arch-\d+$/i.test(sid) ? sid : archivedStudentId(row.no);
}

function archivedRowToStudent(row: ArchivedStudentRow): { student: Student } | { skip: SkipReason } {
  if (!row.branch) return { skip: "missing_branch" };
  const branch = normaliseBranch(row.branch);
  if (!branch) return { skip: "unknown_branch" };
  if (!row.grade_chapter) return { skip: "missing_grade" };
  const gc = parseGradeChapter(row.grade_chapter);
  if (!gc) return { skip: "bad_grade_format" };

  const ageCategory = normaliseAgeGroup(row.age_group) ?? ageCategoryFromGrade(gc.grade);

  return {
    student: {
      id: archivedRowId(row),
      name: row.name ?? "",
      branch,
      grade: gc.grade,
      ageCategory,
      credit: gc.credit,
      faHistory: parseFaHistory(row.fa_progress_json, gc.grade),
      parentName: row.guardian_name ?? "",
      parentPhone: row.guardian_mobile ?? "",
      enrolmentDate: toIsoDate(row.enrollment_date),
      // Archived students are not active by definition; keep the flag honest
      // so the "Active only" filter still excludes them.
      active: false,
      archived: true,
    },
  };
}

/** Load every row from `archived_students` and map onto the Student shape.
 *  Failures are swallowed (returns []) so a missing/renamed archive table can
 *  never take down the main student list — archived students are additive. */
async function fetchArchivedStudents(): Promise<Student[]> {
  try {
    const { rows } = await pool.query<ArchivedStudentRow>(
      `SELECT no, student_id, name, status, branch, enrollment_date, grade_chapter,
              fa_progress_json, guardian_name, guardian_mobile, age_group
         FROM archived_students`
    );
    const out: Student[] = [];
    for (const r of rows) {
      const result = archivedRowToStudent(r);
      if ("student" in result) out.push(result.student);
    }
    return out;
  } catch (err) {
    console.warn(
      "[FA] Could not load archived_students — archived list will be empty:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}


/** Pulls every row from `studentrecords`, including the `age_group` column
 *  (Heidi's authoritative Junior/Middler/Senior, DOB-derived — the same value
 *  shown in the student database). Earlier this joined a separate `ade_group`
 *  table which doesn't actually exist, so every student silently fell back to
 *  a grade-based guess (e.g. a G4 Junior wrongly became "Middler"). We now read
 *  the real column directly; the grade heuristic is only a last resort for the
 *  handful of rows where age_group is null. */
export async function fetchAllStudents(): Promise<{ students: Student[]; report: StudentLoadReport }> {
  let rows: StudentRow[];
  let ageGroupJoinAvailable = true;
  try {
    const result = await pool.query<StudentRow>(
      `SELECT id, name, status, branch, enrollment_date, grade_chapter,
              fa_progress_json, guardian_name, guardian_mobile, age_group
         FROM studentrecords`
    );
    rows = result.rows;
  } catch (err) {
    // Only hit if this DB's studentrecords has no age_group column at all.
    ageGroupJoinAvailable = false;
    console.warn(
      "[FA] studentrecords.age_group missing — falling back to grade-derived age category:",
      err instanceof Error ? err.message : err
    );
    const result = await pool.query<StudentRow>(
      `SELECT id, name, status, branch, enrollment_date, grade_chapter, fa_progress_json,
              guardian_name, guardian_mobile
         FROM studentrecords`
    );
    rows = result.rows;
  }

  const students: Student[] = [];
  const report: StudentLoadReport = {
    loaded: 0,
    skipped: { missing_branch: 0, unknown_branch: 0, missing_grade: 0, bad_grade_format: 0 },
    samples: [],
    ageGroupJoinAvailable,
  };

  for (const r of rows) {
    const result = rowToStudent(r);
    if ("student" in result) {
      students.push(result.student);
      report.loaded++;
    } else {
      report.skipped[result.skip]++;
      // Keep a handful of samples per reason so the team can see real cases
      // when diagnosing missing students.
      if (report.samples.filter(s => s.reason === result.skip).length < 5) {
        report.samples.push({
          id: r.id,
          reason: result.skip,
          branch: r.branch,
          grade_chapter: r.grade_chapter,
        });
      }
    }
  }

  // Archived students live in their own table. They're additive — appended
  // after the live roster, each carrying archived:true so the UI can badge
  // them and group them into a separate section.
  const archived = await fetchArchivedStudents();
  students.push(...archived);
  report.loaded += archived.length;
  report.archivedLoaded = archived.length;

  const totalSkipped =
    report.skipped.missing_branch +
    report.skipped.unknown_branch +
    report.skipped.missing_grade +
    report.skipped.bad_grade_format;
  if (totalSkipped > 0) {
    console.warn(
      `[FA] Loaded ${report.loaded} students; skipped ${totalSkipped} (` +
        `missing_branch=${report.skipped.missing_branch}, ` +
        `unknown_branch=${report.skipped.unknown_branch}, ` +
        `missing_grade=${report.skipped.missing_grade}, ` +
        `bad_grade_format=${report.skipped.bad_grade_format})`
    );
    if (report.samples.length > 0) {
      console.warn("[FA] Sample skipped rows:", report.samples);
    }
  }

  return { students, report };
}
