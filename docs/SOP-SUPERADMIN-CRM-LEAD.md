# Ebright CRM — Super Admin SOP (Lead Module)

**Audience:** Super Admin users responsible for the **Lead** side of Ebright CRM across every branch (HQ oversight, agency operations, system configuration).

> **Screenshot placement convention used in this document:**
> Wherever you see a line like `[SCREENSHOT: ...]`, that is a marker showing **where to paste a screenshot** when this SOP is converted into a printable / shared training document. Replace each marker with the actual image after you take it.

---

## Purpose

To ensure that Super Admin users operate the **Lead** side of Ebright CRM consistently and safely across all 25 branches — covering daily oversight, system configuration, automation governance, and data hygiene.

The Super Admin role sits **above** Agency Admin, Branch Manager, and Branch Staff. With a fuller view of the funnel and elevated privileges (create branches, configure pipelines, build automations, view audit log), this role's actions can affect every branch in the tenant — so this SOP errs toward "verify first, change second."

---

## Scope

This SOP covers the **Lead Module** only. The **Ticket Module** is governed by a separate document — see *Related SOPs* at the end.

In scope:

- The elevated **Leads Dashboard** view (Main + Region rollups + branch comparison)
- **Opportunities** kanban — pipeline rules, bulk operations, stage remarks
- **Contacts** — searching, filtering, deduplication, sibling-children handling
- **Automations** — visual workflow editor + system automations catalogue
- **Forms** — public form admin
- **Branches**, **Pipelines**, **Lead Sources**, **Tags**, **Custom Values**, **Team**, **API Keys**, **Audit Log**, **Integrations**
- **Notifications** (lead-related entries)
- Diagnostic + recovery scripts for known data issues
- Lead auto-progression (FU3 → UR_W1 → UR_W2 → UR_W3 → Cold Lead)

Out of scope: anything starting with `/crm/tkt-*` or `/crm/tickets` — see the Ticket SOP.

---

## Operating Rules

These rules apply at all times in the Lead module, regardless of which page is open.

- **Use Super Admin powers sparingly.** Any change made from this role is global — write-actions on Pipelines, Lead Sources, Tags, Automations, or Branches affect every BM in the tenant.
- **Never delete or downgrade your own SUPER_ADMIN role.** There must be at least one active Super Admin at all times. Use a colleague's account to roll back your own privileges if needed.
- **Trial Class Schedule is read-only for Super Admin.** This is by design — drill-in into a specific student should happen via the branch-side view (use **Login As…** from the profile dropdown to take an Agency Admin or BM view if you need to interact).
- **Treat the dashboard's Buffer column as side-info, not funnel.** Buffer (`SG` shortCode) is the OD-only staging area — it does NOT roll into Confirmed Rate / Conversion Rate denominators.
- **Stage moves leave a permanent trail.** Every drag, bulk-move, or auto-progression writes to `crm_stage_history`. CT/SU/ENR dashboard counts are bucketed by this entry date — never edit `stage_history` directly.
- **Cross-branch data leaks are CRITICAL severity.** If a BM reports seeing another branch's leads, stop and investigate immediately.
- **Pipelines must remain 17 stages.** The canonical lead pipeline is `NL → FU1 → FU2 → FU3 → RSD → CT → CNS → SU → SNE → ENR → UR_W1 → UR_W2 → UR_W3 → FU3M → CL → DND → SG`. Add/remove only with a planned migration — branch dashboards depend on these stage codes.
- **Lead data is confidential.** Parent phone, email, child name(s), age, and campaign data must not be exported, screenshotted, or shared outside the CRM without HQ approval.
- **This SOP is reviewed when system behaviour changes.** Always re-read after a deploy that touches the lead module.

---

# Part 1 — SOP (Daily, Weekly, Monthly Procedures)

A Super Admin doesn't run the same 10 steps every day a BM does. Instead, work is organised into three cadences: **daily oversight**, **weekly maintenance**, and **monthly review**. Plus an **as-needed** track for one-off events (new branch onboarding, data repair, automation rollout, etc.).

