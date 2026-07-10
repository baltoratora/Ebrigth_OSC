# Ebright CRM — Super Admin SOP (Ticket Module)

**Audience:** Super Admin users responsible for the **Ticket** side of Ebright CRM — HQ operations team triaging branch requests for Aone / Frog / Online / Marketing / Inventory / Finance issues.

> **Screenshot placement convention used in this document:**
> Wherever you see a line like `[SCREENSHOT: ...]`, that is a marker showing **where to paste a screenshot** when this SOP is converted into a printable / shared training document. Replace each marker with the actual image after you take it.

---

## Purpose

To ensure Super Admin users operate the **Ticket Module** consistently — covering daily triage, platform / branch / user administration, ticket lifecycle management, and the SLA discipline branches depend on.

The Ticket Module is how branches request help from HQ. Branches submit; HQ resolves. A Super Admin on the ticket side sees **every ticket across every branch**, regardless of which platform it was filed against, and has authority to assign, change status, comment, and configure the structural metadata (platforms, branches, users).

---

## Scope

This SOP covers the **Ticket Module** only. The **Lead Module** is governed by a separate document — see *Related SOPs*.

In scope:

- **My Tickets** (`/crm/tickets`) — list, search, filter, sort.
- **Ticket Kanban** (`/crm/tickets/kanban`) — drag-based triage by status.
- **Ticket Dashboard** (`/crm/tickets/dashboard`) — counts, weekly chart, per-platform totals.
- **Ticket Detail** (`/crm/tickets/[id]`) — status timeline, comments, attachments, assignment.
- **TKT Platforms** (`/crm/tkt-platforms`) — the catalogue of platforms (Aone, Online, Marketing, etc.) and their sub-types.
- **TKT Branches** (`/crm/tkt-branches`) — the per-branch view used by the ticket module (mirrors the lead branch list but with a `branch_number` + `code` requirement).
- **TKT Users** (`/crm/tkt-users`) — assignment of platform admins (`platform_admin`, `super_admin` in the ticket-module sense) to handle specific platforms.
- **Notifications** (lead-side and ticket-side share one inbox).

Out of scope: anything under `/crm/contacts`, `/crm/opportunities`, `/crm/automations` — see the Lead SOP.

---

## Operating Rules

These rules apply at all times in the Ticket Module.

- **Never close a ticket without a documented outcome.** "Complete" should follow a comment that explains what was actually done at HQ. "Rejected" must include a reason so the branch can resubmit cleanly.
- **Assignment is a commitment, not a courtesy.** When you assign a ticket to a TKT User, they are accountable for it. Don't bulk-assign without intent.
- **Branches see only their own tickets.** Cross-branch leaks are CRITICAL severity — escalate immediately if a BM reports seeing another branch's ticket numbers or detail.
- **Attachment retention is sensitive.** Some tickets include student documents (Black & White File, MC certs). Treat all attachments as confidential — do not download to personal devices, do not share outside HQ.
- **Status transitions are tracked.** Every change to a ticket's status writes an event the branch can see in their timeline. Be deliberate.
- **TKT branches must mirror the CRM lead branches.** Adding a new branch via `/crm/settings/branches` automatically creates the matching `tkt_branch` row **only if** the branch name has an "NN" digit prefix AND a code was supplied. If either is missing, create the `tkt_branch` manually via `/crm/tkt-branches`.
- **Don't delete platforms with active tickets.** Disabling a platform hides it from the new-ticket form but preserves history; deleting cascades and loses the audit trail.
- **Email notifications use Resend.** If the ticket-email worker is down, branches won't get email updates — they'll only see status changes inside the CRM. Monitor the worker log periodically.

---

# Part 1 — SOP (Daily, Weekly, Monthly Procedures)

Like the Lead SOP, work is organised by cadence — daily triage, weekly hygiene, monthly review — plus an as-needed track for unusual events.

---

## Daily — Triage (≤ 30 minutes, twice per working day)

Run once first thing in the morning and once mid-afternoon. The afternoon pass catches anything filed during the day.

### Step 1 — Sign In and Switch to the Ticket Module

1. Open the CRM, sign in as Super Admin.
2. Open the sidebar and navigate to any `/crm/tickets/*` page — the sidebar should re-skin into the **Ticket Module** layout (different icons, ticket-specific items).

`[SCREENSHOT: Sidebar re-skinned for the Ticket Module]`

### Step 2 — Glance the Ticket Dashboard

1. Open **Ticket Dashboard** (`/crm/tickets/dashboard`).
2. Read the five summary cards:
   - **Total** — all open + closed in the date range.
   - **Received** — pending HQ pickup. Aim to keep this number near zero by lunch.
   - **In Progress** — HQ is actively working. Long-sitting items here need a nudge or a stale-ticket reminder.
   - **Complete** — closed. Use these as positive feedback.
   - **Rejected** — closed with reason; verify each rejection had a useful explanation for the branch.
