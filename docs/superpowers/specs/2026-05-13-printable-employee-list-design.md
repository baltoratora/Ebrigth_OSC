# Printable Employee List — Design Spec

**Date:** 2026-05-13
**Author:** Dina (od@ebright.my)
**Status:** Approved (awaiting implementation plan)

## 1. Summary

Add a "Print List" feature to the HR Employee Management dashboard ([app/dashboard-employee-management/page.tsx](../../../app/dashboard-employee-management/page.tsx)) that produces a clean, printable view of `BranchStaff` records with four columns: **Name**, **Branch**, **Status**, **Role**. The user can choose between printing the currently filtered view or all employees. The printout is rendered as a dedicated client route that auto-triggers `window.print()`, letting the browser handle PDF export natively.

## 2. Motivation

HR/admin staff need a paper or PDF copy of the employee roster — for HR meetings, payroll handover, branch audits, etc. Today there is no way to print the dashboard cleanly: the live table is too wide, has dropdowns/action buttons, and isn't optimized for paper. A dedicated print route gives a clean roster without disturbing the interactive dashboard.

## 3. Scope

**In scope:**
- New client route `/dashboard-employee-management/print` that renders a printable employee list.
- A "Print List" button on the dashboard that opens a small modal: "Print current view" vs "Print all employees".
- URL-driven filter state so the print route mirrors the dashboard's current filters (when "current view" is chosen).
- Branch-grouped layout, sorted by branch order (per `BRANCH_OPTIONS`) then by name A–Z.
- Existing role-based permissions (via `/api/employees`) apply unchanged — Academy users see the stripped-down payload.

**Out of scope:**
- CSV / Excel / server-side PDF export.
- Custom column selection or saved print presets.
- Pagination controls on the print page (the list is small enough to flow naturally across pages).
- Changes to the underlying `/api/employees` endpoint or `BranchStaff` schema.

## 4. Data Source

The new print route fetches `/api/employees` — the same endpoint the live `EmployeeTable` uses. No backend changes. The endpoint already:
- Enforces session + role checks.
- Scopes branch visibility (HR/admin see all branches; branch-scoped roles see their own).
- Returns a stripped payload for Academy users.

Fields consumed for the printout:
- `fullName` → **Name** column
- `branch` → **Branch** column (display via `getBranchLabel`)
- `Emp_Status` → **Status** column
- `role` → **Role** column (display via `getRoleLabel`)

## 5. Route — `/dashboard-employee-management/print`

New file: [app/dashboard-employee-management/print/page.tsx](../../../app/dashboard-employee-management/print/page.tsx)

**Type:** Client component (`"use client"`).

**URL query params (all optional):**
- `all=1` — ignore other filters, print every employee the caller is permitted to see.
- `branch=<code>` — filter to one branch.
- `role=<code>` — filter to one role.
- `status=<value>` — filter to one status.
- `search=<term>` — case-insensitive substring match against name.

When `all=1` is present, the other filter params are ignored.

**Lifecycle:**
1. On mount: read query params, fetch `/api/employees`.
2. Apply filters in-memory using the same logic as `EmployeeTable` (search, branch, role, status).
3. Sort: by `BRANCH_OPTIONS` index (so branches appear in canonical order), then name A–Z within each branch.
4. Group rows by branch for rendering.
5. Once data has rendered, call `window.print()` from a `useEffect` so the browser print dialog opens automatically. Guard against firing while still loading.

