-- FA "Historical FA (pre-portal records)" back-fill + going-forward sync.
--
-- Problem: studentrecords.fa_progress_json (Heidi) records FA grade
-- completions that never went through a portal FA event, so those students
-- could not be found when searching portal events. The sync between the two
-- systems is one-way (portal "attended" -> Heidi); Heidi completions never
-- created portal records.
--
-- Option A (already run as a one-off node script on 2026-06-11):
--   * created event 93f20760-9484-413c-9c4e-8e442d2aaf51
--     ("Historical FA (pre-portal records)", status=completed, Jan 2025)
--   * one session + per-branch quota rows
--   * 703 fa_invitations rows status='attended', invited_by='backfill', one
--     per (student, completed grade) lacking any portal invitation.
--
-- Option B (this trigger): keeps that event in sync going forward. Whenever a
-- student's fa_progress_json is inserted/updated in Heidi, any newly-completed
-- grade with no portal record gets an 'attended' row in the historical event.
--   * INSERT-ONLY  -> can never delete data, safe even on a Heidi bulk reload.
--   * Idempotent   -> ON CONFLICT DO NOTHING against the (event,student,grade) unique.
--   * Self-disabling -> if the historical event/session is removed, it no-ops
--     (so deleting the event to "undo" everything will not break Heidi writes).
--
-- Reversal: DROP TRIGGER trg_fa_backfill_completions ON studentrecords;
--           DROP FUNCTION fa_backfill_completions_to_event();
--           DELETE FROM fa_invitations WHERE event_id='93f20760-9484-413c-9c4e-8e442d2aaf51';
--           (then delete its fa_session_quotas, fa_sessions, fa_events rows)
-- Run against the leads DB (ebrightleads_db).

CREATE OR REPLACE FUNCTION fa_backfill_completions_to_event() RETURNS trigger AS $fn$
DECLARE ev   text := '93f20760-9484-413c-9c4e-8e442d2aaf51';
        sess text;
BEGIN
  IF NEW.fa_progress_json IS NULL OR jsonb_typeof(NEW.fa_progress_json::jsonb) <> 'array' THEN RETURN NEW; END IF;
  IF NEW.branch IS NULL OR NEW.branch = '' THEN RETURN NEW; END IF;
  SELECT id INTO sess FROM fa_sessions WHERE event_id = ev LIMIT 1;
  IF sess IS NULL THEN RETURN NEW; END IF;   -- event removed -> no-op
  INSERT INTO fa_invitations
    (tenant_id,event_id,session_id,student_id,branch,status,invited_by,invited_at,confirmed_at,attendance_marked_at,attendance_marked_by,target_grade,notes)
  SELECT 'ebright', ev, sess, NEW.id::text, NEW.branch, 'attended','backfill',now(),now(),now(),'backfill', g.grade,'Auto-synced from Heidi fa_progress_json'
    FROM (SELECT ord::int AS grade FROM jsonb_array_elements(NEW.fa_progress_json::jsonb) WITH ORDINALITY t(val,ord) WHERE t.val::text='true') g
   WHERE NOT EXISTS (SELECT 1 FROM fa_invitations i WHERE i.student_id = NEW.id::text AND i.target_grade = g.grade)
  ON CONFLICT (tenant_id, event_id, student_id, target_grade) DO NOTHING;
  RETURN NEW;
END; $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fa_backfill_completions ON studentrecords;
CREATE TRIGGER trg_fa_backfill_completions
  AFTER INSERT OR UPDATE OF fa_progress_json ON studentrecords
  FOR EACH ROW EXECUTE FUNCTION fa_backfill_completions_to_event();
