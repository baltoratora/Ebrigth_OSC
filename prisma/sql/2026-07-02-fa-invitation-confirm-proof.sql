-- 2026-07-02 — Confirm-with-proof fields on FA invitations (ebrightleads_db)
--
-- WHY: when a Branch Manager confirms a student's invitation, they must now
-- supply (1) a link to the student's testing video and (2) an uploaded image
-- proving the student completed the testing BEFORE joining the event. Both are
-- surfaced to Marketing (MarketingSessionInvitesModal). These two columns store
-- the video URL and the Google Drive shareable link of the uploaded proof image.
--
-- SCHEMA NOTE: in this DB fa_invitations lives in the `public` schema
-- (search_path = public, crm). Qualify explicitly so a node+pg script (whose
-- default search_path may differ) alters the right table.
--
-- Apply manually via node+pg against FA_DATABASE_URL. Additive nullable columns,
-- no backfill — existing invitations keep NULL and read as "no proof yet". The
-- app read (events.server.ts) already falls back gracefully if this hasn't been
-- applied, so it is safe to run before OR after deploying the code. The confirm
-- WRITE path requires these columns, so run this before BMs use the new flow.

ALTER TABLE public.fa_invitations
  ADD COLUMN IF NOT EXISTS video_link text;

ALTER TABLE public.fa_invitations
  ADD COLUMN IF NOT EXISTS proof_url text;
