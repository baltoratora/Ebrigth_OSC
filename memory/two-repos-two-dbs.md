---
name: two-repos-two-dbs
description: There are two HR app repos and several databases; the LIVE localhost app is Ebrigth_OSC on ebright_hrfs, not ebright-osc-v2
metadata:
  type: project
---

Two parallel HR app codebases exist on this machine, plus multiple databases on the same Postgres server (103.209.156.174:5433). Confusing them wastes a lot of effort.

- **`Ebrigth_OSC`** (primary folder, `app/` router) — this is the app the user runs on localhost. Attendance "Missing box" data comes from `hrfsPrisma.branchStaff` (the `BranchStaff` table) in the **`ebright_hrfs`** DB, via `app/api/branch-locations/route.ts`. Staff rosters here are NOT the Prisma users/employment model — `BranchStaff` is the source of truth, identified by `employeeId` (e.g. CHOW CHIN HUI=33030010, ROHAN KUMAR A/L MANOHAR LAL=33010041).
- **`ebright-osc-v2`** (`src/app/` router) — a separate WIP rewrite. Its `.env` `HRFS_DATABASE_URL` points at a STALE `hrfs` DB (174 users) that lacks the real employees. Editing here does NOT affect the user's localhost.

**Why:** the two repos look similar (both have AttendanceSummary, a "Missing Today" panel) but serve different DBs. `ebright_hrfs` (public schema) holds legacy `BranchStaff`; the v2 Prisma model (users/employment/user_profile) lives in a different DB.

**How to apply:** before editing attendance/HR code, confirm which repo localhost is running. Verify data against `ebright_hrfs` using `HRFS_DATABASE_URL` from `Ebrigth_OSC/.env` (NOT v2's). The v2 `.env` `hrfs` value appears misconfigured relative to v1's `ebright_hrfs`.
