// ============================================================================
// Z-index registry — single source of truth for layering across the app.
//
// Stacking order (low → high):
//   dropdown   1000   floating menus, autocompletes
//   sticky     1100   sticky headers / filter bars
//   popover    8000   hover previews, persistent overlays
//   modal      9000   focused-task surfaces (beat popovers)
//   toast      9500   transient feedback (beat modals)
//   tooltip    9800   short-lived label-overs (beat everything)
//
// Each layer leaves 100-unit gaps for in-layer adjustments (e.g. stacked
// modals add `index * 10` and still stay below toasts).
// ============================================================================

export const Z = {
  dropdown: 1000,
  sticky:   1100,
  popover:  8000,
  modal:    9000,
  toast:    9500,
  tooltip:  9800,
} as const;

export type ZLayer = keyof typeof Z;

// ----------------------------------------------------------------------------
// Modal stack tracking — assigns each open modal a depth so nested modals
// layer correctly without per-instance configuration.
// ----------------------------------------------------------------------------

let modalStack = 0;
const listeners = new Set<() => void>();

export function pushModal(): number {
  const depth = modalStack;
  modalStack += 1;
  listeners.forEach(l => l());
  return depth;
}

export function popModal() {
  modalStack = Math.max(0, modalStack - 1);
  listeners.forEach(l => l());
}

export function subscribeModalStack(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Compute the effective z-index for a modal at a given depth. */
export function modalZ(depth: number): number {
  return Z.modal + depth * 10;
}