3. The weekly chart should show steady inflow; sudden spikes (especially Marketing or Inventory) usually mean a campaign launched.

`[SCREENSHOT: Ticket dashboard cards + weekly chart]`

### Step 3 — Process the Received Column

1. Open **Ticket Kanban** (`/crm/tickets/kanban`).
2. Work top-to-bottom through the **Received** column.
3. For each ticket:
   - Click the card → read the detail page in full (every field, attachments, comments).
   - If valid: change status to **In Progress** AND assign to the right TKT User (`/crm/tkt-users` lists who handles what).
   - If incomplete/wrong: comment back asking for the missing info — leave it in Received with a comment, **don't reject yet** (give them a chance to amend).
   - If genuinely impossible to action (duplicate, wrong platform, etc.): change to **Rejected** with a one-paragraph reason.
4. Drag is supported but the safer path is the **Status** dropdown on the ticket detail page — that triggers the assigned user's notification.

`[SCREENSHOT: Ticket Kanban with one card mid-drag from Received to In Progress]`

### Step 4 — Quick-pass the In Progress Column

1. Same kanban, **In Progress** column.
2. For each ticket older than its SLA threshold (default 48h):
   - Comment a nudge to the assigned TKT User asking for an update.
   - If the ticket has been silent for 7+ days, change status to **Rejected** with reason "Stale — please resubmit if still needed" so the branch knows it didn't disappear silently.

### Step 5 — Sample-check Complete and Rejected (Today only)

1. Filter the **My Tickets** list to **Today** + **Complete**.
2. Open 2–3 random tickets and confirm:
   - The status timeline ends with a comment from HQ explaining what was done.
   - Any attachment provided by the branch was actioned.
3. Same for **Rejected** — confirm the reason is clear and actionable, not just "no".

### Step 6 — Notifications Clear

1. Click the bell.
2. Look for entries of type `AUTOMATION_FAILED` (lead-side), `STUCK_LEAD`, or ticket-related comments addressed to you specifically.
3. Mark all read once reviewed.

---

## Weekly — Platform & User Hygiene (≤ 30 minutes, every Monday)

### Step 7 — Platform Sub-type Health Check

1. Open **TKT Platforms** (`/crm/tkt-platforms`).
2. For each platform, expand the **Sub-types** list:
   - **Aone** — Freeze Student, Archive Student, Extend, Delete Invoice, Login Issue, Others.
   - **Online** — Class Materials, Tech Issue, Others.
   - **Marketing** — Campaign Request, Asset Request, Reporting, Others.
   - **Inventory** — Reorder, Damage / Loss, Others.
   - **Finance** — Refund, Invoice Correction, Others.
3. Confirm each platform has at least one active sub-type. Disabled sub-types should be greyed out, not invisible.

`[SCREENSHOT: TKT Platforms list with sub-types expanded for Aone]`

### Step 8 — TKT Users Roster

1. Open **TKT Users** (`/crm/tkt-users`).
2. For each platform, confirm there's at least one `platform_admin` who is **actively working** (not on leave / not deactivated).
3. If a `platform_admin` is going on leave, reassign their open tickets first OR demote them to `user` so the assignment dropdown skips them.

### Step 9 — Branch Mirror Check

