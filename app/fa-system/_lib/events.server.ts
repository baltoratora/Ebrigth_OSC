import "server-only";
import { pool } from "./db";
import {
  BranchCode,
  DayPolicy,
  EventBranchOverride,
  EventStatus,
  FAEvent,
  Invitation,
  InvitationStatus,
  Session,
  SessionQuota,
} from "@fa/_types";

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
  student_name_snapshot?: string | null;
  video_link?: string | null;
  proof_url?: string | null;
  practice_date?: string | null;
  practice_time?: string | null;
}

// Self-provisioning columns for the confirm-proof + practice-scheduling
// feature. Same idea as ensureTable()/ensureColumns() elsewhere in this app
// (e.g. flagged_action_log, career_applications): run once per server process
// via ADD COLUMN IF NOT EXISTS, so the columns exist before any write touches
// them — no separate manual migration step required.
let columnsEnsured: Promise<void> | null = null;
function ensureConfirmProofColumns(): Promise<void> {
  if (!columnsEnsured) {
    columnsEnsured = pool.query(`
      ALTER TABLE fa_invitations
        ADD COLUMN IF NOT EXISTS video_link    text,
        ADD COLUMN IF NOT EXISTS proof_url     text,
        ADD COLUMN IF NOT EXISTS practice_date date,
        ADD COLUMN IF NOT EXISTS practice_time text
    `).then(() => undefined).catch((err) => {
      columnsEnsured = null; // let the next call retry
      throw err;
    });
  }
  return columnsEnsured;
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
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
}

