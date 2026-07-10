import "server-only";
import { pool } from "./db";
import {
  BranchCode,
  DayPolicy,
  EventBranchOverride,
  ArrivalWindow,
  EventStatus,
  FAEvent,
  Invitation,
  InvitationStatus,
  InviteType,
  PackageOption,
  PACKAGE_OPTIONS,
  Session,
  SessionQuota,
} from "@pcm/_types";

const TENANT = "ebright";

// Sentinels used by createInvitationRow to distinguish business-rule rejects
// from real DB errors. The route translates these to 409 responses with a
// descriptive `reason` string.
export class InvitationRejected extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "InvitationRejected";
  }
}

// ----------------------------------------------------------------------------
// Row shapes (snake_case from postgres) and mappers
// ----------------------------------------------------------------------------

interface EventRow {
  id: string;
  name: string;
  month: number;
  year: number;
  venue: string;
  start_date: Date | string;
  end_date: Date | string;
  number_of_days: number;
  invitation_open_date: Date | string;
  invitation_close_date: Date | string;
  status: string;
  created_by: string | null;
  created_at: Date | string;
  notes: string | null;
}

interface SessionRow {
  id: string;
  event_id: string;
  day_number: number;
  session_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

interface QuotaRow {
  id: string;
  session_id: string;
  branch: string;
  quota: number;
}

interface InvitationRow {
  id: string;
  event_id: string;
  session_id: string;
  student_id: string;
  branch: string;
  target_grade: number | null;
  status: string;
  invited_by: string | null;
  invited_at: Date | string;
  confirmed_at: Date | string | null;
  attendance_marked_at: Date | string | null;
  attendance_marked_by: string | null;
  notes: string | null;
  invite_type: string;
  coach_id: string | null;
  coach_name: string | null;
  paid: boolean;
  package: string | null;
  video_sent_to_parent: boolean;
  video_link: string | null;
  arrival_window: string | null;
  arrival_time: string | null;
  // LEFT-JOINed from studentrecords so the UI can render a row's name even
  // when /api/pcm/students drops the student for strict-validation reasons
  // (missing branch/grade/etc).
  student_name: string | null;
  student_grade_chapter: string | null;
  student_parent_name: string | null;
  student_parent_phone: string | null;
}

interface EventBranchOverrideRow {
  event_id: string;
  branch_code: string;
  day_policy: string | null;
  granted_by: string;
  granted_at: Date | string;
  reason: string | null;
}

function isoDate(d: Date | string): string {
  // Event start/end dates are stored as a timestamp at KL-midnight — e.g.
  // 2026-06-16T16:00:00Z is 00:00 on 17 Jun in Kuala Lumpur (UTC+8). Reading it
  // in UTC and chopping the time (toISOString) yields 16 Jun, shifting the whole
  // event — and every session's weekday — back by one day. Format in KL instead
  // so "Day N" lands on the correct calendar day. A plain "YYYY-MM-DD" value is
  // unaffected (KL +8h keeps it on the same date).
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  }
  return String(d).split("T")[0];
}

function isoTimestamp(d: Date | string | null): string | undefined {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function rowToEvent(r: EventRow): FAEvent {
  return {
    id: r.id,
    name: r.name,
    month: r.month,
    year: r.year,
    venue: r.venue,
    startDate: isoDate(r.start_date),
    endDate: isoDate(r.end_date),
    numberOfDays: r.number_of_days,
    invitationOpenDate: isoDate(r.invitation_open_date),
    invitationCloseDate: isoDate(r.invitation_close_date),
    status: r.status as EventStatus,
    createdBy: r.created_by ?? "",
    createdAt: isoTimestamp(r.created_at) ?? new Date().toISOString(),
    notes: r.notes ?? undefined,
  };
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    eventId: r.event_id,
    dayNumber: r.day_number,
    sessionNumber: r.session_number,
    startTime: r.start_time,
    endTime: r.end_time,
    label: r.label ?? undefined,
  };
}

function rowToQuota(r: QuotaRow): SessionQuota {
  return {
    id: r.id,
    sessionId: r.session_id,
    branch: r.branch as BranchCode,
    quota: r.quota,
  };
}

function rowToOverride(r: EventBranchOverrideRow): EventBranchOverride {
  return {
    eventId: r.event_id,
    branchCode: r.branch_code as BranchCode,
    dayPolicy: normalizeDayPolicy(r.day_policy),
    grantedBy: r.granted_by,
    grantedAt: isoTimestamp(r.granted_at) ?? new Date().toISOString(),
    reason: r.reason ?? undefined,
  };
}

