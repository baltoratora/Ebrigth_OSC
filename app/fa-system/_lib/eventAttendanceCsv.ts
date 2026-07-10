// ============================================================================
// Shared builder for the whole-event attendance CSV: every invitation across
// every day/session for one event, joined with student + branch + inviter
// details. Used by both the Attendance page and the Marketing event detail.
// ============================================================================

import { BRANCHES, FAEvent, Invitation, Session, Student, User, hasBacklog } from "@fa/_types";

type Cell = string | number | boolean | null | undefined;

export interface EventAttendanceInput {
  event: FAEvent;
  sessions: Session[];
  invitations: Invitation[];
  students: Student[];
  users: User[];
}

export interface EventAttendanceOutput {
  filename: string;
  rows: Cell[][];
}

const HEADER: string[] = [
  "Student name", "Student ID", "Branch code", "Branch name",
  "Grade", "Credit",
  "Day", "Session #", "Session time", "Session label",
  "Status", "Has backlog",
  "Invited by", "Invited at", "Confirmed at", "Attendance marked at",
  "Parent name", "Parent phone", "Enrolment date",
];

/** Builds a normalised CSV view of every invitation for an event. Sessions
 *  are sorted by day, then session number, so two-day events read top-to-
 *  bottom in chronological order. */
export function buildEventAttendanceCsv(input: EventAttendanceInput): EventAttendanceOutput {
  const { event, sessions, invitations, students, users } = input;
  const branchNameByCode: Record<string, string> = Object.fromEntries(
    BRANCHES.map(b => [b.code, b.name])
  );
  const sessionById = new Map(sessions.map(s => [s.id, s]));
  const studentById = new Map(students.map(s => [s.id, s]));
  const userById    = new Map(users.map(u => [u.id, u]));

  const eventInvitations = invitations.filter(i => i.eventId === event.id);

  const rows: Cell[][] = eventInvitations
    .map(inv => {
      const student = studentById.get(inv.studentId);
      const sess    = sessionById.get(inv.sessionId);
      const inviter = userById.get(inv.invitedBy);
      return [
        student?.name ?? "(unknown)",
        inv.studentId,
        inv.branch,
        branchNameByCode[inv.branch] ?? "",
        // Grade = the grade the student is being appraised for (the one they
        // chose to join), matching the roster / medals / certificates. Falls
        // back to the student's current grade for legacy rows without a target.
        inv.targetGrade && inv.targetGrade > 0 ? inv.targetGrade : (student?.grade ?? ""),
        student?.credit ?? "",
        sess?.dayNumber ?? "",
        sess?.sessionNumber ?? "",
        sess ? `${sess.startTime}-${sess.endTime}` : "",
        sess?.label ?? "",
        inv.status,
        student ? (hasBacklog(student) ? "yes" : "no") : "",
        inviter?.name ?? inv.invitedBy,
        inv.invitedAt,
        inv.confirmedAt ?? "",
        inv.attendanceMarkedAt ?? "",
        student?.parentName ?? "",
        student?.parentPhone ?? "",
        student?.enrolmentDate ?? "",
      ];
    })
    .sort((a, b) => {
      // Branch, then day, then session number, then student name.
      const branchCmp = String(a[2]).localeCompare(String(b[2]));
      if (branchCmp !== 0) return branchCmp;
      const dayCmp = (Number(a[6]) || 0) - (Number(b[6]) || 0);
      if (dayCmp !== 0) return dayCmp;
      const sessCmp = (Number(a[7]) || 0) - (Number(b[7]) || 0);
      if (sessCmp !== 0) return sessCmp;
      return String(a[0]).localeCompare(String(b[0]));
    });

  const safeName = event.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  return {
    filename: `FA_${safeName}_attendance.csv`,
    rows: [HEADER, ...rows],
  };
}