function isoTimestamp(d: Date | string | null): string | undefined {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

/** Date-only field (e.g. practice_date), null-safe. Postgres `date` columns
 *  come back as a UTC-midnight Date via node-pg; toISOString() is always UTC
 *  so this reads the calendar date correctly regardless of server timezone. */
function isoDateOrNull(d: Date | string | null | undefined): string | undefined {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d).split("T")[0];
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
    numberOfDays: (r.number_of_days as 1 | 2 | 3),
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
    dayNumber: r.day_number as 1 | 2 | 3,
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

function rowToInvitation(r: InvitationRow): Invitation {
  return {
    id: r.id,
    eventId: r.event_id,
    sessionId: r.session_id,
    studentId: r.student_id,
    branch: r.branch as BranchCode,
    targetGrade: r.target_grade ?? 0,
    status: r.status as InvitationStatus,
    invitedBy: r.invited_by ?? "",
    invitedAt: isoTimestamp(r.invited_at) ?? new Date().toISOString(),
    confirmedAt: isoTimestamp(r.confirmed_at),
    attendanceMarkedAt: isoTimestamp(r.attendance_marked_at),
    attendanceMarkedBy: r.attendance_marked_by ?? undefined,
    notes: r.notes ?? undefined,
    studentNameSnapshot: r.student_name_snapshot ?? undefined,
    videoLink: r.video_link ?? undefined,
    proofUrl: r.proof_url ?? undefined,
    practiceDate: isoDateOrNull(r.practice_date),
    practiceTime: r.practice_time ?? undefined,
  };
}

// RETURNING column list for fa_invitations writes. ensureConfirmProofColumns()
// runs before every write that uses this, so video_link/proof_url/practice_date/
// practice_time are always present by the time this SELECT runs.
const INV_RETURNING_FULL =
  `id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
   invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes, student_name_snapshot,
   video_link, proof_url, practice_date, practice_time`;

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export async function fetchAllEventData(): Promise<{
  events: FAEvent[];
  sessions: Session[];
  quotas: SessionQuota[];
  invitations: Invitation[];
  overrides: EventBranchOverride[];
}> {
  await ensureConfirmProofColumns();
  const [eventsRes, sessionsRes, quotasRes, invitationsRes, overridesRes] = await Promise.all([
    pool.query<EventRow>(
      `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
              invitation_open_date, invitation_close_date, status, created_by, created_at, notes
         FROM fa_events
        WHERE tenant_id = $1
        ORDER BY start_date DESC, created_at DESC`,
      [TENANT]
    ),
    pool.query<SessionRow>(
      `SELECT id, event_id, day_number, session_number, start_time, end_time, label
         FROM fa_sessions
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM fa_session_quotas
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    pool.query<InvitationRow>(
      `SELECT id, event_id, session_id, student_id, branch, target_grade, status, invited_by,
              invited_at, confirmed_at, attendance_marked_at, attendance_marked_by, notes,
              student_name_snapshot, video_link, proof_url, practice_date, practice_time
         FROM fa_invitations
        WHERE tenant_id = $1`,
      [TENANT]
    ),
    // Per-event per-branch multi-grade overrides. The fa_event_branch_overrides
    // table may not exist on older deploys yet — wrap in a try so the FA
    // dashboard still loads if the migration hasn't been applied.
    pool.query<EventBranchOverrideRow>(
      `SELECT event_id, branch_code, day_policy, granted_by, granted_at, reason
         FROM fa_event_branch_overrides`,
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
             FROM fa_event_branch_overrides`,
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
    `INSERT INTO fa_events
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
 * Clone an event: copies the source's session layout + per-branch quotas into
 * a new DRAFT event with the supplied name/dates. Sessions are day-relative so
 * no date-shift math is needed; quotas are rewired to the new session ids.
 * Invitations and multi-grade overrides are NOT copied — the clone starts empty.
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
  const srcRes = await pool.query<EventRow>(
    `SELECT id, name, month, year, venue, start_date, end_date, number_of_days,
            invitation_open_date, invitation_close_date, status, created_by, created_at, notes
       FROM fa_events WHERE id = $1 AND tenant_id = $2`,
    [sourceEventId, TENANT],
  );
  if (!srcRes.rows[0]) return null;
  const src = rowToEvent(srcRes.rows[0]);
  const startD = new Date(overrides.startDate);

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

  // Copy sessions, remembering old → new id so quotas can be rewired.
  const sessionRowsRes = await pool.query<SessionRow>(
    `SELECT id, event_id, day_number, session_number, start_time, end_time, label
       FROM fa_sessions WHERE event_id = $1 AND tenant_id = $2`,
    [sourceEventId, TENANT],
  );
  const idMap = new Map<string, string>();
  for (const r of sessionRowsRes.rows) {
    const ins = await pool.query<SessionRow>(
      `INSERT INTO fa_sessions
         (tenant_id, event_id, day_number, session_number, start_time, end_time, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
      [TENANT, newEvent.id, r.day_number, r.session_number, r.start_time, r.end_time, r.label],
    );
    idMap.set(r.id, ins.rows[0].id);
  }

  // Copy quotas, swapping session_id via the map.
  if (sessionRowsRes.rows.length > 0) {
    const quotaRowsRes = await pool.query<QuotaRow>(
      `SELECT id, session_id, branch, quota
         FROM fa_session_quotas WHERE session_id = ANY($1::text[]) AND tenant_id = $2`,
      [sessionRowsRes.rows.map(r => r.id), TENANT],
    );
    for (const q of quotaRowsRes.rows) {
      const newSessionId = idMap.get(q.session_id);
      if (!newSessionId) continue;
      await pool.query(
        `INSERT INTO fa_session_quotas (tenant_id, session_id, branch, quota)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (session_id, branch) DO NOTHING`,
        [TENANT, newSessionId, q.branch, q.quota],
      );
    }
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
         FROM fa_events WHERE id = $1 AND tenant_id = $2`,
      [id, TENANT]
    );
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<EventRow>(
    `UPDATE fa_events SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, name, month, year, venue, start_date, end_date, number_of_days,
               invitation_open_date, invitation_close_date, status, created_by, created_at, notes`,
    values
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function deleteEventRow(id: string): Promise<void> {
  // ON DELETE CASCADE on sessions/quotas/invitations handles cleanup
  await pool.query(`DELETE FROM fa_events WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export async function createSessionRow(s: Omit<Session, "id">): Promise<Session> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO fa_sessions
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
    `UPDATE fa_sessions SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING id, event_id, day_number, session_number, start_time, end_time, label`,
    values
  );
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function deleteSessionRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_sessions WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
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
      `DELETE FROM fa_session_quotas
        WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
      [sessionId, branch, TENANT]
    );
    return null;
  }
  const { rows } = await pool.query<QuotaRow>(
    `INSERT INTO fa_session_quotas (tenant_id, session_id, branch, quota)
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
    console.warn("[fa] student-exists check skipped (lookup failed):", (err as Error).message);
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
       FROM fa_event_branch_overrides
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
           FROM fa_event_branch_overrides
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
       FROM fa_sessions s_new
       LEFT JOIN fa_invitations i
         ON i.event_id = $1 AND i.student_id = $2 AND i.tenant_id = $3
       LEFT JOIN fa_sessions s_existing
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
  await ensureConfirmProofColumns();
  const insertArgs = [TENANT, args.eventId, args.sessionId, args.studentId, args.branch, args.targetGrade, args.status, args.invitedBy];
  try {
    const { rows } = await pool.query<InvitationRow>(
      `INSERT INTO fa_invitations
           (tenant_id, event_id, session_id, student_id, branch, target_grade, status, invited_by, invited_at, confirmed_at, student_name_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), CASE WHEN $7 IN ('confirmed', 'walk_in') THEN now() ELSE NULL END,
                 -- Snapshot the student's name at invite time so the roster can
                 -- still show who this is even if the student id later breaks
                 -- (archive/restore/delete). Mirrors pcm_invitations.
                 COALESCE(
                   (SELECT name FROM studentrecords WHERE id::text = $4),
                   (SELECT name FROM archived_students
                     WHERE student_id = $4 OR student_id = 'arch-' || $4 OR no::text = $4
                     LIMIT 1)
                 ))
         RETURNING ${INV_RETURNING_FULL}`,
      insertArgs,
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
    markedBy?: string;
    /** Confirm-proof: link to the student's testing video. */
    videoLink?: string;
    /** Confirm-proof: Google Drive link to the uploaded proof image. */
    proofUrl?: string;
    /** Practice-session scheduling: both optional, neither gates the other. */
    practiceDate?: string | null;
    practiceTime?: string | null;
  }
): Promise<Invitation | null> {
  await ensureConfirmProofColumns();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(patch.status);
    if (patch.status === "confirmed") {
      fields.push(`confirmed_at = now()`);
    }
    if (patch.status === "attended" || patch.status === "no_show" || patch.status === "walk_in") {
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
  if (patch.videoLink !== undefined) {
    fields.push(`video_link = $${i++}`);
    values.push(patch.videoLink || null);
  }
  if (patch.proofUrl !== undefined) {
    fields.push(`proof_url = $${i++}`);
    values.push(patch.proofUrl || null);
  }
  if (patch.practiceDate !== undefined) {
    fields.push(`practice_date = $${i++}`);
    values.push(patch.practiceDate || null);
  }
  if (patch.practiceTime !== undefined) {
    fields.push(`practice_time = $${i++}`);
    values.push(patch.practiceTime || null);
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = now()`);
  values.push(id, TENANT);
  const { rows } = await pool.query<InvitationRow>(
    `UPDATE fa_invitations SET ${fields.join(", ")} WHERE id = $${i++} AND tenant_id = $${i}
     RETURNING ${INV_RETURNING_FULL}`,
    values,
  );
  const row = rows[0] ?? null;
  if (!row) return null;
  const invitation = rowToInvitation(row);
  // When attendance is marked, persist the picked grade onto the student's
  // fa_progress_json so the FA tick stays after the event.
  if ((patch.status === "attended" || patch.status === "walk_in") && invitation.targetGrade > 0) {
    await markFaProgressForStudent(invitation.studentId, invitation.targetGrade);
  }
  return invitation;
}

/** Mark grade `grade` as completed in a student's fa_progress_json array.
 *  The array is indexed 0-based (index `grade-1` = entry for grade `grade`).
 *  Read-modify-write so we handle shorter/null arrays defensively. */
export async function markFaProgressForStudent(
  studentId: string,
  grade: number,
): Promise<void> {
  if (grade < 1) return;
  // Archived students live in a different table keyed by `no` (id = "arch-<no>").
  // Route their FA-progress writeback there so the tick survives just like a
  // live student's.
  if (studentId.startsWith("arch-")) {
    await markArchivedFaProgress(studentId, grade);
    return;
  }
  const sid = Number(studentId);
  if (!Number.isFinite(sid)) return;
  const { rows } = await pool.query<{ fa_progress_json: unknown }>(
    `SELECT fa_progress_json FROM studentrecords WHERE id = $1`,
    [sid]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].fa_progress_json)
    ? (rows[0].fa_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE studentrecords SET fa_progress_json = $1::jsonb WHERE id = $2`,
    [JSON.stringify(arr), sid]
  );
}

/** FA-progress writeback for an archived student (id "arch-<no>"). Mirrors
 *  markFaProgressForStudent but targets the `archived_students` table keyed on
 *  its `no` column. */
async function markArchivedFaProgress(studentId: string, grade: number): Promise<void> {
  if (grade < 1) return;
  // Resolve the archived row by `student_id` (= the loaded FA id) first, falling
  // back to `no` for legacy rows. `no` is a fresh sequence for archives created
  // after it stopped equalling the original id, so student_id is the reliable key.
  const parsedNo = Number(studentId.slice("arch-".length));
  const hasNo = Number.isFinite(parsedNo);
  const { rows } = await pool.query<{ no: number; fa_progress_json: unknown }>(
    `SELECT no, fa_progress_json FROM archived_students
      WHERE student_id = $1${hasNo ? " OR no = $2" : ""} LIMIT 1`,
    hasNo ? [studentId, parsedNo] : [studentId]
  );
  if (!rows[0]) return;
  const arr: boolean[] = Array.isArray(rows[0].fa_progress_json)
    ? (rows[0].fa_progress_json as unknown[]).map(v => v === true)
    : [];
  while (arr.length < grade) arr.push(false);
  arr[grade - 1] = true;
  await pool.query(
    `UPDATE archived_students SET fa_progress_json = $1::jsonb WHERE no = $2`,
    [JSON.stringify(arr), rows[0].no]
  );
}

export async function deleteInvitationRow(id: string): Promise<void> {
  await pool.query(`DELETE FROM fa_invitations WHERE id = $1 AND tenant_id = $2`, [id, TENANT]);
}

export async function countInvitationsForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM fa_invitations
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return Number(rows[0]?.count ?? "0");
}

export async function getEventStatus(eventId: string): Promise<EventStatus | null> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM fa_events WHERE id = $1 AND tenant_id = $2`,
    [eventId, TENANT]
  );
  return rows[0] ? (rows[0].status as EventStatus) : null;
}

// Status of the event a given invitation belongs to. Used by the invitation
// PATCH/DELETE routes to enforce per-role write windows — a Branch Manager may
// only change an invitation while its event is still open or on event day.
export async function getEventStatusByInvitation(
  invitationId: string
): Promise<EventStatus | null> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT e.status
       FROM fa_invitations i
       JOIN fa_events e ON e.id = i.event_id AND e.tenant_id = i.tenant_id
      WHERE i.id = $1 AND i.tenant_id = $2`,
    [invitationId, TENANT]
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
    `INSERT INTO fa_event_branch_overrides (event_id, branch_code, day_policy, granted_by, reason)
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
    `DELETE FROM fa_event_branch_overrides WHERE event_id = $1 AND branch_code = $2`,
    [eventId, branchCode]
  );
}

export async function getQuotaForSessionBranch(
  sessionId: string,
  branch: BranchCode
): Promise<number | null> {
  const { rows } = await pool.query<{ quota: number }>(
    `SELECT quota FROM fa_session_quotas
      WHERE session_id = $1 AND branch = $2 AND tenant_id = $3`,
    [sessionId, branch, TENANT]
  );
  return rows[0] ? rows[0].quota : null;
}
