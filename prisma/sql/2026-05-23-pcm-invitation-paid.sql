-- PCM: track whether a student paid for the slot.
--
-- The academy wants visibility into three buckets during attendance:
--   • attended + paid       → success case, counts toward revenue
--   • attended + not paid   → showed up but hasn't settled the fee
--   • not attended          → no-show / declined / rescheduled
--
-- Stored on the invitation row (one bit per slot) so a single PATCH from
-- the BM can flip it independently of status. Default false so older
-- invitations remain "unpaid" by default — the academy can flip the ones
-- that did pay.

ALTER TABLE pcm_invitations
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pcm_invitations_event_paid_idx
  ON pcm_invitations (event_id, paid);