1. Open **TKT Branches** (`/crm/tkt-branches`).
2. Cross-reference with the list at `/crm/settings/branches`.
3. Every active lead branch should have a corresponding `tkt_branch`. If a lead branch lacks one (e.g. the "NN" prefix wasn't present at creation), add it manually.

### Step 10 — Stale Ticket Alert Review

1. The `staleTicketWorker` runs hourly and surfaces tickets that have been **Received** for over the configured threshold (default 48h).
2. Notifications fire to the platform admin AND to platform admins of that platform.
3. Once a week, browse `/crm/tickets` filtered by **Received** + **Created > 48h ago** — there should be zero. If any remain, escalate.

---

## Monthly — Analytics & Review (≤ 1 hour, first working day of the month)

### Step 11 — Pull Per-Platform Volume

1. **Ticket Dashboard** → set range to **Last 30 Days**.
2. Note the count split by platform (Aone vs Online vs Marketing vs others).
3. Identify the top-3 sub-types by volume — if one keeps spiking, there's a recurring operational problem to fix at source.

### Step 12 — Rejected Reason Analysis

1. Filter **My Tickets** to **Rejected** + **Last 30 Days**.
2. Open the top 10 by frequency of reason text.
3. Bucket the reasons:
   - "Missing student name" / "Missing date" → BM training opportunity.
   - "Duplicate" → BMs should search first; consider exposing recent tickets in the new-ticket form.
   - "Wrong platform" → platform/sub-type taxonomy is unclear; clarify in the form's helper text.

### Step 13 — Workflow / Email Cadence Review

1. The `ticketEmailWorker` sends Resend emails on ticket status changes.
2. Review the last 30 days of email logs (look in the worker output) for bounces / suppressions.
3. Audit Log spot-check for any unexpected ticket actions (e.g. ticket deleted by an unexpected user).

### Step 14 — Cross-Module Sanity Check

1. Spot-check the lead-side dashboard to confirm a sample of CT (Confirmed for Trial) leads also has matching ticket activity if relevant (e.g. for branches that file inventory tickets to prep for trial-day stock).
2. Loose correlation only — not every CT triggers a ticket, but a Marketing-heavy branch should be filing campaign-request tickets steadily.

---

## As-Needed — One-Off Procedures

### Adding a new Platform

1. Open **TKT Platforms** (`/crm/tkt-platforms`) → **+ New Platform**.
2. Fill the platform name, slug, and default SLA hours.
3. Add the initial sub-types (start with at least "Others" + 1–2 specifics).
4. Assign at least one `platform_admin` via **TKT Users** so new tickets have someone to land on.
5. Brief the BM team that the new option is available — they don't get an automatic notification.

`[SCREENSHOT: New Platform form filled in]`

### Adding a new Sub-type

1. **TKT Platforms** → click into the platform → **+ Add Sub-type**.
2. Sub-type fields drive the **dynamic fields** on the new-ticket form (e.g. "Freeze Student" asks for Student Name, Start Date, End Date). Defining these is a developer task — coordinate with engineering.

### Onboarding a new TKT User

1. Open **TKT Users** (`/crm/tkt-users`) → **+ New User**.
2. Pick the underlying CRM user (must already exist in `/crm/settings/team`).
3. Assign role: `platform_admin` (handles tickets for one or more specific platforms) or `super_admin` (sees all).
4. Multi-platform assignment is supported — one user can be platform admin for both Aone and Online, for example.

### Reassigning a ticket

1. Open the ticket detail page.
2. Click the **Assignee** field → pick a different TKT User from the dropdown (filtered to those who have authority over this platform).
3. Add a comment explaining the reassignment so the original assignee knows.

### Bulk-closing duplicate tickets

The kanban supports drag-only single-card actions. For bulk close:

1. Open the **My Tickets** list.
2. Tick the per-row checkbox on each duplicate.
3. Use the bulk-action bar at the top → **Set status: Rejected** → fill reason "Duplicate of #EBT-XX-####".

`[SCREENSHOT: Bulk-action bar after selecting multiple tickets]`

### Investigating a "ticket disappeared" report from a BM

1. Search **My Tickets** by ticket number — try with and without the `EBT-` prefix.
2. If found, confirm `branchId` matches the reporting branch — if it doesn't, that's a CRITICAL data-leak case.
3. If not found, check `/crm/settings/audit-log` for a DELETE on `crm_ticket` matching the number. Tickets are normally soft-deleted; hard-delete is unusual.

### Recovering from a worker outage

If the ticket-email or stale-ticket worker stops:

1. Check Redis connectivity. The BullMQ workers degrade gracefully when Redis is unreachable — they're disabled, not crashed.
2. Check the container logs for the worker process — look for `[ticketEmailWorker]` / `[staleTicketWorker]` lines.
3. Restart with `docker compose restart worker` (or the equivalent for your deploy).
4. Verify catch-up by submitting a test ticket through a Login-As BM session and confirming the email + notification fire within 30s.

---

# Part 2 — Guidelines (Full Feature Reference)

---

## G1. Sidebar Modes

The CRM sidebar **re-skins** between Lead and Ticket modules. The first time you navigate to any `/crm/tkt-*` or `/crm/tickets/*` page, the sidebar switches to ticket items (Ticket Dashboard, My Tickets, Ticket Kanban, TKT Platforms, TKT Branches, TKT Users, New Ticket).

Returning to a `/crm/*` (non-ticket) page swaps the sidebar back.

`[SCREENSHOT: Sidebar in lead mode vs ticket mode side by side]`

---

## G2. Ticket Dashboard (`/crm/tickets/dashboard`)

**Cards:** Total, Received, In Progress, Complete, Rejected.
**Chart:** weekly inflow by status.
**Date chips:** Today / Yesterday / Last 7 Days / This Month.

Super Admin sees aggregate across all branches; switching to a specific branch via the topbar narrows the data.

---

## G3. My Tickets list (`/crm/tickets`)

**Columns:** Ticket #, Platform, Branch, Sub-type, Status, Submitter, Assignee, Created, Updated.

**Filters:** Platform, Status, Date range, Assignee, Branch (Super Admin only). Pagination at the bottom.

**Search:** ticket number, submitter name, student name (if the sub-type includes one).

**Bulk operations:** select multiple → set status / reassign / add comment.

---

## G4. Ticket Kanban (`/crm/tickets/kanban`)

Four columns: **Received** → **In Progress** → **Complete** / **Rejected**.

Drag a card to change status. The drop confirms with a modal asking for an optional comment. **Reject** always requires a reason.

Status changes write a timeline event and fire a notification to the submitter.

---

## G5. Ticket Detail (`/crm/tickets/[id]`)

**Sections from top to bottom:**

1. **Header** — ticket number, platform/sub-type, current status, branch, submitter, assignee, created/updated timestamps.
2. **Status timeline** — every status change with actor + timestamp + comment.
3. **Dynamic fields** — depends on the sub-type (e.g. Freeze Student has Student Name, Start Date, End Date, Reason).
4. **Attachments** — uploaded by submitter or assignee. Pre-signed URLs for download.
5. **Comments** — threaded conversation between branch and HQ.

Actions available to a Super Admin:

- Change status (top-right dropdown).
- Reassign (Assignee dropdown).
- Add comment (always available).
- Upload attachment (HQ-side, e.g. completed proof).
- Hard-delete (use the Settings → Audit Log path — not exposed in the UI by default).

---

## G6. TKT Platforms (`/crm/tkt-platforms`)

The catalogue of platforms and their sub-types. Each sub-type defines:

- Display name (what the BM sees).
- Internal slug (used in the dynamic-fields engine).
- Required fields (defined in code).
- SLA hours (overrides the platform default if set).

Adding a sub-type's **fields** is a code change — talk to engineering.

---

## G7. TKT Branches (`/crm/tkt-branches`)

Mirrors `/crm/settings/branches` for the ticket module. Each row has:

- Branch name + code + `branch_number` (the "NN" prefix).
- Active / disabled flag.

Adding a new lead branch usually creates the tkt_branch automatically — but the auto-create requires the branch name to start with two digits (e.g. `07 Ebright (Ampang)`) AND a code to be supplied. Otherwise, create manually here.

---

## G8. TKT Users (`/crm/tkt-users`)

Per-user assignment of ticket-module roles:

- `super_admin` (ticket-module sense) — sees all tickets, can change any status, can reassign anyone.
- `platform_admin` — sees + handles tickets for the specific platform(s) they're linked to.
- `user` — submit-only; this is what BMs implicitly are.

A user can be a CRM `BRANCH_MANAGER` AND a TKT `platform_admin` simultaneously — the roles are orthogonal.

---

## G9. Notifications (`/crm/notifications`)

Shared inbox with the Lead module. Ticket events that produce a notification:

- **Ticket assigned to you** — fires to the new assignee.
- **Status change** — fires to the submitter (and CC's branch manager if configured).
- **New comment on a ticket where you're a participant** — fires to all participants except the comment author.
- **Stale ticket warning** — fires hourly to platform admins from the `staleTicketWorker`.

Browser push is supported — click **Enable Push** on the notifications page.

---

## G10. Audit Log (Ticket entries)

`/crm/settings/audit-log` (shared with the lead module). Filter `entity = crm_ticket` or `tkt_*` to see ticket-related changes only. Every CREATE / UPDATE / DELETE on the ticket tables is logged.

---

# Reporting Bugs & Issues

Same template as the Lead SOP, but for ticket-module bugs **also include**:

- The ticket number(s) involved.
- The platform and sub-type.
- The assignee (if any) and submitter.
- Whether email notifications fired.

### Severity guide (Super Admin escalation)

| Severity | Examples |
|---|---|
| **Critical** — page engineering immediately | Cross-branch ticket leak. Assignee dropdown lets you assign across platforms incorrectly. Email worker delivering tickets to the wrong recipient. Status timeline shows changes from a user who shouldn't have access. |
| **High** | Stale-ticket worker not firing. New-ticket form rejects valid submissions. Sub-type dynamic fields not saving. |
| **Medium** | UI regression on the kanban. Slow ticket-list load. Confusing sub-type wording. |
| **Low** | Typos in helper text. Spacing in the timeline. |

---

# Related SOPs

| ROLE | LINK |
|---|---|
| SUPER ADMIN — Lead module | `docs/SOP-SUPERADMIN-CRM-LEAD.md` |
| **SUPER ADMIN — Ticket module** | **This document** — `docs/SOP-SUPERADMIN-CRM-TICKET.md` |
| AGENCY ADMIN USE | _<HQ to fill in once the Agency Admin SOP is published>_ |
| BRANCH MANAGER USE | `docs/SOP-BRANCH-BETA-TESTER.md` |

> When published to the internal docs site, replace the placeholders above with the live URLs.

---

**End of SOP.**
