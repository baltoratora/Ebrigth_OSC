-- PCM Assessment Reports — add coach signature image.
--
-- Stored as a base64 data-URL in TEXT (typical hand-written signature is
-- ~5–30 KB once exported as PNG, so this stays well under the row-size
-- ceiling and avoids an S3 round-trip for a feature that's only consumed
-- by the certificate render). NULL when no signature uploaded yet.

ALTER TABLE pcm_assessment_reports
  ADD COLUMN IF NOT EXISTS prepared_by_signature text;