/** Coerce a raw day_policy value (possibly null on pre-migration rows) into
 *  the DayPolicy union, defaulting to the legacy SAME_DAY behaviour. */
function normalizeDayPolicy(v: string | null | undefined): DayPolicy {
  return v === "DIFF_DAY" || v === "BOTH" ? v : "SAME_DAY";
}

// Lightweight grade parser — matches the same "G3" / "G3-C5" patterns the
// students loader handles, but tolerates a missing/garbled value by
// returning undefined instead of throwing. We only need the integer grade
// here, not the chapter.
function parseGradeFromChapter(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/g\s*(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : undefined;
}

function rowToInvitation(r: InvitationRow): Invitation {
  return {
    id: r.id,
    eventId: r.event_id,
    sessionId: r.session_id,
    studentId: r.student_id,
    branch: r.branch as BranchCode,
    targetGrade: r.target_grade ?? 0,
    status: r.status as InvitationStatus,
    inviteType: (r.invite_type === "renewal" ? "renewal" : "progress") as InviteType,
    coachId: r.coach_id ?? undefined,
    coachName: r.coach_name ?? undefined,
    paid: r.paid === true,
    package: (r.package as PackageOption | null) ?? null,
    videoSentToParent: r.video_sent_to_parent === true,
    videoLink: r.video_link ?? null,
    arrivalWindow: (r.arrival_window as ArrivalWindow | null) ?? undefined,
    arrivalTime: r.arrival_time ?? undefined,
    invitedBy: r.invited_by ?? "",
    invitedAt: isoTimestamp(r.invited_at) ?? new Date().toISOString(),
    confirmedAt: isoTimestamp(r.confirmed_at),
    attendanceMarkedAt: isoTimestamp(r.attendance_marked_at),
    attendanceMarkedBy: r.attendance_marked_by ?? undefined,
    notes: r.notes ?? undefined,
    studentName: r.student_name ?? undefined,
    studentGrade: parseGradeFromChapter(r.student_grade_chapter),
    studentParentName: r.student_parent_name ?? undefined,
    studentParentPhone: r.student_parent_phone ?? undefined,
  };
}

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

// Self-provisioning column for the renewal-package picker — same pattern as
// paid/video_link/arrival_window before it (see prisma/sql/2026-05-23-pcm-invitation-paid.sql
// for the precedent). ADD COLUMN IF NOT EXISTS runs once per server process,
// before any read/write touches the column, so no separate manual migration
// step is required.
let packageColumnEnsured: Promise<void> | null = null;
function ensurePackageColumn(): Promise<void> {
  if (!packageColumnEnsured) {
    packageColumnEnsured = pool.query(`
      ALTER TABLE pcm_invitations ADD COLUMN IF NOT EXISTS package text
    `).then(() => undefined).catch((err) => {
      packageColumnEnsured = null;
      throw err;
    });
  }
  return packageColumnEnsured;
}

export async function fetchAllEventData(): Promise<{
  events: FAEvent[];
  sessions: Session[];
  quotas: SessionQuota[];
  invitations: Invitation[];
  overrides: EventBranchOverride[];
}> {
  await ensurePackageColumn();
  const [eventsRes, sessionsRes, quotasRes, invitationsRes, overridesRes] = await Promise.all([
    pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, created_by, created_at, notes
         FROM pcm_events
        WHERE tenant_id = $1
        ORDER BY start_date DESC, created_at DESC`,
      [TENANT]
    ),
    pool.query<SessionRow>(
      `SELECT id, event_id, day_number, session_number, start_time, end_time, label
         FROM pcm_sessions
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM pcm_session_quotas
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    // Try the LEFT JOIN form first so we ship student name/grade/parent
    // inline alongside each invitation (lets the UI render a name even
    // when /api/pcm/students drops a record during strict validation).
    // If that fails — for example studentrecords doesn't exist on this DB,
    // or studentrecords.id has a type that won't cast cleanly to text —
    // fall back to the plain invitations query so the page is never blank.
    pool.query<InvitationRow>(
      `SELECT i.id, i.event_id, i.session_id, i.student_id, i.branch, i.target_grade,
              i.status, i.invited_by, i.invited_at, i.confirmed_at,
              i.attendance_marked_at, i.attendance_marked_by, i.notes, i.invite_type,
              i.coach_id, i.coach_name, i.paid, i.package, i.video_sent_to_parent, i.video_link,
              i.arrival_window, i.arrival_time,
              -- Name resolution, best first: the live studentrecords name, else
              -- the snapshot saved at invite time, else the archived_students
              -- record (recovers students removed from studentrecords).
              COALESCE(s.name, i.student_name_snapshot, a.name) AS student_name,
              s.grade_chapter  AS student_grade_chapter,
              s.guardian_name  AS student_parent_name,
              s.guardian_mobile AS student_parent_phone
         FROM pcm_invitations i
         LEFT JOIN studentrecords s
                ON s.id::text = i.student_id
         -- Recover names for students removed from studentrecords. A LATERAL
         -- returning a SINGLE row is required: an invitation's student_id can
         -- coincidentally equal an unrelated archive row's no (e.g. student
         -- 743 vs. archive no=743, a different person), so a plain LEFT JOIN
         -- would match two archive rows and FAN OUT one invitation into
         -- duplicate display rows. Prefer the reliable id forms first, take one.
         LEFT JOIN LATERAL (
           SELECT a2.name
             FROM archived_students a2
            WHERE a2.student_id = i.student_id
               OR a2.student_id = 'arch-' || i.student_id
               OR a2.no::text = i.student_id
            ORDER BY (a2.student_id = i.student_id) DESC,
                     (a2.student_id = 'arch-' || i.student_id) DESC
            LIMIT 1
         ) a ON true
        WHERE i.tenant_id = $1`,
      [TENANT]
    ).catch((err) => {
      console.warn(
        "[pcm] invitations LEFT JOIN studentrecords failed; falling back to plain query:",
        err instanceof Error ? err.message : err
      );
      return pool.query<InvitationRow>(
        `SELECT id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
                invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes,
                invite_type, coach_id, coach_name, paid, package, video_sent_to_parent, video_link,
                arrival_window, arrival_time,
                student_name_snapshot AS student_name,
                NULL::text AS student_grade_chapter,
                NULL::text AS student_parent_name,
                NULL::text AS student_parent_phone
           FROM pcm_invitations
          WHERE tenant_id = $1`,
        [TENANT]
      );
    }),
    // Per-event per-branch multi-grade overrides. The pcm_event_branch_overrides
    // table may not exist on older deploys yet — wrap in a try so the FA
    // dashboard still loads if the migration hasn't been applied.
    pool.query<EventBranchOverrideRow>(
      `SELECT event_id, branch_code, day_policy, granted_by, granted_at, reason
         FROM pcm_event_branch_overrides`,
    ).catch((err) => {
      const code = (err as { code?: string }).code;
      if (code === "42P01") {
        // undefined_table — overrides migration not applied yet
        return { rows: [] as EventBranchOverrideRow[] };
      }
      if (code === "42703") {
        // undefined_column — day_policy migration not applied yet. Read the
        // legacy shape; normalizeDayPolicy() defaults the missing column to
        // SAME_DAY so behaviour matches pre-day-policy deploys.
        return pool.query<EventBranchOverrideRow>(
          `SELECT event_id, branch_code, granted_by, granted_at, reason
             FROM pcm_event_branch_overrides`,
        );
      }
      throw err;
    }),
  ]);

  return {
    events: eventsRes.rows.map(rowToEvent),
    sessions: sessionsRes.rows.map(rowToSession),
    quotas: quotasRes.rows.map(rowToQuota),
    invitations: invitationsRes.rows.map(rowToInvitation),
    overrides: overridesRes.rows.map(rowToOverride),
  };
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------

export async function createEventRow(
  ev: Omit<FAEvent, "id" | "createdAt">
): Promise<FAEvent> {
  const { rows } = await pool.query<EventRow>(
    `INSERT INTO pcm_events
       (tenant_id, name, month, year, venue, start_date, end_date, number_of_days,
        invitation_open_date, invitation_close_date, status, created_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, created_by, created_at, notes`,
    [
      TENANT, ev.name, ev.month, ev.year, ev.venue, ev.startDate, ev.endDate, ev.numberOfDays,
      ev.invitationOpenDate, ev.invitationCloseDate, ev.status, ev.createdBy || null, ev.notes ?? null,
    ]
  );
  return rowToEvent(rows[0]);
}

/**
 * Duplicate an existing event with its full session + quota layout,
 * overriding only the name, dates, and invitation window.
 *
 * What's COPIED from the source event:
 *   • Every session (day_number, session_number, start_time, end_time, label)
 *   • Every per-(session, branch) quota
 *
 * What's NOT copied:
 *   • Invitations — the new event starts empty so BMs can re-invite for the
 *     fresh week without inheriting last week's roster.
 *   • Per-event multi-grade overrides — Academy can re-grant if needed.
 *   • Status — new event starts as "draft" so Academy reviews before opening.
 *
 * All inserts run sequentially against the same pool; if any session insert
 * fails the partial state stays and the caller surfaces the error (we don't
 * wrap in a transaction yet since pg-pool doesn't expose one cheaply here
 * and the failure mode is rare).
 */
export async function duplicateEventRow(
  sourceEventId: string,
  overrides: {
    name: string;
    startDate: string;          // ISO
    endDate: string;            // ISO
    invitationOpenDate: string;
    invitationCloseDate: string;
    createdBy: string;
    notes?: string;
  },
): Promise<FAEvent | null> {
  // 1. Load the source event so we can carry over numberOfDays, venue, etc.
  const srcRes = await pool.query<EventRow>(
    `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
            invitation_open_date, invitation_close_date, status, created_by, created_at, notes
       FROM pcm_events
      WHERE id = $1 AND tenant_id = $2`,
    [sourceEventId, TENANT],
  );
  if (!srcRes.rows[0]) return null;
  const src = rowToEvent(srcRes.rows[0]);
  const startD = new Date(overrides.startDate);

  // 2. Create the new event using source layout + provided overrides.
  const newEvent = await createEventRow({
    name: overrides.name,
    month: startD.getMonth() + 1,
    year: startD.getFullYear(),
    venue: src.venue,
    startDate: overrides.startDate,
    endDate: overrides.endDate,
    numberOfDays: src.numberOfDays,
    invitationOpenDate: overrides.invitationOpenDate,
    invitationCloseDate: overrides.invitationCloseDate,
    status: "draft",
    createdBy: overrides.createdBy,
    notes: overrides.notes ?? src.notes,
  });

  // 3. Copy every session, remembering the old → new ID mapping so we can
  //    rewire quotas correctly. Sessions are dayNumber-relative, not
  //    calendar-date-relative, so no time-shift math needed.
  const sessionRowsRes = await pool.query<SessionRow>(
    `SELECT id, event_id, day_number, session_number, start_time, end_time, label
       FROM pcm_sessions
      WHERE event_id = $1 AND tenant_id = $2`,
    [sourceEventId, TENANT],
  );
  const idMap = new Map<string, string>();
  for (const r of sessionRowsRes.rows) {
    const ins = await pool.query<SessionRow>(
      `INSERT INTO pcm_sessions
         (tenant_id, event_id, day_number, session_number, start_time, end_time, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
      [TENANT, newEvent.id, r.day_number, r.session_number, r.start_time, r.end_time, r.label],
    );
    idMap.set(r.id, ins.rows[0].id);
  }

  // 4. Copy every quota, swapping session_id via the map.
  const quotaRowsRes = await pool.query<QuotaRow>(
    `SELECT id, session_id, branch, quota
       FROM pcm_session_quotas
      WHERE session_id = ANY($1::text[]) AND tenant_id = $2`,
    [sessionRowsRes.rows.map(r => r.id), TENANT],
  );
  for (const q of quotaRowsRes.rows) {
    const newSessionId = idMap.get(q.session_id);
    if (!newSessionId) continue;
    await pool.query(
      `INSERT INTO pcm_session_quotas (tenant_id, session_id, branch, quota)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, branch) DO NOTHING`,
      [TENANT, newSessionId, q.branch, q.quota],
    );
  }

  return newEvent;
}

export async function updateEventRow(
  id: string,
  patch: Partial<FAEvent>
): Promise<FAEvent | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    name: "name",
    month: "month",
    year: "year",
    venue: "venue",
    startDate: "start_date",
    endDate: "end_date",
    numberOfDays: "number_of_days",
    invitationOpenDate: "invitation_open_date",
    invitationCloseDate: "invitation_close_date",
    status: "status",
    notes: "notes",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) {
    const { rows } = await pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, created_by, created_at, notes
         FROM pcm_events WHERE id = $1 AND tenant_id = $2`,
      [id, TENANT]
    );
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<EventRow>(
    `UPDATE pcm_events SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, created_by, created_at, notes`,
    values
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function deleteEventRow(id: string): Promise<void> {
  // ON DELETE CASCADE on sessions/quotas/invitations handles cleanup
  await pool.query(`DELETE FROM pcm_events WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function createSessionRow(s: Omit<Session, "id">): Promise<Session> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO pcm_sessions
       (tenant_id, event_id, day_number, session_number, start_time, end_time, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    [TENANT, s.eventId, s.dayNumber, s.sessionNumber, s.startTime, s.endTime, s.label ?? null]
  );
  return rowToSession(rows[0]);
}

export async function updateSessionRow(
  id: string,
  patch: Partial<Session>
): Promise<Session | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    dayNumber: "day_number",
    sessionNumber: "session_number",
    startTime: "start_time",
    endTime: "end_time",
    label: "label",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(v);
    }
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<SessionRow>(
    `UPDATE pcm_sessions SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    values
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function deleteSessionRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM pcm_sessions WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Quotas
// ----------------------------------------------------------------------------

export async function upsertQuotaRow(
  sessionId: string,
  branch: BranchCode,
  quota: number
): Promise<SessionQuota | null> {
  if (quota <= 0) {
    await pool.query(
      `DELETE FROM pcm_session_quotas
        WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
      [sessionId, branch, TENANT]
    );
    return null;
  }
  const { rows } = await pool.query<QuotaRow>(
    `INSERT INTO pcm_session_quotas (tenant_id, session_id, branch, quota)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, branch) DO UPDATE SET quota = EXCLUDED.quota, updated_at = now()
     RETURNING id, session_id, branch, quota`,
    [TENANT, sessionId, branch, quota]
  );
  return rowToQuota(rows[0]);
}

// ----------------------------------------------------------------------------
// Invitations
// ----------------------------------------------------------------------------

// Guard: the studentId MUST resolve to a real student before we create an
// invitation — otherwise we manufacture an orphan that later renders as
// "(not in records)". Active students live in studentrecords (numeric id);
// archived students in archived_students (`arch-<no>`). Throws InvitationRejected
// when the student definitively doesn't exist. Fails OPEN (allows the invite)
// only if the lookup query itself can't run, so an infra hiccup never blocks
// legitimate invites.
async function assertStudentExists(studentId: string): Promise<void> {
  try {
    if (studentId.startsWith("arch-")) {
      // Match on student_id (the loaded id) first; `no` only as a legacy fallback
      // since it no longer equals the original id for newer archives.
      const no = Number(studentId.slice("arch-".length));
      const hasNo = Number.isFinite(no);
      const r = await pool.query(
        `SELECT 1 FROM archived_students WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
        hasNo ? [studentId, no] : [studentId],
      );
      if (r.rowCount === 0) throw new InvitationRejected("Student not found in records — cannot invite an unknown student.");
    } else {
      const id = Number(studentId);
      if (!Number.isFinite(id)) throw new InvitationRejected("Invalid student id — cannot invite an unknown student.");
      const r = await pool.query(`SELECT 1 FROM studentrecords WHERE id = $1 LIMIT 1`, [id]);
      if (r.rowCount === 0) throw new InvitationRejected("Student not found in records — cannot invite an unknown student.");
    }
  } catch (err) {
    if (err instanceof InvitationRejected) throw err;
    console.warn("[pcm] student-exists check skipped (lookup failed):", (err as Error).message);
  }
}

export async function createInvitationRow(args: {
  eventId: string;
  sessionId: string;
  studentId: string;
  branch: BranchCode;
  targetGrade: number;
  status: InvitationStatus;
  invitedBy: string;
  /** "progress" (default) or "renewal". Set by the BM at invite time. */
  inviteType?: InviteType;
}): Promise<Invitation> {
  // 0. The student must exist (active or archived) — never create an orphan.
  await assertStudentExists(args.studentId);

  // Multi-step business-rule check, run as one logical transaction:
  //   1. Is this (event, branch) opted into multi-grade invites, and under
  //      which day-policy (SAME_DAY / DIFF_DAY / BOTH)?
  //   2. Look up existing invitations for this (event, student).
  //      • If none → free to insert.
  //      • If toggle OFF → reject (any prior invite blocks).
  //      • If toggle ON → target_grade must differ, AND the day must satisfy
  //        the branch's day-policy:
  //          SAME_DAY → must be the same day as every prior invite.
  //          DIFF_DAY → must be a different day from every prior invite.
  //          BOTH     → any day allowed.
  //   3. INSERT. The DB still has a final UNIQUE on (event, student, grade)
  //      as a race-condition safety net (23505 trips → "duplicate grade").
  //
  // All rejects surface as InvitationRejected — the route catches it and
  // returns 409 with a descriptive reason.

  // 1. Override check
  const overrideRes = await pool.query<{ day_policy: string | null }>(
    `SELECT day_policy
       FROM pcm_event_branch_overrides
      WHERE event_id = $1 AND branch_code = $2
      LIMIT 1`,
    [args.eventId, args.branch],
  ).catch(async (err) => {
    const code = (err as { code?: string }).code;
    // Overrides table missing entirely → treat as no overrides.
    if (code === "42P01") return { rows: [] as { day_policy: string | null }[] };
    // day_policy column not migrated yet → existence check only, default policy.
    if (code === "42703") {
      const legacy = await pool.query<{ branch_code: string }>(
        `SELECT branch_code
           FROM pcm_event_branch_overrides
          WHERE event_id = $1 AND branch_code = $2
          LIMIT 1`,
        [args.eventId, args.branch],
      );
      return { rows: legacy.rows.map(() => ({ day_policy: null })) };
    }
    throw err;
  });
  const multiGradeAllowed = overrideRes.rows.length > 0;
  const dayPolicy: DayPolicy = normalizeDayPolicy(overrideRes.rows[0]?.day_policy);

  // 2. Look up prior invites + the new session's day number in one query
  const priorRes = await pool.query<{
    target_grade: number | null;
    day_number: number;
    new_day_number: number;
  }>(
    `SELECT i.target_grade,
            s_existing.day_number,
            s_new.day_number AS new_day_number
       FROM pcm_sessions s_new
       LEFT JOIN pcm_invitations i
         ON i.event_id = $1 AND i.student_id = $2 AND i.tenant_id = $3
       LEFT JOIN pcm_sessions s_existing
         ON s_existing.id = i.session_id
      WHERE s_new.id = $4 AND s_new.tenant_id = $3`,
    [args.eventId, args.studentId, TENANT, args.sessionId],
  );

  if (priorRes.rows.length === 0) {
    throw new InvitationRejected("Session not found");
  }
  const newDayNumber = priorRes.rows[0].new_day_number;
  const priorInvites = priorRes.rows
    .filter((r) => r.target_grade != null)
    .map((r) => ({ grade: r.target_grade as number, day: r.day_number }));

  if (priorInvites.length > 0) {
    // Toggle off → first prior invite wins, reject any second.
    if (!multiGradeAllowed) {
      throw new InvitationRejected("Already invited");
    }
    // Toggle on → different target_grade is always required.
    const dupGrade = priorInvites.some((p) => p.grade === args.targetGrade);
    if (dupGrade) {
      throw new InvitationRejected(`Already invited for grade ${args.targetGrade}`);
    }
    // …and the day must satisfy the branch's day-policy.
    if (dayPolicy === "SAME_DAY") {
      const otherDay = priorInvites.find((p) => p.day !== newDayNumber);
      if (otherDay) {
        throw new InvitationRejected(`Booked on day ${otherDay.day} — same-day invites only`);
      }
    } else if (dayPolicy === "DIFF_DAY") {
      const sameDay = priorInvites.find((p) => p.day === newDayNumber);
      if (sameDay) {
        throw new InvitationRejected(`Already booked on day ${newDayNumber} — different-day invites only`);
      }
    }
    // dayPolicy === "BOTH" → no day restriction.
  }

  // 3. INSERT — final DB safety net via UNIQUE(event, student, target_grade).
  const inviteType: InviteType = args.inviteType === "renewal" ? "renewal" : "progress";
  try {
    const { rows } = await pool.query<InvitationRow>(
      `INSERT INTO pcm_invitations
         (tenant_id, event_id, session_id, student_id, branch, target_grade, status, invited_by, invited_at, confirmed_at, invite_type, student_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), CASE WHEN $7 = 'confirmed' THEN now() ELSE NULL END, $9,
               (SELECT name FROM studentrecords WHERE id::text = $4 LIMIT 1))
       RETURNING id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
                 invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, invite_type, coach_id, coach_name, paid, video_sent_to_parent, video_link`,
      [TENANT, args.eventId, args.sessionId, args.studentId, args.branch, args.targetGrade, args.status, args.invitedBy, inviteType]
    );
    return rowToInvitation(rows[0]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      // Race condition: another concurrent insert beat us to this grade.
      throw new InvitationRejected(`Already invited for grade ${args.targetGrade}`);
    }
    throw err;
  }
}

export async function updateInvitationRow(
  id: string,
  patch: {
    status?: InvitationStatus;
    sessionId?: string;
    /** When the BM reschedules the invitation to a session in a different
     *  event, pass the new eventId alongside the new sessionId. Both columns
     *  must change together or the foreign-key consistency is broken. */
    eventId?: string;
    markedBy?: string;
    /** When the BM assigns/changes the coach for this invitation. Pass
     *  `null` (for coachId) to clear the assignment. */
    coachId?: string | null;
    coachName?: string | null;
    /** Allow the BM to flip Progress ↔ Renewal after the fact. */
    inviteType?: InviteType;
    /** Mark this slot as paid / unpaid. Independent of attendance. */
    paid?: boolean;
    /** Which renewal package was paid for (null clears it — e.g. when paid
     *  is set back to false). Validated against PACKAGE_OPTIONS. */
    package?: PackageOption | null;
    /** Academy follow-up flag — absence make-up video sent to the parent. */
    videoSentToParent?: boolean;
    /** Absence make-up video link (null clears it). */
    videoLink?: string | null;
    /** Expected arrival window/time the parent comes to the branch (null clears). */
    arrivalWindow?: ArrivalWindow | null;
    arrivalTime?: string | null;
  }
): Promise<Invitation | null> {
  if (patch.package !== undefined) await ensurePackageColumn();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(patch.status);
    if (patch.status === "confirmed") {
      fields.push(`confirmed_at = now()`);
    }
    if (patch.status === "attended" || patch.status === "no_show") {
      fields.push(`attendance_marked_at = now()`);
      if (patch.markedBy) {
        fields.push(`attendance_marked_by = $${i++}`);
        values.push(patch.markedBy);
      }
    }
  }
  if (patch.sessionId !== undefined) {
    fields.push(`session_id = $${i++}`);
    values.push(patch.sessionId);
  }
  if (patch.eventId !== undefined) {
    fields.push(`event_id = $${i++}`);
    values.push(patch.eventId);
  }
  if (patch.coachId !== undefined) {
    fields.push(`coach_id = $${i++}`);
    values.push(patch.coachId);
  }
  if (patch.coachName !== undefined) {
    fields.push(`coach_name = $${i++}`);
    values.push(patch.coachName);
  }
  if (patch.inviteType !== undefined) {
    fields.push(`invite_type = $${i++}`);
    values.push(patch.inviteType);
  }
  if (patch.paid !== undefined) {
    fields.push(`paid = $${i++}`);
    values.push(patch.paid);
    // Stamp WHEN it was paid (needed for the renewal-gift 3-day rule); clear it
    // when marked unpaid.
    if (patch.paid) {
      fields.push(`paid_at = now()`);
    } else {
      fields.push(`paid_at = NULL`);
      // Unmarking paid always clears the package too, even if the caller
      // didn't explicitly pass package: null — "paid" and "which package"
      // are meant to travel together.
      if (patch.package === undefined) fields.push(`package = NULL`);
    }
  }
  if (patch.package !== undefined) {
    if (patch.package !== null && !PACKAGE_OPTIONS.includes(patch.package)) {
      throw new InvitationRejected(`Invalid package: ${patch.package}`);
    }
    fields.push(`package = $${i++}`);
    values.push(patch.package);
  }
  if (patch.videoSentToParent !== undefined) {
    fields.push(`video_sent_to_parent = $${i++}`);
    values.push(patch.videoSentToParent);
  }
  if (patch.videoLink !== undefined) {
    fields.push(`video_link = $${i++}`);
    values.push(patch.videoLink);
  }
  if (patch.arrivalWindow !== undefined) {
    fields.push(`arrival_window = $${i++}`);
    values.push(patch.arrivalWindow);
  }
  if (patch.arrivalTime !== undefined) {
    fields.push(`arrival_time = $${i++}`);
    values.push(patch.arrivalTime);
  }

  // Reschedule = the slot moves (sessionId/eventId in the patch) WITHOUT an
  // explicit status change. When that happens, a prior attendance verdict
  // (Present/Absent) must NOT travel to the new date — the student should
  // arrive fresh as "Awaiting" so the coach can mark them again on the new
  // day. We only reset rows that actually carry an attendance verdict
  // (attended/no_show); invited/confirmed/declined are left as-is so we never
  // accidentally promote an un-confirmed student. The CASE reads the row's
  // OLD status (Postgres evaluates all SET expressions against pre-update
  // values), so this is safe even alongside the session_id/event_id changes.
  const isReschedule = patch.sessionId !== undefined && patch.status === undefined;
  if (isReschedule) {
    fields.push(`status = CASE WHEN status IN ('attended','no_show') THEN 'confirmed' ELSE status END`);
    fields.push(`attendance_marked_at = CASE WHEN status IN ('attended','no_show') THEN NULL ELSE attendance_marked_at END`);
    fields.push(`attendance_marked_by = CASE WHEN status IN ('attended','no_show') THEN NULL ELSE attendance_marked_by END`);
  }

  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<InvitationRow>(
    `UPDATE pcm_invitations SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
               invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, invite_type, coach_id, coach_name, paid, package, video_sent_to_parent, video_link, arrival_window, arrival_time`,
    values
  );
  if (!rows[0]) return null;
  const invitation = rowToInvitation(rows[0]);
  // When attendance is marked, persist the picked grade onto the student's
  // pcm_progress_json so the box-checklist on the BM invite modal updates
  // immediately and the change survives a full page reload.
  if (patch.status === "attended" && invitation.targetGrade > 0) {
    await markPcmProgressForStudent(invitation.studentId, invitation.targetGrade);
  }
  return invitation;
}

/** Mark grade `grade` as completed in a student's pcm_progress_json array.
 *  Called from updateInvitationRow whenever an invitation is marked
 *  `attended`, so the student's PCM box-checklist (rendered in the invite
 *  modal and on the Student List page) reflects the new completion.
 *  The array is indexed 0-based (index `grade-1` = entry for grade `grade`).
 *  Read-modify-write so we handle shorter/null arrays defensively. */
export async function markPcmProgressForStudent(
  studentId: string,
  grade: number,
): Promise<void> {
  if (grade < 1) return;
  // Archived students live in a different table keyed by `no` (id = "arch-<no>").
  // Route their PCM-progress writeback there so the tick survives like a live
  // student's.
  if (studentId.startsWith("arch-")) {
    await markArchivedPcmProgress(studentId, grade);
    return;
  }
  const sid = Number(studentId);
  if (!Number.isFinite(sid)) return;
  const { rows } = await pool.query<{ pcm_progress_json: unknown }>(
    `SELECT pcm_progress_json FROM studentrecords WHERE id = $1`,
    [sid]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].pcm_progress_json)
    ? (rows[0].pcm_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE studentrecords SET pcm_progress_json = $1::jsonb WHERE id = $2`,
    [JSON.stringify(arr), sid]
  );
}

/** PCM-progress writeback for an archived student (id "arch-<no>") — mirrors
 *  markPcmProgressForStudent but targets archived_students keyed on `no`. */
async function markArchivedPcmProgress(studentId: string, grade: number): Promise<void> {
  if (grade < 1) return;
  // Resolve the archived row by `student_id` (= the loaded PCM id) first, falling
  // back to `no` for legacy rows. `no` no longer equals the original id for newer
  // archives, so student_id is the reliable key.
  const parsedNo = Number(studentId.slice("arch-".length));
  const hasNo = Number.isFinite(parsedNo);
  const { rows } = await pool.query<{ no: number; pcm_progress_json: unknown }>(
    `SELECT no, pcm_progress_json FROM archived_students
      WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
    hasNo ? [studentId, parsedNo] : [studentId]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].pcm_progress_json)
    ? (rows[0].pcm_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE archived_students SET pcm_progress_json = $1::jsonb WHERE no = $2`,
    [JSON.stringify(arr), rows[0].no]
  );
}

export async function deleteInvitationRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM pcm_invitations WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

export async function countInvitationsForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM pcm_invitations
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return Number(rows[0]?.count ?? "0");
}

export async function getEventStatus(eventId: string): Promise<EventStatus | null> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM pcm_events WHERE id = $1 AND tenant_id = $2`,
    [eventId, TENANT]
  );
  return rows[0] ? (rows[0].status as EventStatus) : null;
}

// ----------------------------------------------------------------------------
// Event branch overrides (multi-grade exception per event per branch)
// ----------------------------------------------------------------------------

export async function upsertEventBranchOverrideRow(args: {
  eventId: string;
  branchCode: BranchCode;
  dayPolicy?: DayPolicy;
  grantedBy: string;
  reason?: string;
}): Promise<EventBranchOverride> {
  const dayPolicy = normalizeDayPolicy(args.dayPolicy);
  const { rows } = await pool.query<EventBranchOverrideRow>(
    `INSERT INTO pcm_event_branch_overrides (event_id, branch_code, day_policy, granted_by, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_id, branch_code) DO UPDATE
       SET day_policy = EXCLUDED.day_policy,
           granted_by = EXCLUDED.granted_by,
           granted_at = now(),
           reason     = EXCLUDED.reason
     RETURNING event_id, branch_code, day_policy, granted_by, granted_at, reason`,
    [args.eventId, args.branchCode, dayPolicy, args.grantedBy, args.reason ?? null]
  );
  return rowToOverride(rows[0]);
}

export async function deleteEventBranchOverrideRow(
  eventId: string,
  branchCode: BranchCode
): Promise<void> {
  await pool.query(
    `DELETE FROM pcm_event_branch_overrides WHERE event_id = $1 AND branch_code = $2`,
    [eventId, branchCode]
  );
}

export async function getQuotaForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number | null> {
  const { rows } = await pool.query<{ quota: number }>(
    `SELECT quota FROM pcm_session_quotas
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return rows[0] ? rows[0].quota : null;
}
