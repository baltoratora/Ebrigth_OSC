"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface AdvancedFilters {
  startFrom: string;       // YYYY-MM-DD — start date on/after
  startTo: string;         // YYYY-MM-DD — start date on/before
  endFrom: string;         // YYYY-MM-DD — end date on/after
  endTo: string;           // YYYY-MM-DD — end date on/before
  rateMode: "any" | "set" | "none";
  rateMin: string;
  rateMax: string;
  missingNric: boolean;
  missingDob: boolean;
  missingEmail: boolean;
  missingEmployeeId: boolean;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  startFrom: "",
  startTo: "",
  endFrom: "",
  endTo: "",
  rateMode: "any",
  rateMin: "",
  rateMax: "",
  missingNric: false,
  missingDob: false,
  missingEmail: false,
  missingEmployeeId: false,
};

/** Number of advanced filters currently active — drives the badge on the button. */
export function countActiveAdvancedFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.startFrom || f.startTo) n++;
  if (f.endFrom || f.endTo) n++;
  if (f.rateMode !== "any" || f.rateMin || f.rateMax) n++;
  if (f.missingNric) n++;
  if (f.missingDob) n++;
  if (f.missingEmail) n++;
  if (f.missingEmployeeId) n++;
  return n;
}

interface Props {
  open: boolean;
  initial: AdvancedFilters;
  /** Hide rate controls for callers without rate access (e.g. Academy view). */
  showRate?: boolean;
  onApply: (filters: AdvancedFilters) => void;
  onClose: () => void;
}

export default function EmployeeAdvancedFilterModal({
  open,
  initial,
  showRate = true,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<AdvancedFilters>(initial);

  // Re-seed the draft from the committed filters each time the modal opens.
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  if (!open) return null;

  const set = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";
  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-gray-800">Advanced Filters</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Start Date range */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Start Date</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>From</label>
                <input type="date" className={inputCls} value={draft.startFrom}
                  onChange={(e) => set("startFrom", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>To</label>
                <input type="date" className={inputCls} value={draft.startTo}
                  onChange={(e) => set("startTo", e.target.value)} />
              </div>
            </div>
          </div>

          {/* End Date range */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">End Date</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>From</label>
                <input type="date" className={inputCls} value={draft.endFrom}
                  onChange={(e) => set("endFrom", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>To</label>
                <input type="date" className={inputCls} value={draft.endTo}
                  onChange={(e) => set("endTo", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Rate */}
          {showRate && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-1">Rate</p>
              <p className="text-xs text-gray-400 mb-2">Only PT Coaches have a rate — any rate filter shows PT Coaches only.</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {([
                  { value: "any", label: "Any" },
                  { value: "set", label: "Has rate" },
                  { value: "none", label: "No rate (not set)" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => set("rateMode", opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      draft.rateMode === opt.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Min (RM)</label>
                  <input type="number" min="0" step="0.5" className={inputCls}
                    placeholder="e.g. 10" value={draft.rateMin}
                    disabled={draft.rateMode === "none"}
                    onChange={(e) => set("rateMin", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Max (RM)</label>
                  <input type="number" min="0" step="0.5" className={inputCls}
                    placeholder="e.g. 20" value={draft.rateMax}
                    disabled={draft.rateMode === "none"}
                    onChange={(e) => set("rateMax", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Missing info — for finding incomplete records */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-1">Missing Info</p>
            <p className="text-xs text-gray-400 mb-2">Show only employees missing the selected field(s).</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "missingEmployeeId", label: "No Employee ID" },
                { key: "missingNric", label: "No NRIC" },
                { key: "missingDob", label: "No DOB" },
                { key: "missingEmail", label: "No Email" },
              ] as const).map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={draft[opt.key]}
                    onChange={(e) => set(opt.key, e.target.checked)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button
            onClick={() => setDraft(EMPTY_ADVANCED_FILTERS)}
            className="text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            Clear all
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onApply(draft)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
