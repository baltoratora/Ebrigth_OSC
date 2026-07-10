"use client";

import { Clock, CheckCircle2, XCircle, GripVertical } from "lucide-react";

// ── Grade colour system ──────────────────────────────────────────────────────
// Each grade (1–8) gets a unique colour. Grade 5 uses bold amber/gold to
// visually reinforce its priority (top-of-list) position.
const GRADE_STYLES: Record<number, { row: string; badge: string; label: string }> = {
  1: { row: "bg-violet-100 hover:bg-violet-200",  badge: "bg-violet-300  text-violet-900  ring-1 ring-violet-400",  label: "Grade 1" },
  2: { row: "bg-blue-100   hover:bg-blue-200",    badge: "bg-blue-300    text-blue-900    ring-1 ring-blue-400",    label: "Grade 2" },
  3: { row: "bg-cyan-100   hover:bg-cyan-200",    badge: "bg-cyan-300    text-cyan-900    ring-1 ring-cyan-400",    label: "Grade 3" },
  4: { row: "bg-teal-100   hover:bg-teal-200",    badge: "bg-teal-300    text-teal-900    ring-1 ring-teal-400",    label: "Grade 4" },
  5: { row: "bg-amber-200  hover:bg-amber-300",   badge: "bg-amber-500   text-amber-950   ring-1 ring-amber-600 font-bold", label: "Grade 5 ★" },
  6: { row: "bg-orange-100 hover:bg-orange-200",  badge: "bg-orange-300  text-orange-900  ring-1 ring-orange-400",  label: "Grade 6" },
  7: { row: "bg-rose-100   hover:bg-rose-200",    badge: "bg-rose-300    text-rose-900    ring-1 ring-rose-400",    label: "Grade 7" },
  8: { row: "bg-fuchsia-100 hover:bg-fuchsia-200", badge: "bg-fuchsia-300 text-fuchsia-900 ring-1 ring-fuchsia-400", label: "Grade 8" },
};

function gradeStyle(grade: number) {
  return GRADE_STYLES[grade] ?? {
    row:   "bg-ivory-100 hover:bg-ivory-200",
    badge: "bg-ivory-300 text-ink-800 ring-1 ring-ivory-400",
    label: `Grade ${grade}`,
  };
}

/** Colour-key pills shown above the roster table. */
function GradeLegend({ grades }: { grades: number[] }) {
  if (grades.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-xs text-ink-400 mr-1">Grade key:</span>
      {grades.map(g => (
        <span key={g} className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeStyle(g).badge}`}>
          {gradeStyle(g).label}
        </span>
      ))}
    </div>
  );
}
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { StatusPill } from "@fa/_components/fa/StatusPill";
import { BRANCHES, Invitation, Student, resolveStudentById, countsAsAttended } from "@fa/_types";
import { ModuleBadge } from "@fa/_components/fa/ModuleBadge";

export function AttendanceRoster({
  session, orderedInvitations, pendingConfirmationsCount, canEdit, canDrag,
}: {
  session: { dayNumber: number; sessionNumber: number; startTime: string; endTime: string; label?: string };
  /** Pre-filtered, pre-ordered list of invitations the page wants displayed.
   *  Page owns ordering (applies sessionOrder + branch filter + status filter)
   *  so the roster and the dnd-kit handler always see the same sequence. */
  orderedInvitations: Invitation[];
  pendingConfirmationsCount: number;
  canEdit: boolean;
  /** When true, render drag handles and wire up dnd-kit sortable rows. MKT-only. */
  canDrag: boolean;
}) {
  const user = useCurrentUser();
  const students = useFAStore(s => s.students);
  const updateStatus = useFAStore(s => s.updateInvitationStatus);

  const attended = orderedInvitations.filter(i => countsAsAttended(i.status)).length;
  const noShow = orderedInvitations.filter(i => i.status === "no_show").length;
  const awaiting = orderedInvitations.filter(i => i.status === "confirmed").length;

  function setAttendance(invId: string, status: "attended" | "no_show" | "confirmed") {
    if (!canEdit) return;
    updateStatus(invId, status, user?.id);
  }

  const sortableIds = orderedInvitations.map(i => i.id);

  // Unique grades present in this session — Grade 5 first, rest ascending.
  const legendGrades = Array.from(
    new Set(orderedInvitations.map(i => i.targetGrade ?? 0).filter(g => g > 0))
  ).sort((a, b) => (a === 5 ? -1 : b === 5 ? 1 : a - b));

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold text-brand-900">
              Day {session.dayNumber} · Session {session.sessionNumber}
            </span>
            <Clock className="w-3 h-3 text-ink-300" />
            <span className="text-sm text-ink-500">
              {session.startTime}–{session.endTime}
            </span>
          </div>
          <h2 className="fa-display text-2xl text-ink-900">
            {session.label || `Session ${session.sessionNumber}`}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="fa-display text-2xl text-success">{attended}</div>
            <div className="text-xs text-ink-400 uppercase tracking-wider">Attended</div>
          </div>
          <div className="text-right">
            <div className="fa-display text-2xl text-danger">{noShow}</div>
            <div className="text-xs text-ink-400 uppercase tracking-wider">No show</div>
          </div>
          <div className="text-right">
            <div className="fa-display text-2xl text-ink-600">{awaiting}</div>
            <div className="text-xs text-ink-400 uppercase tracking-wider">Awaiting</div>
          </div>
        </div>
      </div>

      {/* Grade colour legend */}
      <GradeLegend grades={legendGrades} />

      {/* Unconfirmed warning */}
      {pendingConfirmationsCount > 0 && (
        <div className="fa-card p-3 mb-4 border-l-4 border-l-warning bg-warning-soft/30 flex items-center gap-3">
          <span className="text-sm text-ink-600">
            <strong className="text-ink-900">{pendingConfirmationsCount}</strong> invitation{pendingConfirmationsCount !== 1 ? "s" : ""} still pending parent confirmation and not shown below.
          </span>
        </div>
      )}

      {orderedInvitations.length === 0 ? (
        <div className="fa-card p-8 text-center text-sm text-ink-400">
          No confirmed students for this session yet.
        </div>
      ) : (
        <div className="fa-card overflow-hidden">
          <table className="fa-table">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                {canDrag && <th className="w-8" aria-label="Drag" />}
                <th>Student</th>
                <th>Branch</th>
                <th>Grade</th>
                <th>Parent</th>
                <th>Confirmation</th>
                <th className="text-right">Attendance</th>
              </tr>
            </thead>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {orderedInvitations.map((inv, idx) => {
                  const looked = resolveStudentById(students, inv.studentId);
                  // Orphaned invitation (student removed from Heidi after invite):
                  // show a placeholder row instead of dropping it, so the roster
                  // count matches the visible rows and it stays actionable.
                  const student: Student = looked ?? {
                    id: inv.studentId,
                    name: inv.studentNameSnapshot
                      ? `${inv.studentNameSnapshot} (unlinked)`
                      : `#${inv.studentId} (not in records)`,
                    branch: inv.branch,
                    grade: inv.targetGrade ?? 0,
                    ageCategory: "Junior",
                    credit: 0,
                    faHistory: {},
                    parentName: "",
                    parentPhone: "",
                    enrolmentDate: "",
                    active: false,
                    archived: false,
                  };
                  return (
                    <SortableInvitationRow
                      key={inv.id}
                      inv={inv}
                      student={student}
                      position={idx + 1}
                      canEdit={canEdit}
                      canDrag={canDrag}
                      onAttended={() => setAttendance(inv.id, "attended")}
                      onNoShow={() => setAttendance(inv.id, "no_show")}
                      onReset={() => setAttendance(inv.id, "confirmed")}
                    />
                  );
                })}
              </tbody>
            </SortableContext>
          </table>
        </div>
      )}
    </div>
  );
}