---

## Daily — Health Check (≤ 15 minutes)

Run this once per working morning, ideally before BMs start their day.

### Step 1 — Sign In and Confirm Super Admin View

1. Open Chrome or Edge → `https://staging-portal.ebright.my` (or the prod URL).
2. Sign in with your Super Admin credentials.
3. Confirm the topbar shows **Super Admin View · Viewing all 25 branches**.
4. If it shows a single branch, click the branch switcher → **Super Admin View** to switch back.

`[SCREENSHOT: Topbar showing Super Admin View dropdown]`

### Step 2 — Scan the Leads Dashboard

1. Open **Dashboard** (`/crm/dashboard`).
2. Default range is **This Week (Mon)** — leave it.
3. Read the **Main** block:
   - NL (today + this week) — should align with what your live ingest is producing.
   - CT / SU / ENR — note any region where CT > NL (impossible — investigate).
   - Buffer — should be 0 in production unless OD is actively using it.
4. Scan the **Region A / B / C** cards — flag any region whose Confirmed Rate is under 10% or Conversion Rate is under 2%.
5. Scan the **New Leads by Branch** bar chart — branches with 0 leads in This Week should be queried (deploy issue? webhook down?).

`[SCREENSHOT: Super Admin dashboard with Main + Region rollups visible]`

### Step 3 — Check the Trial Class Schedule (Read-Only)

1. Below the regions, the **Trial Class Schedule** widget is visible with a **branch picker dropdown** and a **Read-only** lock badge.
2. Pick 2–3 branches and confirm each has trials booked for the current week.
3. Counts are unclickable in this view by design. If you need to drill into who's attending, use **Login As…** to enter the branch as an Agency Admin or BM.

`[SCREENSHOT: Trial Class Schedule with branch dropdown + Read-only badge]`

### Step 4 — Review the Notifications Bell

1. Click the bell icon (top-right).
2. Look for:
   - **AUTOMATION_FAILED** entries — a user-built workflow errored; click through to see the failure log on the automation detail page.
   - **STUCK_LEAD** entries that have been firing for the same lead across multiple days (the BM is ignoring them; flag to the Branch Manager Lead).
3. Mark all read once reviewed.

`[SCREENSHOT: Notifications page filtered to ones requiring admin attention]`

### Step 5 — Glance the Recent Audit Log

1. Open **Settings → Audit Log** (`/crm/settings/audit-log`).
2. Filter by **Today**.
3. Scan for:
   - Any DELETE actions on `crm_branch`, `crm_pipeline`, `crm_automation`, `crm_lead_source`, `crm_tag` — these are destructive.
   - Any UPDATE on `crm_automation` with `toggle: enabled` for an automation you didn't enable yourself — confirm with the agency admin who flipped it.
