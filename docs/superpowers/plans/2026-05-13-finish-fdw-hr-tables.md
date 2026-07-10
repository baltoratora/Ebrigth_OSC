# Finish FDW Setup for HR Tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the four broken HR pages on `portal.ebright.my` (HR Employee Management, Manpower Dashboard, Manpower Cost Report, Attendance) by completing the existing FDW pattern in `ebright_crm` — foreign tables in `hrfs_remote.*`, views in `crm.*` — for the 7 HR tables that aren't yet wired up.

**Architecture (matches existing convention):** `ebright_crm` stays the primary database the app connects to. The team's existing pattern is:
- Foreign tables live in dedicated `<source>_remote` schemas (`hrfs_remote` for `ebright_hrfs`, `leads_remote` for `ebrightleads_db`).
- Views in `crm.*` wrap those foreign tables. Example already in place: `crm.hrfs_users` is `SELECT ... FROM hrfs_remote."User"`.

This plan extends that pattern by adding 7 foreign tables to `hrfs_remote` (`BranchStaff`, `ManpowerSchedule`, `AttendanceLog`, `AttendanceLogST`, `MedicalLeave`, `LeaveTransaction`, `Employee`) and 7 matching views in `crm` named exactly as Prisma's models expect them. Prisma queries against `prisma.branchStaff.findMany()` then resolve transparently through `crm."BranchStaff"` → `hrfs_remote."BranchStaff"` → `ebright_hrfs.public."BranchStaff"`. **Zero application code changes required.**

