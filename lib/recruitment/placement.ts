// Shared constants + helpers for the recruitment "placement" popup — the
// Branch / Department / Position picker shown when a candidate card is dragged
// into a placement stage (Trial, Probation, Intern, Full Time, Part Timer,
// Hired). Kept framework-agnostic so both the server action and the client
// modal import from one place.

/** The special branch value that unlocks the Department dropdown. */
export const HQ_BRANCH = "HQ";

// Branch codes shown in the placement popup (HR-provided list). HQ is prepended
// as a special option — picking it reveals the Department dropdown; picking any
// other branch skips straight to Position.
export const PLACEMENT_BRANCHES: string[] = [
  "AMP", "BBB", "BSP", "BTHO", "CJY", "DA", "DK", "DPU", "EGR", "KD", "KLG",
  "KTG", "KW", "ONL", "PJY", "RBY", "SA", "SHA", "SP", "ST", "TSB", "TSG", "PJL",
];

// HQ-only departments (shown only when Branch = HQ), in HR's order.
export const HQ_DEPARTMENTS: string[] = [
  "CEO", "Marketing", "Operation", "Optimisation", "Finance", "HR", "IOP", "Academy",
];

// Stage NAMES (normalised: any trailing "(CODE)" stripped, lowercased) that
// trigger the placement popup on entry. Matching by name — not shortCode —
// keeps this correct across board re-seeds, and stays aligned with the
// Trial/Probation HR card, which keys off board_stage text ('trial'/'probation').
const PLACEMENT_STAGE_NAMES = new Set<string>([
  "trial", "probation", "hired",
  "intern", "internship",
  "full time", "full timer",
  "part time", "part timer",
]);

/** Strip a trailing "(XX)" short-code suffix and lowercase, so "Hired (HRD)"
 *  and "Hired" both normalise to "hired". */
export function normalizeStageName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

/** True when dropping a card into this stage should prompt for
 *  branch / department / position. */
export function isPlacementStage(name: string): boolean {
  return PLACEMENT_STAGE_NAMES.has(normalizeStageName(name));
}

/** True when the chosen branch is HQ (department applies). */
export function isHqBranch(branch: string | null | undefined): boolean {
  return (branch ?? "").trim().toUpperCase() === HQ_BRANCH;
}
