-- 2026-07-02 — Confirm-proof + practice-scheduling fields on FA invitations
-- (ebrightleads_db)
--
-- WHY: when a Branch Manager confirms a student's invitation, they can attach
-- (1) a link to the student's testing video and (2) an uploaded image proving
-- the student completed the testing BEFORE joining the event, plus (3/4) an
-- optional practice-session date/time. All four are surfaced to Marketing
-- (MarketingSessionInvitesModal, the Invitation list, and the Practice
-- sidebar).
--
-- NOTE: this file is now DOCUMENTATION, not a required manual step. As of the
-- Practice-sidebar feature, app/fa-system/_lib/events.server.ts self-provisions
-- these columns at runtime via ensureConfirmProofColumns() (ADD COLUMN IF NOT
-- EXISTS, run once per server process before any write) — the same
-- self-healing pattern already used elsewhere in this app (e.g.
-- flagged_action_log, career_applications). Running this file by hand is
-- harmless (idempotent) but no longer necessary.
--
-- SCHEMA NOTE: in this DB fa_invitations lives in the `public` schema
-- (search_path = public, crm). Qualify explicitly so a node+pg script (whose
-- default search_path may differ) alters the right table.

ALTER TABLE public.fa_invitations
  ADD COLUMN IF NOT EXISTS video_link    text;

ALTER TABLE public.fa_invitations
  ADD COLUMN IF NOT EXISTS proof_url     text;

ALTER TABLE public.fa_invitations
  ADD COLUMN IF NOT EXISTS practice_date date;

ALTER TABLE public.fa_invitations
  ADD COLUMN IF NOT EXISTS practice_time text;
