// Helpers for working with the per-session display order stored in
// FAStore.sessionOrder. The store's order is the source of truth; these
// helpers tolerate stale entries and append new invitations at the tail.

import { Invitation } from "@fa/_types";

/**
 * Compute the display order for a session.
 *
 * Returns invitation IDs in the order they should appear:
 *   1. IDs from the persisted `sessionOrder` that still exist in the
 *      session's invitations (stale IDs are dropped).
 *   2. Then any invitations not yet in the persisted order, appended in the
 *      same relative order they appear in `invitations`.
 */
export function getDisplayOrder(
  sessionId: string,
  invitations: Invitation[],
  sessionOrder: Record<string, string[]>
): string[] {
  const sessionInvs = invitations.filter(i => i.sessionId === sessionId);
  const sessionInvIds = new Set(sessionInvs.map(i => i.id));
  const stored = sessionOrder[sessionId] ?? [];
  const validStored = stored.filter(id => sessionInvIds.has(id));
  const validStoredSet = new Set(validStored);
  const newcomers = sessionInvs
    .filter(i => !validStoredSet.has(i.id))
    .map(i => i.id);
  return [...validStored, ...newcomers];
}

/**
 * Merge a reorder of a filtered subset back into the full session order,
 * preserving the global positions of items that are not in the visible
 * subset.
 *
 * Walks the full order; each time it encounters an ID that was visible,
 * replaces it with the next ID from `newVisibleOrder` in sequence.
 */
export function mergeFilteredReorder(
  fullOrder: string[],
  visibleIds: string[],
  newVisibleOrder: string[]
): string[] {
  const visibleSet = new Set(visibleIds);
  let cursor = 0;
  return fullOrder.map(id => {
    if (visibleSet.has(id)) {
      const replacement = newVisibleOrder[cursor];
      cursor += 1;
      return replacement ?? id;
    }
    return id;
  });
}
