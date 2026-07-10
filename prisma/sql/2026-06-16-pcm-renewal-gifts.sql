-- PCM renewal-gift inventory.
--
-- Tracks which renewal students qualify for a renewal gift and the hand-over
-- state. A student qualifies when: invite_type='renewal' AND paid=true AND the
-- payment happened within 3 days after their session day (Fri session ⇒ paid by
-- Mon). That needs to know WHEN payment happened, so we add paid_at.
--
-- Applied directly to ebrightleads_db (FA_DATABASE_URL). Additive + idempotent.

-- 1. When a renewal is marked paid we now stamp paid_at (set in
--    updateInvitationRow). Backfill existing paid rows with a best-effort time.
ALTER TABLE pcm_invitations ADD COLUMN IF NOT EXISTS paid_at timestamptz;
UPDATE pcm_invitations SET paid_at = COALESCE(attendance_marked_at, updated_at, now())
 WHERE paid = true AND paid_at IS NULL;

-- 2. Gift hand-over tracking, one row per qualifying invitation.
--    academy_distributed = academy handed the gift to the branch (academy edits).
--    gift_given          = branch gave the gift to the student (branch edits),
--                          with proof_link (a Google Drive photo URL) as evidence
--                          the academy can view.
CREATE TABLE IF NOT EXISTS pcm_renewal_gifts (
  invitation_id          text PRIMARY KEY REFERENCES pcm_invitations(id) ON DELETE CASCADE,
  tenant_id              text NOT NULL DEFAULT 'ebright',
  academy_distributed    boolean NOT NULL DEFAULT false,
  academy_distributed_at timestamptz,
  academy_distributed_by text,
  gift_given             boolean NOT NULL DEFAULT false,
  gift_given_at          timestamptz,
  gift_given_by          text,
  proof_link             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