**Why `User` is excluded:** Discovery found 3 admin accounts (`od@ebright.my`, `admin@ebright.my`, `test@ebright.my`) in the stub `crm."User"` table that NextAuth actively authenticates against ([lib/nextauth.ts:22-28](../../../lib/nextauth.ts#L22-L28)). Two of them don't exist in `ebright_hrfs."User"` at all, and the third has a different password hash. Dropping the stub would lock them out. This plan leaves `crm."User"` alone — out of scope. Migrating those accounts into `ebright_hrfs."User"` and making `crm."User"` a view is a separate follow-up the team should discuss.

**`pg.Pool` caveat:** Two HR routes — [app/api/hr-dashboard/route.ts](../../../app/api/hr-dashboard/route.ts) and [app/api/sync-medical-leave/route.ts](../../../app/api/sync-medical-leave/route.ts) — use raw `pg.Pool` with the same `DATABASE_URL`, not Prisma. node-postgres ignores Prisma's `?schema=crm` parameter, so these connections use PG's default `search_path` (typically `"$user", public`) and would not find `crm.<table>`. The SQL artifact below also runs `ALTER ROLE optidept SET search_path = crm, public` so the `optidept` login defaults to looking in `crm` first across all connection types. Existing container connections must be restarted (Task 4) to pick up the new role default.

**Tech Stack:** PostgreSQL 14+ with `postgres_fdw`, Prisma 6, Next.js 15, docker compose.

**Constraints / Non-goals:**
- This plan does NOT touch the application code. No TypeScript edits, no Prisma schema changes. If a code change is needed, that's a different plan.
- This plan does NOT migrate data. All HR data stays in `ebright_hrfs` exactly where it is.
- This plan does NOT change how CRM operates. CRM tables stay in `ebright_crm.crm` as regular tables.
- This plan does NOT enable `prisma db push` against `ebright_crm` ever again. See Task 13 for the guardrail.

**Branch + deploy strategy:** All commits land on the `staging` branch. Once smoke-tested, merge `staging → main`. SQL is applied DB-side via Node + `pg`; the SQL file is committed for replay/audit.

**Staging/prod DB topology — confirmed by Task 1 discovery (2026-05-13):** Staging and production share **one Postgres cluster** at `103.209.156.174:5433` and **one database** (`ebright_crm`). Staging-portal.ebright.my (app container on `103.209.156.225`) and portal.ebright.my (app container on `103.209.156.174`) are two app containers pointed at the same DB. **There is no isolated staging rehearsal possible** — any DB change affects both portals simultaneously. Mitigations:
- SQL runs inside a single `BEGIN ... COMMIT` transaction — atomic, rolls back on any error.
- We only DROP empty stub tables (verified empty in Task 0) — no data loss.
- We only CREATE foreign tables (read-through to `ebright_hrfs`) and views — no writes to source data.
- We do NOT touch any CRM tables. CRM functionality is unaffected.
- Rollback recipe: `DROP VIEW crm.<each>; CREATE TABLE crm.<each>(id int);` per Task 7 Step 3.

---

## File Structure

Files created by this plan:

- `prisma/sql/2026-05-13-hr-fdw-views.sql` — the canonical FDW setup. Idempotent. Can be re-run safely on either DB.
- `prisma/sql/README.md` — explains what `prisma/sql/` is for and why `prisma db push` must NOT be run against the primary DB after this.

Files modified by this plan:

- `README.md` (root) — add a one-paragraph "Multi-DB architecture" section pointing at `prisma/sql/README.md`.

---

## Pre-Flight Checklist

Before starting Task 0, confirm:

- [ ] You are on local `staging` branch with working tree clean. Verify with `git status` and `git rev-parse --abbrev-ref HEAD`.
- [ ] You have SSH access to **both** servers: `staff1@103.209.156.174` (prod) and `deploy@103.209.156.225` (staging).
- [ ] You have the DB superuser password (the one in `DATABASE_URL`: `ebrightoptidept2025`) ready in a secure note.
- [ ] You can read [lib/crm/auth.ts:197-208](../../../lib/crm/auth.ts#L197-L208) and understand why `crm.hrfs_users` exists. That existing FDW view is the model for everything in this plan.

---

### Task 0: Discovery — inspect existing FDW config on production DB

**Files:** None (read-only DB queries).

This task confirms exactly what FDW infrastructure already exists on the prod `ebright_crm` DB so the plan's later tasks reference real names, not guesses.

- [ ] **Step 1: SSH into the prod server and open psql against `ebright_crm`**

Run on your laptop:

```bash
ssh staff1@103.209.156.174
```

Then on the prod server:

```bash
docker compose -f /home/staff1/ebright-osc/docker-compose.yml exec osc \
  sh -c 'apk add --no-cache postgresql-client >/dev/null 2>&1; psql "postgresql://optidept:ebrightoptidept2025@103.209.156.174:5433/ebright_crm"'
```

Expected: a `ebright_crm=>` psql prompt.

- [ ] **Step 2: List installed extensions**

In psql:

```sql
\dx
```

Expected: at minimum, `postgres_fdw` listed. If it's missing, that's a blocker — note it and stop. (It almost certainly is installed — the existing `crm.hrfs_users` view requires it.)

- [ ] **Step 3: List foreign servers**

```sql
SELECT srvname, srvowner::regrole, srvoptions
FROM pg_foreign_server;
```

Expected output (something like):

```
   srvname     | srvowner  |                  srvoptions
---------------+-----------+----------------------------------------------
 hrfs_srv   | optidept  | {host=103.209.156.174,port=5433,dbname=ebright_hrfs}
```

**Record the exact `srvname` value** — you'll use it as `<FOREIGN_SERVER_NAME>` in every later SQL block in this plan. If there's more than one row, pick the one whose `srvoptions` contains `dbname=ebright_hrfs`.

If there are zero rows pointing at `ebright_hrfs`, the SQL in Task 3 will need to create the server. Note that and continue.

- [ ] **Step 4: List user mappings on that server**

```sql
SELECT srvname, usename, umoptions
FROM pg_user_mappings
WHERE srvname IN (SELECT srvname FROM pg_foreign_server);
```

Expected: a mapping for `optidept` (with password in `umoptions` masked or visible). If missing, Task 3 SQL will create it.

- [ ] **Step 5: List existing foreign tables in the `crm` schema**

```sql
SELECT foreign_table_schema, foreign_table_name, foreign_server_name
FROM information_schema.foreign_tables
WHERE foreign_table_schema = 'crm'
ORDER BY foreign_table_name;
```

Expected: at minimum one row for `hrfs_users`. Record the full list — anything already present we leave alone in Task 3.

- [ ] **Step 6: List the stub HR tables that need replacing**

```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'crm'
  AND table_name IN (
    'BranchStaff', 'ManpowerSchedule', 'AttendanceLog', 'AttendanceLogST',
    'MedicalLeave', 'LeaveTransaction', 'User', 'Employee'
  )
ORDER BY table_name;
```

Expected: each row's `table_type` is `BASE TABLE` (these are the empty stubs `prisma db push` created). Record which exist — Task 3 only drops the ones that do.

- [ ] **Step 7: Confirm the stub tables are actually empty**

```sql
SELECT 'BranchStaff'        AS t, count(*) FROM crm."BranchStaff"        UNION ALL
SELECT 'ManpowerSchedule'   AS t, count(*) FROM crm."ManpowerSchedule"   UNION ALL
SELECT 'AttendanceLog'      AS t, count(*) FROM crm."AttendanceLog"      UNION ALL
SELECT 'AttendanceLogST'    AS t, count(*) FROM crm."AttendanceLogST"    UNION ALL
SELECT 'MedicalLeave'       AS t, count(*) FROM crm."MedicalLeave"       UNION ALL
SELECT 'LeaveTransaction'   AS t, count(*) FROM crm."LeaveTransaction"   UNION ALL
SELECT 'User'               AS t, count(*) FROM crm."User"               UNION ALL
SELECT 'Employee'           AS t, count(*) FROM crm."Employee";
```

Expected: every count is `0`. **If any count is > 0, STOP.** That means real data was written to the wrong DB and needs to be migrated before we drop these tables. Surface that to your team before continuing.

If a table from Step 6 doesn't exist at all, just omit that line — psql will tell you which (skip those, don't fail the plan).

- [ ] **Step 8: Verify the target tables in `ebright_hrfs` are reachable and have data**

Still in the prod-DB psql session connected to `ebright_crm`:

```sql
-- Live cross-DB count via the existing FDW server.
-- Replace <FOREIGN_SERVER_NAME> with the value from Step 3.
SELECT count(*) FROM crm.hrfs_users;
```

Expected: > 0 (the HR User table has rows; you saw 272 BranchStaff earlier, User count will be similar order of magnitude).

If this errors with "no such schema/table", the existing FDW view is broken too and Task 3 will recreate it. Note and continue.

- [ ] **Step 9: Exit psql and record findings**

```sql
\q
```

Write down in a scratch note:
- `<FOREIGN_SERVER_NAME>` = ?
- `<USER_MAPPING_USER>` = `optidept` (or whatever Step 4 showed)
- Which stub tables exist in `crm` (Step 6 list)
- Confirmation that all stubs are empty (Step 7)

These values get plugged into Task 3's SQL.

---

### Task 1: Confirm staging DB topology

**Files:** None (read-only checks on the staging server).

We need to know whether the staging app (`103.209.156.225`) connects to the same Postgres cluster as prod (`103.209.156.174:5433`) or to its own. That decides whether "test on staging first" is genuinely independent from prod.

- [ ] **Step 1: SSH into the staging server**

```bash
ssh deploy@103.209.156.225
```

- [ ] **Step 2: Locate the staging app dir from the deploy script**

```bash
cat /home/deploy/deploy.sh
```

Look for the `osc` branch's `cd ...` path. Record it as `<STAGING_APP_DIR>` (likely `/home/deploy/ebright-osc` or similar).

- [ ] **Step 3: Read the DATABASE_URL the staging container is actually using**

```bash
cd <STAGING_APP_DIR>
docker compose exec osc printenv DATABASE_URL
```

Record the host, port, and dbname. Three outcomes:

| If DATABASE_URL points at... | Then... |
|---|---|
| `103.209.156.174:5433/ebright_crm` | **Staging shares prod's DB.** Skip to Step 5. Tasks 3-5 are NOT safe to run "on staging only" — they touch the same data prod sees. Plan must batch staging + prod together. |
| `103.209.156.174:5433/ebright_crm_staging` (or similar separate DB on same host) | Staging has its own DB on the same Postgres. Tasks 3-5 are safe in isolation. |
| `103.209.156.225:5432/<something>` (DB on the staging host) | Fully independent. Tasks 3-5 are safe in isolation. |

- [ ] **Step 4: If the staging DB is separate, verify it has data**

If staging has its own DB, repeat Task 0 Steps 5-7 against that DB to find out its FDW state. Likely it's a clean snapshot from before the CRM migration, so the stub tables may not exist there at all — that's fine, Task 3 SQL is idempotent.

- [ ] **Step 5: Record findings**

Write down:
- `<STAGING_DB_HOST>:<PORT>/<DBNAME>`
- Whether staging is independent or shared with prod
- Stub-table status on staging DB (if independent)

These determine which DB Task 4 runs against first.

---

### Task 2: Create the canonical FDW SQL artifact

**Files:**
- Create: `prisma/sql/2026-05-13-hr-fdw-views.sql`
- Create: `prisma/sql/README.md`

This task only writes files. No DB changes yet. The SQL must be idempotent — running it twice does not double-create anything and does not error.

- [ ] **Step 1: Make the directory**

```bash
mkdir -p prisma/sql
```

- [ ] **Step 2: Write `prisma/sql/2026-05-13-hr-fdw-views.sql`**

Replace `<FOREIGN_SERVER_NAME>` with the value from Task 0 Step 3 (likely `hrfs_srv`). If Task 0 Step 3 showed zero servers, uncomment the `CREATE SERVER` and `CREATE USER MAPPING` blocks.

```sql
-- =============================================================================
-- HR Tables FDW — extends crm.hrfs_users pattern to the remaining 7 HR tables
-- =============================================================================
-- Purpose: expose 7 ebright_hrfs.public.* HR tables (BranchStaff,
-- ManpowerSchedule, AttendanceLog, AttendanceLogST, MedicalLeave,
-- LeaveTransaction, Employee) through ebright_crm by creating foreign tables
-- in hrfs_remote.* and matching views in crm.* — the same two-layer pattern
-- already used by crm.hrfs_users.
--
-- crm."User" is intentionally NOT touched. It currently holds 3 hand-rolled
-- admin accounts (admin@/od@/test@ebright.my) that NextAuth authenticates
-- against. Migrating those to ebright_hrfs."User" is a separate follow-up.
--
-- Idempotent: safe to re-run. Drops only the empty stub tables (verified
-- empty in Task 0 — DO NOT run if any count > 0).
--
-- Apply by piping into node + Prisma's $executeRawUnsafe (see Task 3) since
-- psql is not available inside the osc container.
--
-- WARNING: do NOT run `prisma db push` against ebright_crm after applying
-- this. See prisma/sql/README.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Prerequisites: extension already present, hrfs_srv already exists
--    (verified by Task 0). No CREATE SERVER / CREATE USER MAPPING needed.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgres_fdw;
CREATE SCHEMA IF NOT EXISTS hrfs_remote;

-- -----------------------------------------------------------------------------
-- 2. Drop the empty stub tables prisma db push created in crm.*
--    (7 tables — NOT crm."User", which holds active admin accounts)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS crm."BranchStaff"      CASCADE;
DROP TABLE IF EXISTS crm."ManpowerSchedule" CASCADE;
DROP TABLE IF EXISTS crm."AttendanceLog"    CASCADE;
DROP TABLE IF EXISTS crm."AttendanceLogST"  CASCADE;
DROP TABLE IF EXISTS crm."MedicalLeave"     CASCADE;
DROP TABLE IF EXISTS crm."LeaveTransaction" CASCADE;
DROP TABLE IF EXISTS crm."Employee"         CASCADE;

-- Views in crm.* with the same names (if a previous attempt got partway through)
DROP VIEW IF EXISTS crm."BranchStaff"      CASCADE;
DROP VIEW IF EXISTS crm."ManpowerSchedule" CASCADE;
DROP VIEW IF EXISTS crm."AttendanceLog"    CASCADE;
DROP VIEW IF EXISTS crm."AttendanceLogST"  CASCADE;
DROP VIEW IF EXISTS crm."MedicalLeave"     CASCADE;
DROP VIEW IF EXISTS crm."LeaveTransaction" CASCADE;
DROP VIEW IF EXISTS crm."Employee"         CASCADE;

-- Foreign tables in hrfs_remote.* (if a previous attempt got partway through)
DROP FOREIGN TABLE IF EXISTS hrfs_remote."BranchStaff"      CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."ManpowerSchedule" CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."AttendanceLog"    CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."AttendanceLogST"  CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."MedicalLeave"     CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."LeaveTransaction" CASCADE;
DROP FOREIGN TABLE IF EXISTS hrfs_remote."Employee"         CASCADE;

-- -----------------------------------------------------------------------------
-- 3. Import the 7 HR tables from ebright_hrfs.public into hrfs_remote.*
--    Foreign tables preserve case-sensitive names as they appear in the source.
-- -----------------------------------------------------------------------------

IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    "BranchStaff",
    "ManpowerSchedule",
    "AttendanceLog",
    "AttendanceLogST",
    "MedicalLeave",
    "LeaveTransaction",
    "Employee"
  )
  FROM SERVER hrfs_srv
  INTO hrfs_remote;

-- -----------------------------------------------------------------------------
-- 4. Create views in crm.* wrapping the foreign tables.
--    Names match Prisma model names exactly so prisma.branchStaff.findMany()
--    resolves to crm."BranchStaff" via the ?schema=crm search_path.
--    These are auto-updatable simple views — INSERT/UPDATE/DELETE pass
--    through to the underlying foreign table and on to ebright_hrfs.
-- -----------------------------------------------------------------------------

CREATE VIEW crm."BranchStaff"      AS SELECT * FROM hrfs_remote."BranchStaff";
CREATE VIEW crm."ManpowerSchedule" AS SELECT * FROM hrfs_remote."ManpowerSchedule";
CREATE VIEW crm."AttendanceLog"    AS SELECT * FROM hrfs_remote."AttendanceLog";
CREATE VIEW crm."AttendanceLogST"  AS SELECT * FROM hrfs_remote."AttendanceLogST";
CREATE VIEW crm."MedicalLeave"     AS SELECT * FROM hrfs_remote."MedicalLeave";
CREATE VIEW crm."LeaveTransaction" AS SELECT * FROM hrfs_remote."LeaveTransaction";
CREATE VIEW crm."Employee"         AS SELECT * FROM hrfs_remote."Employee";

-- -----------------------------------------------------------------------------
-- 5. Make non-Prisma connections find these views too.
--    Prisma sets `SET search_path = crm` per-connection from its `?schema=crm`
--    URL parameter. Raw pg.Pool connections (app/api/hr-dashboard/route.ts,
--    app/api/sync-medical-leave/route.ts) ignore that parameter and use PG's
--    default search_path. Setting it at the role level fixes both transparently.
-- -----------------------------------------------------------------------------

ALTER ROLE optidept SET search_path = crm, public;

-- -----------------------------------------------------------------------------
-- 6. Verify each view exists and is queryable. Counts come straight from
--    ebright_hrfs across FDW — they must MATCH what you'd see querying
--    ebright_hrfs directly (e.g. BranchStaff ~272).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_count bigint;
  v_msg   text;
BEGIN
  FOREACH v_msg IN ARRAY ARRAY[
    'BranchStaff', 'ManpowerSchedule', 'AttendanceLog', 'AttendanceLogST',
    'MedicalLeave', 'LeaveTransaction', 'Employee'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM crm.%I', v_msg) INTO v_count;
    RAISE NOTICE 'crm.% has % rows', v_msg, v_count;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- After COMMIT, existing container connections still hold the OLD role-level
-- search_path. Task 4 restarts the app container so new connections pick up
-- the role default. Until that restart, the hr-dashboard and sync-medical-leave
-- routes will keep failing.
-- =============================================================================

-- =============================================================================
-- Smoke-test queries (run interactively after COMMIT to spot-check)
-- =============================================================================
-- SELECT count(*) FROM crm."BranchStaff";           -- expect ~272
-- SELECT count(*) FROM crm."ManpowerSchedule"
--   WHERE status = 'Finalized';                     -- expect ~38
-- SELECT count(*) FROM crm."AttendanceLog"
--   WHERE date >= (current_date - INTERVAL '7 days')::text;
```

- [ ] **Step 3: Write `prisma/sql/README.md`**

```markdown
# prisma/sql — non-Prisma SQL artifacts

This directory holds SQL files that set up database state Prisma can't (or
shouldn't) manage: `postgres_fdw` foreign servers, foreign tables, custom
views.

## Naming

Files are dated: `YYYY-MM-DD-<short-purpose>.sql`. They are idempotent — safe
to re-run on either staging or prod.

## How to apply

```bash
psql "$DATABASE_URL" -f prisma/sql/<filename>.sql
```

Replay order doesn't matter as long as each file's prerequisites are met
(check the file's comment header).

## Why this exists / what NOT to do

The OSC portal connects to `ebright_crm` as its primary DB. The `crm` schema
contains both real CRM tables (`crm_contact`, `crm_user_branch`, ...) AND
foreign tables that proxy to `ebright_hrfs.public.*` (`BranchStaff`,
`ManpowerSchedule`, ...). HR routes query Prisma models that resolve via
search_path to those foreign tables.

**DO NOT run `prisma db push` against `ebright_crm`.** `db push` compares
schema.prisma to live DB state. It does not understand foreign tables — it
will try to ALTER or DROP them to match the schema's expectations, breaking
the FDW link and silently re-creating empty stub tables. (That mistake is
exactly what caused the May 2026 prod outage that motivated this plan.)

If you need to apply a Prisma schema change to HR models, apply it against
`ebright_hrfs` only:

```bash
DATABASE_URL="postgresql://...@103.209.156.174:5433/ebright_hrfs?schema=public" \
  npx prisma db push
```

For CRM-only model changes, use `ebright_crm` but with `--accept-data-loss`
**explicitly removed** so accidental destructive ops are blocked.

## Replay sequence for a fresh primary DB

If you ever set up a brand-new primary DB:

1. Apply `schema.prisma` to the new DB with `prisma db push` (this creates
   regular `crm_*` tables and, by accident, regular stub HR tables).
2. Apply every `prisma/sql/*.sql` file in date order — each one's `DROP TABLE
   IF EXISTS` step removes the stubs and replaces them with foreign tables.
3. Restart the app.
```

- [ ] **Step 4: Sanity-check the SQL parses**

Run a syntax-only check locally if you have psql installed, or skip — the real test happens in Task 4.

```bash
# Optional: only if you have psql on your laptop. Skips if not.
psql -f prisma/sql/2026-05-13-hr-fdw-views.sql --set ON_ERROR_STOP=1 \
  --dry-run 2>&1 | head -5 || true
```

Expected: either runs to completion without parse errors, or the command isn't available locally — either is fine for this step.

- [ ] **Step 5: Commit (do not push yet)**

```bash
git add prisma/sql/
git status
```

Expected: two new files staged. **Do NOT commit yet** — Task 8 commits these together with the smoke-test results to keep a clean trail. Leave them staged for now.

---

### Task 3: Apply SQL to the staging DB (or prod if staging shares prod's DB)

**Files:** None (DB operation).

This is the first operation that modifies live database state. Run only against the DB you confirmed safe in Task 1.

- [ ] **Step 1: Decide which DB to run against**

Based on Task 1 findings:
- If staging has its own DB → run against staging DB.
- If staging shares prod's DB → **STOP**. This plan needs revision: you can't isolate staging from prod, so the safest path is to schedule a brief HR-pages-down window, apply directly to prod, smoke-test, and live with the lack of a staging dress rehearsal. Surface this to your team before proceeding.

- [ ] **Step 2: Copy the SQL file to the target server**

From your laptop:

```bash
scp prisma/sql/2026-05-13-hr-fdw-views.sql deploy@103.209.156.225:/tmp/
```

(Replace user/host with prod's if Task 3 Step 1 routed you there.)

- [ ] **Step 3: Copy the SQL file into the container**

The osc container runs as the `nodejs` user (no root), so `psql` cannot be installed. We use the existing `pg` npm package instead.

```bash
docker compose -f <STAGING_APP_DIR>/docker-compose.yml cp \
  /tmp/2026-05-13-hr-fdw-views.sql osc:/tmp/fdw.sql
```

- [ ] **Step 4: Apply the SQL via Node + pg**

```bash
docker compose -f <STAGING_APP_DIR>/docker-compose.yml exec -T osc node <<'NODESCRIPT'
const fs = require("fs");
const {Client} = require("pg");
const sql = fs.readFileSync("/tmp/fdw.sql", "utf8");
const c = new Client({connectionString: process.env.DATABASE_URL});
(async () => {
  c.on("notice", n => console.log("NOTICE:", n.message));
  await c.connect();
  try {
    await c.query(sql);
    console.log("\nOK: SQL applied (transaction committed).");
  } catch (e) {
    console.error("\nERROR:", e.message);
    if (e.hint)  console.error(" hint:",  e.hint);
    if (e.where) console.error(" where:", e.where);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
NODESCRIPT
```

Expected output ends with:

```
NOTICE: crm.BranchStaff has 272 rows
NOTICE: crm.ManpowerSchedule has 38 rows
NOTICE: crm.AttendanceLog has <N> rows
NOTICE: crm.AttendanceLogST has <N> rows
NOTICE: crm.MedicalLeave has <N> rows
NOTICE: crm.LeaveTransaction has <N> rows
NOTICE: crm.Employee has <N> rows
OK: SQL applied (transaction committed).
```

If any line errors, the `BEGIN ... COMMIT` in the SQL rolls back automatically — no partial state. Read the error, fix the SQL file locally, re-copy (Step 3), re-run (Step 4). Common failures:
- `server "hrfs_srv" does not exist` → Task 0 found a different server name. Update the SQL accordingly.
- `permission denied for foreign server` → user mapping for `optidept` on `hrfs_srv` is missing. Recreate it from Task 0 Step 4's output.
- `relation "hrfs_remote.<TABLE>" already exists` → the idempotency drop missed a leftover. Add a `DROP FOREIGN TABLE IF EXISTS hrfs_remote."<TABLE>" CASCADE;` line near the others and re-run.

- [ ] **Step 4: Manual verification of one row**

Still in the container:

```bash
psql "$DATABASE_URL" -c "SELECT id, name, branch, role FROM crm.\"BranchStaff\" ORDER BY id LIMIT 3;"
```

Expected: three real rows with realistic names like `"NUR IRDIENA..."` etc. — proves FDW round-trip works end-to-end.

---

### Task 4: Restart the staging app container so Prisma reconnects

**Files:** None.

Prisma maintains a connection pool. Foreign-table queries should work without a restart, but rebuilding the container guarantees a clean Prisma client state.

- [ ] **Step 1: Restart**

On the staging server:

```bash
cd <STAGING_APP_DIR>
docker compose restart osc
docker compose ps
```

Expected: `osc` service `Up` again within ~10 seconds.

- [ ] **Step 2: Tail logs for startup errors**

```bash
docker compose logs --tail 50 osc
```

Expected: no `prisma:error` lines on startup. If there are any, capture and investigate before proceeding.

---

### Task 5: Smoke-test HR pages on staging-portal

**Files:** None (browser checks).

This task is human-verification. Each step is a page load + a check.

- [ ] **Step 1: Log into staging-portal.ebright.my as a SUPER_ADMIN**

Expected: dashboard loads, no errors.

- [ ] **Step 2: HR Employee Management**

Navigate to `staging-portal.ebright.my/dashboard-employee-management`.

Expected:
- "Total Employees" shows a number > 0 (around 272).
- Employee rows visible in the table.
- No "No employees found" message.

If still blank: open DevTools Network tab, find the `/api/employees` request, paste the response body into a scratch note. Likely it's a 500 with a Prisma error — capture and stop.

- [ ] **Step 3: Manpower Dashboard**

Navigate to `staging-portal.ebright.my/manpower-schedule/dashboard`. Pick a recent week tab.

Expected:
- Branch rows show schedule numbers (not "NOT PLANNED" for every row).
- "No branches have planned this week yet" message is gone for past weeks that did have schedules.

- [ ] **Step 4: Manpower Cost Report**

Navigate to `staging-portal.ebright.my/manpower-cost-report`. Pick a recent month (e.g. April 2026).

Expected:
- "STAFF" card shows a number > 0.
- Staff table populated below.

- [ ] **Step 5: Attendance Dashboard**

Navigate to `staging-portal.ebright.my/attendance/summary`. Pick today's date.

Expected: page loads. Counts may legitimately be 0 if no one has clocked in yet today — that's fine. The check is that the page renders without errors and that the "Missing Today" panel shows actual employee names from active staff (not "0 of 0 active").

- [ ] **Step 6: Record results in a scratch note**

For each of Steps 2-5: `PASS` or `FAIL with screenshot`. Required before moving to Task 6.

---

### Task 6: Smoke-test CRM hasn't regressed

**Files:** None (browser checks).

Confirm that adding foreign tables didn't break CRM.

- [ ] **Step 1: CRM Dashboard**

Navigate to `staging-portal.ebright.my/crm/dashboard`.

Expected: leads/opportunity counts populated (same numbers you saw before — e.g. "NL: 29" if data hasn't changed).

- [ ] **Step 2: CRM Tickets**

Navigate to `staging-portal.ebright.my/crm/tickets/dashboard`.

Expected: ticket totals populated (you saw "TOTAL: 2" before; still 2).

- [ ] **Step 3: CRM Contacts**

Navigate to `staging-portal.ebright.my/crm/contacts`. Pick any branch in the topbar.

Expected: contact list renders.

- [ ] **Step 4: Tail container logs for new errors**

On the staging server:

```bash
cd <STAGING_APP_DIR>
docker compose logs --tail 100 osc | grep -iE 'error|prisma' | tail -20
```

Expected: no new errors compared to a pre-task log snapshot. If new ones appear, capture and stop.

- [ ] **Step 5: Record results in the same scratch note**

CRM screens: `PASS` or `FAIL with details`.

---

### Task 7: Verification checklist before merging to main

**Files:** None.

Block the merge to `main` until every item below is checked.

- [ ] **Step 1: Functional verification (from Tasks 5 + 6)**

- [ ] HR Employee Management shows >0 staff on staging
- [ ] Manpower Dashboard shows schedules for at least one past week
- [ ] Manpower Cost Report shows staff for at least one past month
- [ ] Attendance Dashboard renders without errors
- [ ] CRM Dashboard shows expected lead counts
- [ ] CRM Tickets renders with expected ticket totals
- [ ] No new `prisma:error` lines in staging container logs

- [ ] **Step 2: SQL artifact verification**

- [ ] `prisma/sql/2026-05-13-hr-fdw-views.sql` exists and matches what was applied (no out-of-band edits during execution)
- [ ] `prisma/sql/README.md` warns about `prisma db push`
- [ ] Running the SQL a second time on the staging DB does not error (idempotency check)

Run the idempotency check on the staging server (same Node+pg pattern as Task 3 Step 4):

```bash
docker compose exec -T osc node <<'NODESCRIPT'
const fs = require("fs");
const {Client} = require("pg");
const sql = fs.readFileSync("/tmp/fdw.sql", "utf8");
const c = new Client({connectionString: process.env.DATABASE_URL});
(async () => {
  c.on("notice", n => console.log("NOTICE:", n.message));
  await c.connect();
  try { await c.query(sql); console.log("\nOK: idempotent run succeeded."); }
  catch (e) { console.error("\nERROR:", e.message); process.exit(1); }
  finally { await c.end(); }
})();
NODESCRIPT
```

Expected: same NOTICE output as the first run, ends with `OK: idempotent run succeeded.`, no errors.

- [ ] **Step 3: Rollback rehearsal**

Confirm you know how to roll back if prod goes badly. Rollback = re-create the empty stub tables and restart. Don't actually do this — just confirm the SQL is documented:

```sql
BEGIN;
DROP FOREIGN TABLE IF EXISTS crm."BranchStaff" CASCADE;
CREATE TABLE crm."BranchStaff" (id int);  -- minimal stub to satisfy Prisma
-- ... repeat for each table ...
COMMIT;
```

That's the worst-case path. In practice, "rollback" = nothing changes structurally; HR pages just go blank again until you re-run the SQL. Verify your team is OK with that worst case.

- [ ] **Step 4: Get sign-off**

Send a short Slack/chat message to whoever owns the CRM module (likely whoever wrote `lib/crm/auth.ts` — `git blame lib/crm/auth.ts | head -5` to find them) summarizing:

- "Adding FDW foreign tables in `ebright_crm.crm` for BranchStaff, ManpowerSchedule, AttendanceLog, AttendanceLogST, MedicalLeave, LeaveTransaction, User, Employee."
- "Tested on staging-portal. HR pages now work. CRM unchanged."
- "Plan to apply to prod tonight. Anything I'm missing?"

Wait for a response before Task 9. Use the [requesting-code-review](.) skill via `/request-code-review` if your team uses it.

---

### Task 8: Commit + push to staging

**Files:** None new (commits already-staged files from Task 2 Step 5).

- [ ] **Step 1: Ask the user about git push identity**

Before any commit/push to a remote, ask: "Push as `EbrightOD` or `dina-05`?" Per the user's stated workflow ([feedback memory](../../memory/feedback_git_push_identity.md)).

- [ ] **Step 2: Commit**

```bash
git diff --cached
```

Confirm only the two `prisma/sql/*` files are staged.

```bash
git commit -m "$(cat <<'EOF'
ops(fdw): finish FDW views for HR tables in ebright_crm.crm

Restores HR pages on portal.ebright.my by exposing ebright_hrfs.public.*
HR tables as Postgres foreign tables inside crm.*. Completes the FDW
architecture started in lib/crm/auth.ts (crm.hrfs_users SSO bridge view).

prisma/sql/2026-05-13-hr-fdw-views.sql is idempotent and applied via psql,
not Prisma. prisma/sql/README.md warns against running `prisma db push`
against ebright_crm (the cause of the May 2026 outage this fixes).

Smoke-tested on staging-portal: HR Employee Management, Manpower Dashboard,
Manpower Cost Report, Attendance Dashboard all render with real data. CRM
Dashboard and Tickets unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push to origin/staging**

```bash
git push origin staging
```

Expected: push succeeds. GitHub Actions `Deploy to Staging` workflow triggers automatically and runs through the smoke tests defined in `.github/workflows/staging-deploy.yml` — but those tests only cover unauthenticated API boundary checks, not HR/CRM data smoke. The real verification is what you already did in Tasks 5+6.

- [ ] **Step 4: Watch the staging deploy**

```bash
gh run watch
```

Or visit the Actions tab on GitHub. Expected: deploy completes within ~5 minutes. If it fails, the SSH/build step error is in the logs.

---

### Task 9: Apply SQL to production DB

**Files:** None (DB operation).

Mirrors Task 3 but against prod.

- [ ] **Step 1: Pre-flight reminder**

- [ ] Task 7 verification checklist all green
- [ ] Got sign-off in Task 7 Step 4
- [ ] Production HR pages are currently blank (the thing we're fixing), so there's no "working state" to regress relative to. CRM works and must stay working.
- [ ] You have a tab open to `portal.ebright.my/crm/dashboard` so you can refresh it immediately after applying to catch any CRM regression.

- [ ] **Step 2: Copy SQL to prod server**

From your laptop:

```bash
scp prisma/sql/2026-05-13-hr-fdw-views.sql staff1@103.209.156.174:/tmp/
```

- [ ] **Step 3: Apply via the prod container**

```bash
ssh staff1@103.209.156.174
cd /home/staff1/ebright-osc
docker compose cp /tmp/2026-05-13-hr-fdw-views.sql osc:/tmp/fdw.sql
docker compose exec -T osc node <<'NODESCRIPT'
const fs = require("fs");
const {Client} = require("pg");
const sql = fs.readFileSync("/tmp/fdw.sql", "utf8");
const c = new Client({connectionString: process.env.DATABASE_URL});
(async () => {
  c.on("notice", n => console.log("NOTICE:", n.message));
  await c.connect();
  try {
    await c.query(sql);
    console.log("\nOK: SQL applied (transaction committed).");
  } catch (e) {
    console.error("\nERROR:", e.message);
    if (e.hint)  console.error(" hint:",  e.hint);
    if (e.where) console.error(" where:", e.where);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
NODESCRIPT
```

Expected: same NOTICE rows for the 7 tables ending with `OK: SQL applied (transaction committed).`

- [ ] **Step 4: Restart prod containers**

```bash
docker compose restart osc worker
docker compose ps
```

Expected: both services `Up`. Watch logs for 30 seconds:

```bash
docker compose logs --tail 50 osc worker | grep -iE 'error|prisma'
```

Expected: no new errors.

---

### Task 10: Smoke-test production

**Files:** None (browser checks).

Same checks as Task 5+6, on production.

- [ ] **Step 1: HR pages on prod**

Visit each, log in as a SUPER_ADMIN:

- [ ] `portal.ebright.my/dashboard-employee-management` → ~272 staff visible
- [ ] `portal.ebright.my/manpower-schedule/dashboard` → schedules visible for past weeks
- [ ] `portal.ebright.my/manpower-cost-report` → staff visible for last completed month
- [ ] `portal.ebright.my/attendance/summary` → page renders, "Missing Today" populated with real names

- [ ] **Step 2: CRM pages on prod**

- [ ] `portal.ebright.my/crm/dashboard` → leads counts match what you saw earlier (29 in NL)
- [ ] `portal.ebright.my/crm/tickets/dashboard` → 2 total tickets still visible
- [ ] `portal.ebright.my/crm/contacts` → contact list still loads

- [ ] **Step 3: Container logs**

```bash
docker compose logs --tail 200 osc worker | grep -iE 'error|prisma' | tail -30
```

Expected: same baseline of errors as before (the existing `crm_user_branch.create()` errors are unrelated to this work — they predate this change). No NEW errors introduced.

- [ ] **Step 4: Decision**

- All HR + CRM pages pass → proceed to Task 11.
- Any HR page still blank → re-check Task 9 Step 3 output for FDW errors; verify `srvname` was correct; re-run if needed.
- Any CRM page broken → roll back (re-create stub HR tables — see Task 7 Step 3) and surface to team immediately. CRM regression is the higher-priority bug.

---

### Task 11: Merge staging → main

**Files:** None (git operation).

- [ ] **Step 1: Confirm staging branch is clean and ahead of main only by this work**

```bash
git checkout staging
git pull origin staging
git log --oneline origin/main..origin/staging
```

Expected: at minimum the FDW commit from Task 8. If unrelated commits are also there, that's normal — staging picks up everything that's been integrated since main last merged.

- [ ] **Step 2: Ask user about git push identity**

Same as Task 8 Step 1.

- [ ] **Step 3: Open PR (or fast-forward, per team workflow)**

If your team uses PRs from `staging → main`:

```bash
gh pr create --base main --head staging \
  --title "Restore HR pages on portal.ebright.my via FDW" \
  --body "$(cat <<'EOF'
## Summary

- Adds Postgres foreign tables in `ebright_crm.crm` for HR tables (BranchStaff, ManpowerSchedule, AttendanceLog, AttendanceLogST, MedicalLeave, LeaveTransaction, User, Employee).
- Completes the FDW architecture started in `lib/crm/auth.ts` (`crm.hrfs_users` SSO view).
- Restores the four HR pages on `portal.ebright.my` that went blank after the CRM rollout.
- Zero application code changes — Prisma queries resolve transparently via search_path.

## Test plan

- [x] Applied SQL to staging DB, verified HR pages on staging-portal
- [x] Verified CRM pages did not regress on staging-portal
- [x] Applied SQL to prod DB
- [x] Verified HR pages on portal.ebright.my show real data (~272 staff, 38 schedules)
- [x] Verified CRM pages on portal.ebright.my unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If your team merges staging into main directly:

```bash
git checkout main
git pull origin main
git merge --no-ff staging
git push origin main
```

- [ ] **Step 4: Watch the prod deploy workflow**

```bash
gh run watch
```

The workflow at `.github/workflows/prod-deploy.yml` will SSH to `staff1@103.209.156.174` and run `/home/staff1/deploy-prod.sh osc`, which `git pull origin main` + `docker compose up -d --build`. Since prod's DB already has the FDW views (Task 9), this just rebuilds the app container — no FDW work needed in the deploy.

Expected: deploy completes within ~5 minutes.

---

### Task 12: Post-deploy verification

**Files:** None (browser + log checks).

After the prod deploy completes, repeat Task 10 once more. The DB state is identical; this just confirms the new container start didn't lose the FDW views (it can't — they live in PG, not in the container).

- [ ] **Step 1: Re-check HR pages on prod**

Same list as Task 10 Step 1.

- [ ] **Step 2: Re-check CRM pages on prod**

Same list as Task 10 Step 2.

- [ ] **Step 3: Close out**

Update the team Slack/chat:

- "Prod HR pages restored via FDW. CRM unaffected. SQL artifact + README warning in `prisma/sql/`. Reminder: do not run `prisma db push` against `ebright_crm` ever again."

- [ ] **Step 4: Update `MEMORY.md` if any new conventions emerged**

If during execution you learned something the team should remember (e.g. "the staging DB is actually shared with prod", "the foreign server is named `xyz`"), save it as a memory.

---

### Task 13: Add a guardrail against future `prisma db push` accidents

**Files:**
- Modify: `package.json` — replace the `build` script's `prisma generate` invocation so it can't accidentally `db push` in CI.

This is the durability layer. Without it, the same outage recurs the next time someone unfamiliar with this setup runs `npx prisma db push` while pointed at `ebright_crm`.

- [ ] **Step 1: Read the current build script**

Open `package.json`, find:

```json
"build": "prisma generate && next build",
```

`prisma generate` is fine — it only emits the client, doesn't touch the DB. We're guarding against `db push`, which a developer might run separately.

- [ ] **Step 2: Add a pre-push refusal script**

In `package.json`, under `scripts`, add:

```json
"db:push:safe": "node -e \"const u = process.env.DATABASE_URL || ''; if (u.includes('ebright_crm')) { console.error('REFUSING db push against ebright_crm — see prisma/sql/README.md'); process.exit(1); } require('child_process').spawnSync('npx', ['prisma','db','push'], { stdio: 'inherit' });\"",
```

Engineers should be trained to run `npm run db:push:safe` instead of `npx prisma db push` directly. (You can't actually prevent direct CLI use — Prisma doesn't expose hooks for that — but the safe-script + README warning + this commit's existence in `git log` make it harder to do by accident.)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(safety): add db:push:safe script that refuses ebright_crm

`prisma db push` against the CRM primary DB clobbers FDW foreign tables and
re-creates empty stub HR tables, which is what caused the May 2026 HR-pages
outage. This script wraps `prisma db push` and refuses to run when
DATABASE_URL points at ebright_crm. Engineers should run `npm run
db:push:safe` instead of the raw CLI.

See prisma/sql/README.md for context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin staging
```

- [ ] **Step 4: Mark plan complete**

Once Task 13 is merged to main, the plan is fully delivered. Close any open todos.

---

## Self-Review Notes

(These are for the plan author to verify before handing off, not for the engineer executing.)

**Spec coverage:**
- Restore HR pages on prod: Tasks 9-10 ✓
- Test on staging first: Tasks 3-6 ✓
- Verification checklist before merge: Task 7 ✓
- Multiple small commits on staging: Task 8, 13 (2 commits — could be more granular if desired) ✓
- One PR on staging: Task 11 ✓
- Don't break CRM: Task 6, Task 10 Step 2 ✓
- Idempotent SQL: Task 2 Step 2 (SQL uses `IF EXISTS` and `IF NOT EXISTS` everywhere) ✓
- Durable against future accidents: Task 13 ✓

**Placeholder scan:**
- `<FOREIGN_SERVER_NAME>` in Task 2 — resolved by Task 0. Acceptable since Task 0 explicitly names this and Task 2 references it. Not a "fill in details later" placeholder.
- `<STAGING_APP_DIR>` in Task 1/3 — resolved by Task 1 Step 2. Same reasoning.
- No "TBD", "implement later", or "appropriate error handling" found.

**Type/name consistency:**
- Table names referenced consistently: `BranchStaff`, `ManpowerSchedule`, `AttendanceLog`, `AttendanceLogST`, `MedicalLeave`, `LeaveTransaction`, `User`, `Employee` — appear in same form in Tasks 0, 2, 3, 4, 5, 7.
- Foreign-server name only resolved at runtime — flagged but unavoidable.

**Known gaps:**
- Plan does not cover the existing `prisma:error / crm_user_branch.create()` errors in the worker logs. Those predate this work and are out of scope. Worth raising as a follow-up issue but not blocking.
- Plan does not migrate the 14 stale `crm_user_branch` rows in `ebright_hrfs` (left over from when the app was wrongly pointed there). They sit harmless because the app no longer reads them. Cleanup is a follow-up.
