-- CreateTable
-- Owned entirely by OSC in the local `crm` schema. Idempotent so re-running
-- on an environment that already has the table is a no-op. We intentionally
-- do NOT touch crm."User" — that's an FDW view of ebright_hrfs.public."User"
-- and ADD COLUMN can't run on a view.
CREATE TABLE IF NOT EXISTS "SessionRevocation" (
    "email"        TEXT      NOT NULL,
    "revokedAfter" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionRevocation_pkey" PRIMARY KEY ("email")
);
