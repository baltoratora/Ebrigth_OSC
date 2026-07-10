-- Additive migration: create the academy_chapter_content table only.
-- Safe to re-run (IF NOT EXISTS).
-- One row per (level, grade, chapter) URL — backs the chapter rich-text editor.

CREATE TABLE IF NOT EXISTS "academy_chapter_content" (
  "id"        TEXT PRIMARY KEY,
  "level"     TEXT NOT NULL,
  "grade"     INTEGER NOT NULL,
  "chapter"   INTEGER NOT NULL,
  "content"   JSONB NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "academy_chapter_content_level_grade_chapter_key"
  ON "academy_chapter_content" ("level", "grade", "chapter");
