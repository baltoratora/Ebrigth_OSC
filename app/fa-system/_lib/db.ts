import { Pool } from "pg";

declare global {
  // Reuse the pool across hot reloads in dev so we don't exhaust connections.
  // Namespaced separately from any other pg pools the host app might keep.
  var __faPgPool: Pool | undefined;
}

// FA System reads from a different DB than the rest of OSC (studentrecords
// + fa_* tables live in `ebrightleads_db`; OSC main uses `ebright_hrfs`).
// We try three env vars in order so deploys that already have any one of
// them set Just Work:
//
//   FA_DATABASE_URL   — preferred, FA-specific name
//   LEADS_DB_URL      — same database, used by the CRM lead-ingest worker.
//                       Already set on staging/prod for CRM; FA can reuse it
//                       so we don't have to maintain two identical env vars.
//   DATABASE_URL      — last-resort fallback. Only correct if the OSC main
//                       DB also happens to contain the FA tables (rarely
//                       true) — kept for dev convenience.
//
// If none are set the boot fails loudly instead of silently connecting to
// the wrong database.
function makePool(): Pool {
  const url =
    process.env.FA_DATABASE_URL ||
    process.env.LEADS_DB_URL ||
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "FA database connection string is not set. Define one of " +
      "FA_DATABASE_URL, LEADS_DB_URL, or DATABASE_URL in the environment."
    );
  }
  return new Pool({ connectionString: url, max: 5 });
}

export const pool: Pool = globalThis.__faPgPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__faPgPool = pool;
