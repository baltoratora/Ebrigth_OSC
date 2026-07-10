# prisma/sql — non-Prisma SQL artifacts

This directory holds SQL files that set up database state Prisma can't (or
shouldn't) manage: `postgres_fdw` foreign servers, foreign tables, custom
views, role-level settings.

## Files

| File | Purpose |
|---|---|
| `2026-05-13-hr-fdw-views.sql` | Foreign tables in `hrfs_remote.*` and matching views in `crm.*` for 7 HR tables. Restores HR pages on the portal. Idempotent. |
| `2026-05-16-branchstaff-working-hours.sql` | Refreshes `hrfs_remote."BranchStaff"` + `crm."BranchStaff"` so the new `workingHours` jsonb column (added to `ebright_hrfs.public."BranchStaff"`) is visible to Prisma. Required for Staff Directory. Idempotent. |

## How to apply

`psql` is not installed inside the `osc` container (it runs as the
non-root `nodejs` user, no install permission). Apply via Node + `pg`:

```bash
# On the prod/staging server, in /home/<user>/ebright-osc:
docker compose cp prisma/sql/<filename>.sql osc:/tmp/fdw.sql
docker compose exec -T osc node <<'NODESCRIPT'
const fs = require("fs");
const {Client} = require("pg");
const sql = fs.readFileSync("/tmp/fdw.sql", "utf8");
const c = new Client({connectionString: process.env.DATABASE_URL});
(async () => {
  c.on("notice", n => console.log("NOTICE:", n.message));
  await c.connect();
  try { await c.query(sql); console.log("OK"); }
  catch (e) { console.error("ERROR:", e.message); process.exit(1); }
  finally { await c.end(); }
})();
NODESCRIPT
docker compose restart osc worker
```

Files are idempotent — running the same file twice does not error and does
not double-create.

## Architecture — why this exists

The OSC portal connects to `ebright_crm` as its primary database with
`?schema=crm`. That schema holds two kinds of objects:

1. **Real CRM tables** (`crm_contact`, `crm_user_branch`, `crm_pipeline`, ...)
   that store CRM data natively in `ebright_crm`.
2. **Views in `crm.*`** that wrap foreign tables in `<source>_remote.*`
   schemas. Those foreign tables proxy to other databases via
   `postgres_fdw`:
   - `hrfs_remote.*` → `ebright_hrfs.public.*` (HR data)
   - `leads_remote.*` → `ebrightleads_db.public.*` (PowerBI/GHL leads)

Naming convention: foreign tables in `<source>_remote` preserve the source
table's case-sensitive name; views in `crm` are named exactly as Prisma
expects (so `prisma.branchStaff.findMany()` resolves to
`crm."BranchStaff"` → `hrfs_remote."BranchStaff"` → `ebright_hrfs.public."BranchStaff"`).

## What NOT to do

### Never run `prisma db push` against `ebright_crm`

`prisma db push` compares `schema.prisma` to the live DB and runs `ALTER`
statements to reconcile. It does not understand foreign tables or views —
it will try to drop them and re-create them as regular empty tables to
match the schema, breaking the FDW links and silently emptying every HR
page on the portal.

**This is exactly what caused the May 2026 outage that motivated this
directory.** The `.env` was changed during a server recovery, someone ran
`prisma db push` (or a deploy did), and seven HR tables got created as
empty `BASE TABLE` rows in `crm.*` instead of pointing at `ebright_hrfs`.

If you need to apply a Prisma schema change to HR models, apply it
against `ebright_hrfs` only:

```bash
DATABASE_URL="postgresql://...@103.209.156.174:5433/ebright_hrfs?schema=public" \
  npx prisma db push
```

For CRM-only model changes, you may run `prisma db push` against
`ebright_crm`, but **review the migration plan first** with
`npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
   --to-schema-datamodel prisma/schema.prisma --script` and check that
no `crm."BranchStaff"`-style tables are about to be re-created.

A safer alternative: `npm run db:push:safe` (added in
[package.json](../../package.json)) which refuses to run against
`ebright_crm`.

### Don't `DROP SCHEMA crm CASCADE`

Even if you're "cleaning up." The `crm` schema holds real CRM data plus
the views that surface HR data. Dropping it loses both.

## Replay sequence on a fresh primary DB

If you ever set up a brand-new `ebright_crm`-like primary DB:

1. Apply `prisma/schema.prisma` with `prisma db push` against the new DB.
   This creates real `crm_*` tables — and, by side-effect, stub HR tables
   like `crm."BranchStaff"` that should not exist.
2. Apply every `prisma/sql/*.sql` file in date order. Each file's
   `DROP TABLE IF EXISTS` clause removes those stubs and replaces them
   with foreign tables + views pointing at the real source DBs.
3. Restart the app container so Prisma + role search_path settings take
   effect.

## Discovery commands

To understand the current FDW state of a DB:

```bash
docker compose exec -T osc node <<'NODESCRIPT'
const {PrismaClient} = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const q = (label, sql) =>
    p.$queryRawUnsafe(sql).then(r => {
      console.log("\n=== " + label + " ===");
      console.log(JSON.stringify(r, (k,v) => typeof v === "bigint" ? v.toString() : v, 2));
    }).catch(e => console.log("\n=== " + label + " ===\nERROR:", e.message));
  await q("foreign servers",
    "SELECT srvname, srvoptions FROM pg_foreign_server");
  await q("foreign tables",
    "SELECT foreign_table_schema, foreign_table_name, foreign_server_name " +
    "FROM information_schema.foreign_tables ORDER BY foreign_table_schema, foreign_table_name");
  await q("views in crm",
    "SELECT table_name FROM information_schema.views WHERE table_schema = 'crm' ORDER BY table_name");
  await p.$disconnect();
})();
NODESCRIPT
```
