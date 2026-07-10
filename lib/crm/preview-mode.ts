/**
 * Single source of truth for whether the CRM "preview" bypass is active.
 *
 * Preview mode synthesises a fake admin session so the CRM is browsable
 * without logging in. That's useful for local demos and screenshots, but
 * catastrophic in production — anyone hitting the URL would land on the
 * admin dashboard with full tenant scope.
 *
 * Two layers of defence stop that:
 *
 *   1. lib/env.ts (boot-time) — refuses to start the process if both
 *      NODE_ENV=production and CRM_PREVIEW_MODE=true.
 *   2. This helper (runtime)  — even if the validator is bypassed (e.g.
 *      env injected after start, custom build that drops the import),
 *      every preview-mode check at request time also re-verifies that
 *      we're not in production before granting the bypass.
 *
 * Always call `isPreviewMode()` rather than reading process.env directly,
 * so the production guard is impossible to forget.
 */
export function isPreviewMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.CRM_PREVIEW_MODE === 'true'
}
