-- 2026-06-18 — Snapshot student name onto PCM invitations (ebrightleads_db)
--
-- WHY: invitations reference studentrecords by id. When a student is deleted
-- from studentrecords, the invitation is orphaned and the dashboard could only
-- show "#<id>" (no name). This stores the student's name on the invitation at
-- invite time so the name survives a later deletion. Reads also fall back to
-- archived_students.no to recover already-orphaned names where possible.
--
-- SCHEMA NOTE: in this DB pcm_invitations lives in the `crm` schema, while
-- studentrecords / archived_students are in `public` (search_path = crm,public).
-- Qualify explicitly so a node+pg script (whose default search_path may differ)
-- alters the right table.
--
-- Applied manually via node+pg against FA_DATABASE_URL. Additive column +
-- one-time backfill — no behaviour change until app code is deployed.

ALTER TABLE crm.pcm_invitations
  ADD COLUMN IF NOT EXISTS student_name_snapshot text;

-- Backfill the snapshot for invitations whose student still exists, so a future
-- deletion of any currently-live student won't lose the name either.
UPDATE crm.pcm_invitations i
   SET student_name_snapshot = sr.name
  FROM public.studentrecords sr
 WHERE sr.id::text = i.student_id
   AND i.student_name_snapshot IS NULL
   AND sr.name IS NOT NULL;

-- Read-side name resolution (events.server.ts fetch):
--   COALESCE(studentrecords.name, pcm_invitations.student_name_snapshot,
--            archived_students.name)
-- via LEFT JOIN archived_students a ON a.no::text = i.student_id.
-- Invite-time: INSERT now sets student_name_snapshot from studentrecords.