**Page layout (visible on screen and on paper):**
- Header block:
  - Title: **Ebright — Employee List**
  - Sub-line: **Generated: {today's date in YYYY-MM-DD}**
  - Filter summary (if filtered): `Filters: Branch = X, Role = Y, Status = Z, Search = "Q"`. Omit unset filters. If `all=1`, show `All employees`.
  - Total count: `Total: N employees`
- For each branch (in canonical order):
  - A branch sub-header row with the branch label and the count for that branch.
  - A table with columns **Name | Branch | Status | Role** for that branch's employees.
- Footer (on every printed page via `@media print` + `position: running`, or simply at the end): page numbers handled by the browser's native print chrome.

**Empty states:**
- Zero employees match → show "No employees match these filters." with a "Close window" link. Do **not** auto-trigger print.
- API error → show "Failed to load employees. Close this tab and try again." Do not auto-trigger print.

## 6. Print Stylesheet

Print-specific CSS lives co-located in the page (Tailwind `print:` utilities + a small `<style jsx global>` block for `@page` and `break-inside`).

Key rules:
- `@page { margin: 1.5cm; }` — sensible default margins; rely on the browser's print chrome for orientation and paper size.
- `thead { display: table-header-group; }` — repeat column headers on every printed page.
- `tr, .branch-group { break-inside: avoid; }` — try to keep each row whole and avoid splitting tiny branches; large branches will still flow naturally.
- Hide nothing else: the print route is already designed to be paper-clean (no sidebar, no header, no dashboard nav).

## 7. Dashboard Trigger — "Print List" Button

Modify [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx) (not the dashboard page).

**Why inside `EmployeeTable`:** the four filter values (`searchTerm`, `branchFilter`, `roleFilter`, `statusFilter`) already live there as state. Putting the button there avoids lifting state into the parent page.

**UI:**
- A "Print List" button placed above the table next to the filters/search row (or wherever fits the existing layout best — implementation detail).
- Hidden for Academy role using the existing `isAcademy(userRole)` check (matching the "+ Add User" pattern).

**Click handler:** opens a small modal (plain Tailwind, in line with existing modals in the file) with two options:
1. **Print current view** — builds the URL from current filter state. Only includes params whose value is set (not "all" / not empty). Example: `/dashboard-employee-management/print?branch=cheras&status=Active&search=ali`. Opens in a new tab via `window.open(url, "_blank")`.
2. **Print all employees** — opens `/dashboard-employee-management/print?all=1` in a new tab.
3. Cancel.

Opening in a new tab is deliberate so the user's filter state and scroll position on the dashboard are preserved.

## 8. Permissions

No new permission logic. The print route is a client component that calls `/api/employees`, which:
- Requires an authenticated session.
- Already restricts branch visibility based on role.
- Already returns the stripped Academy payload when the caller is Academy.

The "Print List" button is hidden for Academy users (matching "+ Add User"). The route itself is still accessible to other roles directly via URL if they have a session.

## 9. Files Touched

**New:**
- `app/dashboard-employee-management/print/page.tsx`

**Modified:**
- `app/components/EmployeeTable.tsx` — add the "Print List" button + modal.

**Not touched:**
- `app/dashboard-employee-management/page.tsx` — unchanged.
- `app/api/employees/route.ts` — unchanged.
- `prisma/schema.prisma` — unchanged.

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `window.print()` fires before data renders | `useEffect` gates the call on `!loading && employees.length > 0`. |
| Large rosters create huge printouts | Accepted — current `BranchStaff` count is small enough that natural pagination is fine. |
| Browser print dialog differences | Rely on the browser's native print chrome rather than custom controls. Tested on Chrome (the user's environment). |
| Filter state on dashboard goes stale if user navigates back | Print opens in a new tab; dashboard tab is untouched. |

## 11. Verification

- Open dashboard as super admin → "Print List" button visible.
- Filter by Branch = Cheras → click "Print List" → "Print current view" → new tab shows only Cheras staff, browser print dialog opens.
- Same dashboard → "Print all employees" → new tab shows every employee grouped by branch.
- Log in as Academy user → "Print List" button is hidden.
- Direct-navigate to `/dashboard-employee-management/print?all=1` as Academy → only Academy-permitted fields are present in the underlying network response (verified via DevTools).
- Print preview: column headers repeat on each page; no row is awkwardly split across a page boundary where avoidable.