function SortableInvitationRow({
  inv, student, position, canEdit, canDrag,
  onAttended, onNoShow, onReset,
}: {
  inv: Invitation;
  student: Student;
  position: number;
  canEdit: boolean;
  canDrag: boolean;
  onAttended: () => void;
  onNoShow: () => void;
  onReset: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: inv.id,
    disabled: !canDrag,
  });
  const grade = inv.targetGrade ?? student.grade;
  const gs    = gradeStyle(grade);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? "var(--color-ivory-100)" : undefined,
  };
  const branchInfo = BRANCHES.find(b => b.code === inv.branch);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={!isDragging ? gs.row : undefined}
      {...attributes}
    >
      <td className="text-right fa-mono text-ink-500">{position}</td>
      {canDrag && (
        <td>
          <button
            type="button"
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-ink-400 hover:text-ink-700 p-1 rounded touch-none"
            aria-label={`Drag ${student.name} to reorder or move to another session`}
            title="Drag to reorder or transfer"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </td>
      )}
      <td>
        <div className="font-medium text-ink-900">{student.name}</div>
        <div className="text-xs text-ink-400">#{student.id}</div>
      </td>
      <td>
        <span className="font-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-0.5 rounded" title={branchInfo?.name}>
          {inv.branch}
        </span>
      </td>
      <td>
        {(() => {
          const g = inv.targetGrade ?? student.grade;
          return (
            <div className="flex items-center gap-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium font-mono ${gradeStyle(g).badge}`}>
                G{g}
              </span>
              <ModuleBadge category={student.ageCategory} />
            </div>
          );
        })()}
      </td>
      <td>
        <div className="text-sm text-ink-900">{student.parentName}</div>
        <div className="text-xs text-ink-400 font-mono">{student.parentPhone}</div>
      </td>
      <td>
        {inv.confirmedAt ? (
          <StatusPill tone="success" showDot={false}>
            <CheckCircle2 className="w-3 h-3 inline mr-1" />
            Confirmed
          </StatusPill>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        )}
      </td>
      <td>
        {inv.status === "walk_in" ? (
          // Walk-ins are present by definition — no Present/Absent toggle.
          <div className="flex items-center justify-end">
            <StatusPill tone="walk_in" showDot={false}>
              <CheckCircle2 className="w-3 h-3 inline mr-1" />
              Walk-in
            </StatusPill>
          </div>
        ) : (
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={onAttended}
              disabled={!canEdit}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                inv.status === "attended"
                  ? "bg-success-soft text-success ring-1 ring-success/30"
                  : "text-ink-500 hover:bg-ivory-200"
              } ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
              Present
            </button>
            <button
              onClick={onNoShow}
              disabled={!canEdit}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                inv.status === "no_show"
                  ? "bg-danger-soft text-danger ring-1 ring-danger/30"
                  : "text-ink-500 hover:bg-ivory-200"
              } ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <XCircle className="w-3.5 h-3.5 inline mr-1" />
              Absent
            </button>
            {(inv.status === "attended" || inv.status === "no_show") && canEdit && (
              <button
                onClick={onReset}
                className="text-xs text-ink-400 hover:text-ink-700 px-2"
                title="Reset to awaiting"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
