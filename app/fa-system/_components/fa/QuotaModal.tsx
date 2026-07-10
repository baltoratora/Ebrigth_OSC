"use client";

import { useState, useMemo } from "react";
import { Modal } from "@fa/_components/shared/Modal";
import { useFAStore } from "@fa/_lib/store";
import { BRANCHES, BranchCode, Session } from "@fa/_types";

export function QuotaModal({
  open, onClose, session,
}: { open: boolean; onClose: () => void; session: Session }) {
  const allQuotas = useFAStore(s => s.quotas);
  const quotas    = useMemo(() => allQuotas.filter(q => q.sessionId === session.id), [allQuotas, session.id]);
  const setQuota  = useFAStore(s => s.setQuota);

  const quotaMap = useMemo(() => {
    const m: Record<string, number> = {};
    quotas.forEach(q => { m[q.branch] = q.quota; });
    return m;
  }, [quotas]);

  const [draft, setDraft] = useState<Record<string, number>>(quotaMap);

  const total          = Object.values(draft).reduce((sum, v) => sum + (v || 0), 0);
  const activeBranches = Object.entries(draft).filter(([, v]) => v > 0).length;

  function updateBranch(branch: BranchCode, v: number) {
    setDraft(d => ({ ...d, [branch]: Math.max(0, v) }));
  }

  function handleSave() {
    for (const b of BRANCHES) {
      const code   = b.code as BranchCode;
      const newVal = draft[code] ?? 0;
      const oldVal = quotaMap[code] ?? 0;
      if (newVal !== oldVal) setQuota(session.id, code, newVal);
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Branch Quotas"
      title={`Day ${session.dayNumber} · Session ${session.sessionNumber}`}
      description={`${session.startTime}–${session.endTime}${session.label ? ` · ${session.label}` : ""}`}
      size="xl"
    >
      {/* Summary strip */}
      <div className="flex items-center justify-between bg-ivory-100 rounded-[10px] px-4 py-3 mb-4 border border-gold-200">
        <div className="text-sm text-ink-700">
          <span className="fa-mono font-semibold text-xl text-ink-900 mr-2">{total}</span>
          total slot{total !== 1 ? "s" : ""} across
          <span className="fa-mono font-semibold text-ink-900 mx-1">{activeBranches}</span>
          branch{activeBranches !== 1 ? "es" : ""}
        </div>
        <div className="fa-mono text-[10px] text-ink-400" style={{ letterSpacing: "0.08em" }}>
          Set quota to 0 to remove
        </div>
      </div>

      {/* Branch grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto p-1">
        {BRANCHES.map(b => {
          const v      = draft[b.code] ?? 0;
          const active = v > 0;
          return (
            <div
              key={b.code}
              className={`rounded-[10px] border p-3 transition-colors ${
                active ? "border-gold-400 bg-ivory-100" : "border-gold-200 bg-ivory-50"
              }`}
            >
              <div className="mb-2">
                <div className="fa-mono text-xs font-semibold text-ink-800">{b.code}</div>
                <div className="fa-mono text-[11px] text-ink-500 truncate">{b.name}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateBranch(b.code as BranchCode, v - 1)}
                  disabled={v === 0}
                  className="w-7 h-7 rounded-[6px] bg-ivory-50 border border-ink-200 hover:bg-ivory-100 text-ink-700 disabled:opacity-30 flex-shrink-0 flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={v}
                  onChange={e => updateBranch(b.code as BranchCode, Number(e.target.value))}
                  className="fa-mono flex-1 min-w-0 text-center px-1 py-1 rounded-[6px] border border-ink-200 text-sm bg-ivory-50 focus:outline-none focus:border-gold-400"
                />
                <button
                  type="button"
                  onClick={() => updateBranch(b.code as BranchCode, v + 1)}
                  className="w-7 h-7 rounded-[6px] bg-ivory-50 border border-ink-200 hover:bg-ivory-100 text-ink-700 flex-shrink-0 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gold-200">
        <button onClick={onClose} className="fa-btn-secondary">Cancel</button>
        <button onClick={handleSave} className="fa-btn-primary">Save quotas</button>
      </div>
    </Modal>
  );
}
