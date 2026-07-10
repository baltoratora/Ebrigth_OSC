-- Auto-correct wrong Hikvision scanner person_ids → true employee IDs.
--
-- Some staff were enrolled on the scanner under a stray/short ID that doesn't
-- match BranchStaff.employeeId, so the attendance dashboard showed them as
-- duplicate, dept-less rows. This adds:
--   1. a mapping table (wrong_id → true_id + true_name),
--   2. a BEFORE INSERT trigger so every future scan with a wrong ID is
--      rewritten to the true ID automatically (add a row to the map for any
--      new wrong ID — no code change needed),
--   3. a one-time backfill of existing rows.
--
-- Naqib is NOT here: his scan ID 66020096 is correct; BranchStaff was fixed.
-- Run against the prod DB (ebright_hrfs @ 103.209.156.174).

CREATE TABLE IF NOT EXISTS public.hikvision_id_map (
  wrong_id  text PRIMARY KEY,
  true_id   text NOT NULL,
  true_name text
);

INSERT INTO public.hikvision_id_map (wrong_id, true_id, true_name) VALUES
  ('53',       '44080099', 'KER KAI LOON'),
  ('54',       '44080100', 'TEH YEE QIAN'),
  ('55',       '44080101', 'LOUY RUI EN'),
  ('56',       '44080102', 'KOR YI LING'),
  ('44020039', '55020039', 'UMMU SYAFIQAH BINTI MAZLAN'),
  ('55020072', '66020085', 'LEE-ANN DANIELLA LIM')
ON CONFLICT (wrong_id) DO UPDATE
  SET true_id = EXCLUDED.true_id, true_name = EXCLUDED.true_name;

CREATE OR REPLACE FUNCTION public.hikvision_remap_person_id() RETURNS trigger AS $$
DECLARE m public.hikvision_id_map%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.hikvision_id_map WHERE wrong_id = NEW.person_id;
  IF FOUND THEN
    NEW.person_id := m.true_id;
    IF m.true_name IS NOT NULL THEN NEW.name := m.true_name; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hikvision_remap ON public.hikvision_attendance_all;
CREATE TRIGGER trg_hikvision_remap
  BEFORE INSERT ON public.hikvision_attendance_all
  FOR EACH ROW EXECUTE FUNCTION public.hikvision_remap_person_id();

-- One-time backfill of existing rows.
UPDATE public.hikvision_attendance_all a
SET person_id = m.true_id,
    name = COALESCE(m.true_name, a.name)
FROM public.hikvision_id_map m
WHERE a.person_id = m.wrong_id;
