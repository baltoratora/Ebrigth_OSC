"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { FAEvent, Invitation, Student } from "@pcm/_types";

interface Props {
  open: boolean;
  onClose: () => void;
  event: FAEvent;
  sessionId: string;
}

// Stable empty default so the Zustand selector keeps a stable reference
// when the event has no packed state recorded yet.
const EMPTY: string[] = [];

export function MedalSessionModal({ open, onClose, event, sessionId }: Props) {
  const allStudents = useFAStore(s => s.students);
  const allSessions = useFAStore(s => s.sessions);
  const allInvitations = useFAStore(s => s.invitations);
  const packedKeys = useFAStore(s => s.packedItems[event.id] ?? EMPTY);
  const togglePacked = useFAStore(s => s.togglePackedItem);

  const session = allSessions.find(s => s.id === sessionId) ?? null;

  // Attendees in this session, with their student record. Sorted by grade
  // (so MKT can pack grade-by-grade) then by name within a grade.
  const attendees = useMemo(() => {
    return allInvitations
      .filter(i => i.sessionId === sessionId && (i.status === "confirmed" || i.status === "attended"))
      .map(i => ({ inv: i, student: allStudents.find(s => s.id === i.studentId) ?? null }))
      .filter((x): x is { inv: Invitation; student: Student } => x.student !== null)
      .sort((a, b) => a.student.grade - b.student.grade || a.student.name.localeCompare(b.student.name));
  }, [allInvitations, sessionId, allStudents]);

  // Aggregate by grade for the summary strip at the top.
  const byGrade = useMemo(() => {
    const map = new Map<number, number>();
    attendees.forEach(({ student }) => {
      map.set(student.grade, (map.get(student.grade) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [attendees]);

  const isPacked = (invId: string) => packedKeys.includes(`medals:${sessionId}:${invId}`);
  const onToggle = (invId: string) => togglePacked(event.id, `medals:${sessionId}:${invId}`);

  const packedCount = attendees.filter(({ inv }) => isPacked(inv.id)).length;
  const allPacked = attendees.length > 0 && packedCount === attendees.length;

  if (!session) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Medals"
      title={session.label
        ? `${session.label} (Day ${session.dayNumber} · Session ${session.sessionNumber})`
        : `Day ${session.dayNumber} · Session ${session.sessionNumber}`}
      description="Tick each medal as you pack it. Each medal is engraved with the student's grade."
      size="lg"
    >
      {/* Grade summary strip */}
      {byGrade.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-4 border-b border-ivory-300">
          <span
            className="fa-mono text-[10px] uppercase text-ink-400 mr-2"
            style={{ letterSpacing: "0.1em" }}
          >
            By grade:
          </span>
          {byGrade.map(([grade, count]) => (
            <span key={grade} className="fa-pill bg-gold-100 text-gold-700">
              G{grade} × {count}
            </span>
          ))}
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wider font-semibold text-ink-400">
          Students ({attendees.length})
        </div>
        <div
          className={`fa-mono text-[10px] uppercase ${allPacked ? "text-success font-semibold" : "text-ink-400"}`}
          style={{ letterSpacing: "0.1em" }}
        >
          {allPacked ? "✓ All packed" : `${packedCount} / ${attendees.length} packed`}
        </div>
      </div>

      {/* Student list */}
      <div className="space-y-1 max-h-[55vh] overflow-y-auto">
        {attendees.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No expected attendees for this session yet.
          </div>
        ) : (
          attendees.map(({ inv, student }) => {
            const packed = isPacked(inv.id);
            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => onToggle(inv.id)}
                aria-pressed={packed}
                className="w-full flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white hover:border-gold-400 hover:bg-ivory-100/60 text-left transition-colors"
              >
                <span
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    packed ? "border-success bg-success" : "border-ink-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {packed && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${packed ? "line-through text-ink-400" : "text-ink-900"}`}>
                    {student.name}
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5 flex items-center gap-1.5">
                    <span className="font-mono">G{student.grade}</span>
                    <span>·</span>
                    <span className="font-mono text-xs font-semibold bg-ivory-200 px-1.5 py-0.5 rounded">
                      {inv.branch}
                    </span>
                  </div>
                </div>
                <span className="fa-pill flex-shrink-0 bg-gold-100 text-gold-700">
                  Grade {student.grade}
                </span>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