4. Spot-check 2–3 entries for unexpected actors (e.g. branch staff users editing automations — shouldn't happen).

`[SCREENSHOT: Audit log filtered to today]`

---

## Weekly — System Hygiene (≤ 45 minutes, every Monday)

Run after the daily health check on Monday morning.

### Step 6 — Review Custom Automations

1. Open **Automations** (`/crm/automations`) and switch to the **Custom** tab.
2. Scan the table:
   - Any automation in **Live** state that hasn't fired in 14+ days → click in, run a **Test run** against a real contact, decide whether to disable.
   - Any automation with a recent **FAILED** lastRun → click in, open the **Runs** drawer, inspect logs.
3. Spot-check 2–3 automations end-to-end to make sure they're still connected (node config is filled, edges exist).

`[SCREENSHOT: Custom automations tab with last-run timestamps + status icons]`

### Step 7 — Cross-Check the Built-In Catalogue

1. Same page, switch to the **Built-in** tab.
2. Expand each entry under **Stage Transitions** and **Lead Ingestion** — confirm the source files referenced still exist (no recent code reshuffle broke them).
3. Of particular interest:
   - `auto-progress unresponsive leads (FU3 → UR_W1 → UR_W2 → UR_W3 → CL)` — verify the hourly scan is running (see Step 9).
   - `Wix / Meta / TikTok` ingestion — cross-check the per-branch lead count against the source DB if anything looks off.

`[SCREENSHOT: Built-in automations tab expanded]`

### Step 8 — Verify Trial Schedule Sanity Across Regions

1. Back on the dashboard, use the **branch dropdown** inside the Trial Schedule widget to cycle through one branch per region.
2. Confirm trial bookings look sensible (no branch shows zero for the current week unless it's genuinely closed).

### Step 9 — Confirm Stale-Lead Cron is Firing

1. Pick any branch that's been live for 3+ weeks.
2. Open its Opportunities kanban (use **Login As…** if needed).
3. Click into UR_W2 and UR_W3 columns. Sample one lead each:
   - Open the lead detail → check **Stage remarks** at the bottom.
   - Expect a line like `Auto-moved from UR_W1 after 7 days of inactivity` or `Unresponsive (Auto-Generated)` for the URW3 → CL step.
4. If no auto-moved leads exist anywhere in URW2/URW3/CL → the worker/cron may be down. Investigate with the engineering team.

`[SCREENSHOT: Lead detail Stage Remarks section showing auto-move entries]`

### Step 10 — Branch & User Roster Review

1. Open **Settings → Team** (`/crm/settings/team`).
2. Confirm all 25 branches have at least 1 BRANCH_MANAGER and 1 BRANCH_STAFF.
3. Look for users with `lastLoggedInAt` older than 30 days → consider deactivating.
4. Open **Settings → Branch Access** (`/crm/settings/branch-access`).
5. Confirm no user has access to more branches than their role intends.

---

## Monthly — Performance Review (≤ 2 hours, first working day of the month)

### Step 11 — Regional Performance Drill-down

1. On the dashboard, set the range to **Last 30 Days**.
2. Capture:
   - Total NL per region (Region A / B / C).
   - Conversion Rate (ENR/NL) per region.
   - Confirmed Rate (CT/NL) per region.
3. For each region, identify the bottom-2 branches by Conversion Rate. Submit a coaching brief to those branch managers.

### Step 12 — Pipeline Audit

1. Open **Settings → Pipelines** (`/crm/settings/pipelines`).
2. Confirm every branch's lead pipeline has exactly 17 stages with the canonical short-codes (see Operating Rules).
3. Confirm `stuckHoursYellow` / `stuckHoursRed` thresholds match HQ policy (default 24h / 48h).

### Step 13 — Automation Lifecycle

1. Disable any custom automation that hasn't been used in 60+ days (after a final test run on a real contact). Disabled is reversible — deletion isn't.
2. Audit the automations the BM team built last month → are any sending the same message to the same lead twice (race condition with a system automation)? If yes, add a condition node to gate it.

### Step 14 — Lead Source Cleanup

1. Open **Settings → Lead Sources** (`/crm/settings/lead-sources`).
2. Merge near-duplicates (e.g. "Facebook" / "Meta" / "FB" → one).
3. Confirm every active campaign maps to a known lead source — orphan campaign names in `crm_contact.campaignName` are a sign the ingest mapping needs updating.

---

## As-Needed — One-Off Procedures

### Onboarding a new branch

1. **Settings → Branches** (`/crm/settings/branches`) → **+ New Branch**.
2. Fill name (`NN Ebright (Location)` format), code, region, address, phone, email, timezone, operating hours, Branch Manager.
3. On save, the system automatically creates:
   - A matching `crm_pipeline` with all **17 canonical stages** (NL, FU1-3, RSD, CT, CNS, SU, SNE, ENR, UR_W1-3, FU3M, CL, DND, SG).
   - A `tkt_branch` entry if the branch name has an "NN" digit prefix AND a code was supplied.
4. Add the branch manager to the **Team** with role `BRANCH_MANAGER`.
5. Configure webhook integrations for the new branch (Meta / Wix / TikTok per the agency setup).
6. Place a synthetic test lead through Meta / Wix / TikTok and confirm it lands in the new branch's `NL` column within 30 seconds.

`[SCREENSHOT: New Branch form filled in]`

### Adding a new pipeline stage

This is **rare** — the 17-stage canon was designed to cover the Ebright funnel. Adding/removing a stage requires:

1. Update `LEAD_PIPELINE_STAGES` in `server/actions/branches.ts`.
2. Update both seed files (`seed-from-powerbi.ts`, `seed-ebright-od.ts`).
3. Write an idempotent SQL migration in `scripts/` (model on `scripts/add-urw3-stage.sql`) to insert the new stage into every existing pipeline.
4. Update `ALLOWED_LEAD_TRANSITIONS` in `kanban-board.tsx` so the new stage participates correctly.
5. Update `STAGE_PATTERN` in `app/api/crm/dashboard/leads-metrics/route.ts` if the new stage should count in any funnel category.

Coordinate with engineering — this is a code change, not a setting.

### Diagnosing duplicate parent cards

Symptom: multiple cards in the same column showing the same parent name (e.g. three "Ema" cards instead of "Naufal / Naura / Naura").

1. Run the diagnostic from a Node terminal: `LEADS_DB_URL='...' npx tsx scripts/diagnose-sibling-children.ts`.
2. Inspect the four sections:
   - **A.** Submissions with missing siblings in CRM → may need re-ingest.
   - **B.** Lookalike groups (run `scripts/backfill-sibling-children.ts`).
   - **C.** Placeholder names (`Child N`) → run `scripts/cleanup-child-placeholders.ts`.
   - **D.** Upstream incomplete submissions (data-quality issue in `master_leads_base`).

`[SCREENSHOT: Diagnostic script output]`

### Recovering child names from master_leads_base via SQL

If the Node scripts can't be run, the equivalent SQL recovery (uses `dblink` to reach `ebrightleads_db`) is documented in the engineering runbook. Get the leads-DB credentials from the worker `.env`. **Always wrap in `BEGIN; … ROLLBACK;` first** for a dry-run before committing.

### Investigating a "lead disappeared" report

1. Search **Contacts** by phone or email — does the contact still exist?
2. If yes, click into it and check the latest **Stage History** entries — was it auto-moved to CL? Look for `Unresponsive (Auto-Generated)` remark.
3. If no, check **Settings → Audit Log** for a DELETE on `crm_contact` matching the email/phone.
4. If still no, check `master_leads_base` in `ebrightleads_db` to confirm it was actually submitted — sometimes the parent thinks they submitted but didn't hit Send.

### Forcing a manual stale-lead scan

The hourly auto-progression worker is BullMQ-backed; on Redis-less environments (staging) it doesn't fire. To force a scan:

```bash
curl -X POST https://staging-portal.ebright.my/api/crm/cron/move-stale-leads \
  -H "Authorization: Bearer $CRON_SECRET"
```

The endpoint returns JSON with per-step counts. Set `CRON_SECRET` in env first.

---

# Part 2 — Guidelines (Full Feature Reference)

Use this section as a lookup when Part 1 references a page or feature you need to explore in depth.

---

## G1. Topbar — Super Admin–specific

### G1.1 Branch switcher

- Defaults to **Super Admin View · Viewing all 25 branches**.
- Dropdown lists every branch in the tenant. Picking one switches the dashboard to that branch's view (single-branch metrics + clickable trial schedule).
- Returning to **Super Admin View** restores the regional rollup + bar chart + table.

### G1.2 Login As… (admin-only)

In the profile dropdown:

- **Login As…** lets a Super Admin take any other user's perspective in the CRM. Useful for reproducing a BM's bug report without asking them to hand over their credentials.
- A persistent yellow banner appears at the top of the screen while you're logged-in-as.
- Click **Reset to default admin** to return to your Super Admin context.

`[SCREENSHOT: Profile dropdown with Login As + Reset to default admin visible]`

### G1.3 Dark / Light mode toggle

- In the profile dropdown (between Reset and Sign Out). Click to swap; the choice persists per browser.

---

## G2. Leads Dashboard (Elevated View)

The Super Admin Leads Dashboard renders three blocks **in order** from top to bottom:

1. **Main** — agency-wide totals (NL / CT / SU / ENR / Buffer) plus the four funnel rates.
2. **Region A / B / C** — same five stats compacted to four (no Buffer at regional level).
3. **Trial Class Schedule** — branch-picker + read-only grid for the current week (or other preset).
4. **New Leads by Branch** — horizontal bar chart, coloured by region.
5. **Branch Table** — sortable per-branch table with NL/CT/SU/ENR + Conv / Enrol rates.

### Counting model

- **NL** counts opportunities `createdAt`-in-range (a snapshot of inflow).
- **CT / SU / ENR** count by `crm_stage_history` entries whose `changedAt` falls in the range. Each opportunity dedupes per category per range, so a CT → RSD → CT bounce in one period doesn't double-count.
- **Buffer** is a current-stage snapshot of leads parked in `SG` (Buffer / OD use only).

### Date presets

`Today · Yesterday · This Week (Mon) · Last Week · Last 30 Days`. Default on landing is **This Week (Mon)**.

---

## G3. Automations Surface

Three layers, all at `/crm/automations`:

### G3.1 Stats strip + tabs

- **Built-in** count — the 17 hard-coded flows (`SYSTEM_AUTOMATIONS` in `lib/crm/system-automations.ts`).
- **Custom** count — automations created via the visual editor.
- **Live** count — custom automations with `enabled: true`.
- **Last 24h** — quick health pulse on whether the workflow worker is running.

### G3.2 Starter templates row

Six pre-built workflows (Welcome, No-reply nudge, Trial confirmation+reminder, Show-up handling, Stale 3-day nudge, Enrolment celebration). Click any to land in the editor with the graph pre-seeded.

### G3.3 Custom automation list

- Toggle Live / Draft, Edit, Duplicate, Delete.
- Last-run status + timestamp shown inline.

### G3.4 Built-in automation catalogue

Read-only, grouped by category. Each entry expands to show **Trigger**, **Actions** (numbered), and **Source files** (clickable).

### G3.5 Visual workflow editor

At `/crm/automations/[id]`:

- React Flow canvas with custom nodes for Trigger, Action, Wait, If/Else.
- Click a node → right-side **Node Config Panel** with per-action-type fields (message body + template tokens, tag picker, stage picker, user picker, delay amount/unit, condition field/op/value, webhook URL).
- **Test run** in the toolbar — fires the workflow against a selected contact.
- **Runs** drawer — last 20 runs with per-step logs, auto-refreshes every 5s.
- Autosave debounced at 1.2s.

`[SCREENSHOT: Automation editor with a node selected + config panel open]`

---

## G4. Opportunities (Kanban) — Super Admin–specific behaviour

### G4.1 Transition rules bypass

Super Admin and Agency Admin **bypass** `ALLOWED_LEAD_TRANSITIONS`. Branch users are restricted to forward-only stage moves; admins can move a lead between any two stages in any pipeline.

Use sparingly — bypassing the rules means stage_history entries don't follow the normal funnel pattern and dashboard counts may surprise BMs.

### G4.2 Bulk move

- Tick the per-card checkbox (appears on hover; sticky once selected).
- Bulk-action bar at the top: **Move to stage** + **Delete** + **Add tag**.
- For branch users, leads that can't move per `ALLOWED_LEAD_TRANSITIONS` are rejected with a per-stage summary toast (`3 leads can't move to CT (NL×2, FU1×1). Skipped.`).
- For admins, all selected leads move regardless.

### G4.3 Stage Remarks display

Every stage move writes a `crm_stage_history` row with `changedByUserId` and `note`. The lead detail page surfaces these under a **Stage Remarks** section, oldest-first.

Notes written by the system (e.g. `Unresponsive (Auto-Generated)`, `Auto-moved from FU3 after 7 days of inactivity`) have `changedByUserId = NULL` — render as **Auto** in the UI.

---

## G5. Branch Administration (`/crm/settings/branches`)

- List + Create / Edit / Disable branch.
- Creating a branch atomically creates the pipeline + 17 stages + (optionally) the tkt_branch.
- Editing the name keeps UUIDs intact so historical references survive.
- Disabling a branch hides it from BM dropdowns but preserves the data — never delete.

---

## G6. Team & Access (`/crm/settings/team`, `/crm/settings/branch-access`)

- **Team** — list every user with CRM access. Filter by role / status.
- **Branch Access** — per-user branch grants. A user can have multiple branch grants with different roles per branch (rare but supported).
- **Invite** — sends a sign-up link via email.
- **Deactivate** — soft-disables the user. Reactivation reverses it.

---

## G7. Pipelines, Lead Sources, Tags, Custom Values

All under `/crm/settings/*`.

- **Pipelines** — per-branch view. Adding/removing stages here is risky (see Operating Rules).
- **Lead Sources** — canonical list. Merge duplicates regularly.
- **Tags** — tenant-wide. Colour-coded chips on the kanban card.
- **Custom Values** — per-branch key/value store used by automation actions (`UPDATE_FIELD` action's custom-key path writes here).

---

## G8. Integrations (`/crm/integrations`)

- Per-branch OAuth / webhook setup for Meta, TikTok, Google, Outlook, Wix.
- The webhook routes live at `app/api/webhooks/{meta,tiktok,whatsapp,wix}/[branchId]/` and write into `master_leads_base` in `ebrightleads_db`.
- Once a row is in `master_leads_base`, the `leadIngestWorker` pulls it into CRM as a `crm_contact` + `crm_opportunity`.

---

## G9. API Keys (`/crm/settings/api-keys`)

- Generate per-tenant API keys for external partners (analytics, BI tools).
- Revoking a key takes effect immediately.

---

## G10. Audit Log (`/crm/settings/audit-log`)

- Tenant-wide log of every CREATE / UPDATE / DELETE on the major CRM tables.
- Searchable by user, entity type, time range.
- Daily glance is part of the daily health check (Step 5).

---

# Reporting Bugs & Issues

Same template as the branch SOP — but as a Super Admin, **also include**:

- The tenant ID / branch IDs affected.
- Whether the issue is reproducible while logged-in-as a BM.
- Whether the BullMQ worker is up (check via the worker logs in your container).

### Severity guide (Super Admin escalation)

| Severity | Examples |
|---|---|
| **Critical** — page engineering immediately | Cross-branch data leak. Stage history corruption. Webhook signature validation broken (untrusted writes possible). All branches suddenly seeing zero new leads. |
| **High** | Automation worker not consuming jobs. Dashboard numbers diverge from kanban counts. Auto-progression not firing. |
| **Medium** | UI regression. Slow page. Confusing wording in a built-in flow. |
| **Low** | Typos. Minor spacing issues. |

---

# Related SOPs

| ROLE | LINK |
|---|---|
| **SUPER ADMIN — Lead module** | **This document** — `docs/SOP-SUPERADMIN-CRM-LEAD.md` |
| SUPER ADMIN — Ticket module | `docs/SOP-SUPERADMIN-CRM-TICKET.md` |
| AGENCY ADMIN USE | _<HQ to fill in once the Agency Admin SOP is published>_ |
| BRANCH MANAGER USE | `docs/SOP-BRANCH-BETA-TESTER.md` |

> When published to the internal docs site, replace the placeholders above with the live URLs.

---

**End of SOP.**
