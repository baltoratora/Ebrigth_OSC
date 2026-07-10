# Academy Role & Training Flag — Design

**Date:** 2026-04-30
**Author:** Dina (with Claude)
**Status:** Approved, ready for implementation plan

## Summary

Add a new `ACADEMY` user role with narrow, edit-only access to coach training periods, and surface a "currently in training" flag on every coach name in the HRMS and manpower-schedule UIs. The flag is a visibility signal for Branch Managers picking weekly manpower — they need to know which coaches are mid-training when assigning shifts.

## Goals

1. The `academy@gmail.com` login can sign in, lands on the home dashboard, and only sees the **HRMS → Employee Dashboard** card unlocked (everything else greyed out).
2. Inside Employee Dashboard, Academy sees only **FT-Coach** and **PT-Coach** rows; admin/management roles and other employee types are hidden.
3. For each coach, Academy sees only this narrow set of fields: **Full Name, Phone Number, Role, Branch/Dept, Contract, Status (Active/Inactive), Start Date, Training Start Date, Training End Date**. All other fields (NRIC, DOB, home address, email, gender, nickname, bank, emergency contact, university, rate, hire date, signed date, employment type, biometrics, access status, employee ID) are hidden from Academy.
4. Academy can edit **only** the training start date and training end date on a coach's record. The other visible fields are read-only.
5. Super Admin and Admin can also edit the training fields (alongside everything else they already edit). HR does not get this power in v1.
6. A coach whose `today` falls between `trainingStartDate` and `trainingEndDate` gets a `🎓` badge next to their name everywhere a coach name renders — Employee Dashboard table, manpower-schedule planner, manpower-schedule update view.

## Non-Goals

- Consolidating the `Employee` ↔ `BranchStaff` tables. Out of scope; separate cleanup project.
- Training history (multiple training periods per coach, audit log of past trainings). v1 stores only the current period; updating overwrites.
- Per-branch / per-day training assignments. The flag is "in training somewhere" — no tracking which branch a coach trains at on which day.
- Auto-flipping a coach's role when training ends. Training is a flag derived from dates, not a role swap.
- Academy access to other modules (CRM, SMS, Inventory, Manpower Planning, Attendance, Claims, Onboarding/Offboarding).
- Academy ability to create or delete employees.
- HR access to the training fields in v1.

## Architecture

### Data model

Two new nullable columns on `BranchStaff` ([prisma/schema.prisma](../../../prisma/schema.prisma)):

```prisma
model BranchStaff {
  // ... existing fields ...
  trainingStartDate  String?   // YYYY-MM-DD
  trainingEndDate    String?   // YYYY-MM-DD
}
```

Both fields are `String?` to match the existing date convention on this table (`start_date`, `endDate`, `probation`, `dob` are all `String?`). No `isInTraining` boolean column — it is derived from the dates so the flag and the dates cannot drift.

The `Employee` table is untouched. It is still used by the Manpower Cost Report ([app/api/manpower-cost/route.ts:140](../../../app/api/manpower-cost/route.ts#L140), [:187](../../../app/api/manpower-cost/route.ts#L187)) and by [scripts/seed-test.ts:19](../../../scripts/seed-test.ts#L19), so deleting it would break those.

Migration: `prisma migrate dev --name add_training_dates`. Adds two nullable columns. Existing rows default to `null` = not in training. No data backfill.

### Computed flag — `lib/training.ts` (new file)

```ts
export function isInTraining(
  start?: string | null,
  end?: string | null,
  today: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const t = today.toISOString().slice(0, 10);  // YYYY-MM-DD
  return start <= t && t <= end;  // string compare works for ISO dates
}
```

Imported wherever a coach name renders. Single source of truth.

**Edge cases:**
- Only one date filled → returns `false`. Form can save partial state; badge does not appear until both are set.
- End date before start date → returns `false` (the comparison `start <= t && t <= end` fails). Form should also refuse to save this combination; server PUT validates the same.
- Coach role changes to non-coach while dates are set — badge still shows because the helper checks dates, not role. Rare enough to be acceptable; an admin can clear the dates if needed.
- Timezone — Malaysia operations are single-zone (UTC+8). Server time = local time. Documented assumption.

### Auth & roles

In [lib/roles.ts](../../../lib/roles.ts):

1. Add `ACADEMY: "ACADEMY"` to `ROLES`.
2. Add `ROLES.ACADEMY` to the `ROLE_VALUES` tuple.
3. Add aliases (`ACADEMY` → `ROLES.ACADEMY`) so `normalizeRole` accepts the value.
4. Add the predicate: `export const isAcademy = (raw: unknown) => hasRole(raw, [ROLES.ACADEMY]);`
5. Add a new grouping: `export const TRAINING_EDIT_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACADEMY];`

The `User` row already exists in the DB (`academy@gmail.com`, role `ACADEMY`, password hashed with bcrypt). NextAuth's existing [authorize()](../../../lib/nextauth.ts#L19-L39) reads role from the row with no changes needed.

`canSeeAllBranches(session)` in `lib/auth.ts` should return `true` for ACADEMY — the academy team is centralized and needs to see coaches from every branch. Update the helper to include ACADEMY.

### UI changes

**3a. Employee edit form ([app/components/UserManagement.tsx](../../../app/components/UserManagement.tsx))**

For Admin / Super Admin / HR (existing behavior preserved):
- New "Training" section between "Employment" and "Emergency Contact". Two date inputs: `Training Start Date`, `Training End Date`.
- A `🎓 In Training` badge next to the existing `✓ Authorized` badge in the panel header when `isInTraining()` is true for the selected user.

For Academy users (`isAcademy(userRole) === true`):
- The "Personal Info", "Emergency Contact", and "Bank Details" sections are **hidden entirely** — not just disabled.
- The "Employment" section is reduced to **read-only display** of: Full Name, Phone, Role, Branch/Dept, Contract, Status, Start Date. All other employment fields (probation, end date, rate, hire date, signed date, employment type, employee status access, biometrics, employee ID, etc.) are hidden.
- The "Training" section is the only **editable** section.
- The Edit button still enters edit mode, but the form only renders the narrow read-only block + the editable training inputs. Save still calls `PUT /api/employees` with only training fields in the payload.
- The user list on the left auto-filters to `role IN ("FT - Coach", "PT - Coach")`. Branch dropdown still works for narrowing.
- Form-level validation: if both training dates are filled, end must be ≥ start. Save button disabled / inline error if not.

**3b. Employee Dashboard table ([app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx))**

For Admin / Super Admin / HR (existing behavior preserved):
- New column "Training" between "Probation" and "Status".
- Empty cell if no training dates.
- `🎓 2026-05-01 → 2026-06-30` rendered as a small badge: green if currently in window, gray if past, blue if future.

For Academy users:
- The table renders only these columns, in this order: **Full Name, Phone, Role, Branch/Dept, Contract, Start Date, Status, Training, Manage**. All other columns (Employee ID, Gender, Nick Name, NRIC, DOB, Home Address, Probation, Biometrics, Access) are hidden.
- The Manage column links to the same `/user-management?employeeId=…` URL; the narrowed Academy edit form (3a) takes over from there.
- Same FT/PT-only client filter as the user list. The status filter dropdown still works (All / Active / Inactive). Branch filter dropdown still works.

**3c. Manpower-schedule planner ([app/manpower-schedule/plan-new-week/page.tsx](../../../app/manpower-schedule/plan-new-week/page.tsx), [update/page.tsx](../../../app/manpower-schedule/update/page.tsx), [archive/page.tsx](../../../app/manpower-schedule/archive/page.tsx))**

- Wherever a coach name is rendered (table cells around lines 53, 173, 176 in plan-new-week, plus equivalents in update/archive), append a small `🎓` icon next to the name when `isInTraining(s.trainingStartDate, s.trainingEndDate)` is true for that staff row.
- Hover tooltip: `In training: <start> → <end>`.
- No new data fetching. The pages already fetch from `/api/branch-staff?include=all`; we just expose the two new fields on that endpoint and the badge renders from local data.

**3d. Hub gating ([app/components/DashboardDetail.tsx](../../../app/components/DashboardDetail.tsx))**

Extend the existing HR pattern at [DashboardDetail.tsx:122-123](../../../app/components/DashboardDetail.tsx#L122-L123):

```ts
const userIsAcademy = isAcademy(session?.user?.role);
const isItemEnabled = (href: string) =>
  !((userIsHR || userIsAcademy) && id === "hrms" && href !== "/dashboard-employee-management");
```

For the home grid ([app/components/DashboardHome.tsx](../../../app/components/DashboardHome.tsx)): Academy should see all dashboards greyed out except HRMS, mirroring how branch managers are restricted today. Extend the disabled check.

### API & access control

**`GET /api/employees`** — inside the existing handler ([app/api/employees/route.ts:45-82](../../../app/api/employees/route.ts#L45-L82)):

```ts
if (isAcademy(session.user.role)) {
  where.role = { in: ["FT - Coach", "PT - Coach"] };  // server-side row filter
}
```

If a client-supplied `role` filter conflicts, the Academy filter wins (intersection). Branch scoping for Academy: `canSeeAllBranches(session)` returns `true`, so the existing `if (!canSeeAllBranches(session))` block is skipped.

**Field-level redaction for Academy.** Sensitive employee fields (NRIC, DOB, home address, bank details, emergency contact, university, gender, nickname, employee ID, biometrics, access status, probation, end date, rate, hire date, signed date, employment type, email) must not leak over the wire to Academy even though the UI also hides them. Add a parallel mapper `toEmployeeForAcademy(s)` that returns only the allowed fields:

```ts
function toEmployeeForAcademy(s: Record<string, unknown>) {
  return {
    id: String(s.id),
    fullName: (s.name as string) || '',
    phone: (s.phone as string) || '',
    branch: (s.branch as string) || '',
    role: (s.role as string) || '',
    contract: (s.contract as string) || '',
    startDate: (s.start_date as string) || '',
    Emp_Status: (s.status as string) || '',
    trainingStartDate: (s.trainingStartDate as string) || '',
    trainingEndDate: (s.trainingEndDate as string) || '',
  };
}
```

The GET handler picks the mapper based on role:

```ts
const mapper = isAcademy(session.user.role) ? toEmployeeForAcademy : toEmployee;
let results = staff.map(mapper);
```

The search filter (`fullName` / `email` / `employeeId`) needs adjustment for Academy — only `fullName` is searchable since email and employeeId are not in the response.

**`PUT /api/employees`** — replace the single `requireRole(ADMIN_ROLES)` gate with a dual-role check:

```ts
const role = session.user.role;
const isAdminEdit = isAdmin(role);
const isAcademyEdit = isAcademy(role);
if (!isAdminEdit && !isAcademyEdit) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

if (isAcademyEdit) {
  // Body may only contain id + the two training fields.
  const allowedKeys = new Set(["id", "trainingStartDate", "trainingEndDate"]);
  const extraKeys = Object.keys(body).filter(k => !allowedKeys.has(k));
  if (extraKeys.length > 0) {
    return NextResponse.json(
      { error: `Academy cannot edit: ${extraKeys.join(", ")}` },
      { status: 403 },
    );
  }
  // Target row must be a coach.
  const target = await prisma.branchStaff.findUnique({
    where: { id: parseInt(id) },
    select: { role: true },
  });
  if (!target || !["FT - Coach", "PT - Coach"].includes(target.role || "")) {
    return NextResponse.json({ error: "Academy can only edit coaches" }, { status: 403 });
  }
}

// Server-side validation: end ≥ start when both supplied
if (trainingStartDate && trainingEndDate && trainingStartDate > trainingEndDate) {
  return NextResponse.json(
    { error: "Training end date must be on or after start date" },
    { status: 400 },
  );
}
```

The existing `assertSameBranch` checks remain for Admin edits. For Academy, branch scoping is bypassed (Academy has cross-branch authority).

**`POST` and `DELETE /api/employees`** — unchanged; still `ADMIN_ROLES` only. Academy cannot create or delete employees.

**`GET /api/branch-staff`** — add `trainingStartDate` and `trainingEndDate` to the SELECT/serialization. No Academy-specific filter here because Academy does not access manpower-schedule routes; the badge in the planner is just a passive visibility signal.

**Mappers** — add `trainingStartDate` and `trainingEndDate` to `toEmployee()` in [app/api/employees/route.ts:8-43](../../../app/api/employees/route.ts#L8-L43) and to whatever serializer `/api/branch-staff` uses.

### Middleware / route protection

Verify [middleware.ts](../../../middleware.ts) (if present): Academy attempting to navigate directly to `/manpower-schedule`, `/crm`, `/attendance`, etc. should be redirected to `/home` or `/dashboards/hrms`. The hub gates handle this for clicks; middleware handles direct URL navigation.

## File-by-file change list

| File | Change |
| --- | --- |
| [prisma/schema.prisma](../../../prisma/schema.prisma) | Add `trainingStartDate String?` and `trainingEndDate String?` to `BranchStaff` |
| [lib/roles.ts](../../../lib/roles.ts) | Add `ACADEMY` to `ROLES`, `ROLE_VALUES`, alias map; add `isAcademy` predicate; add `TRAINING_EDIT_ROLES` |
| [lib/auth.ts](../../../lib/auth.ts) | Update `canSeeAllBranches` to include ACADEMY |
| `lib/training.ts` | NEW — `isInTraining()` helper |
| [app/api/employees/route.ts](../../../app/api/employees/route.ts) | Add fields to `toEmployee`; Academy filter on GET; dual-role gate + field allowlist + date validation on PUT |
| `app/api/branch-staff/route.ts` | Expose `trainingStartDate`/`trainingEndDate` |
| [app/components/UserManagement.tsx](../../../app/components/UserManagement.tsx) | New Training section in edit form; for Academy: hide Personal/Emergency/Bank sections entirely, narrow Employment to 7 read-only fields, only Training editable; FT/PT-only client filter |
| [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx) | New "Training" column for all roles; for Academy: render only the 9 narrow columns (Full Name, Phone, Role, Branch/Dept, Contract, Start Date, Status, Training, Manage); FT/PT-only filter |
| [app/components/DashboardDetail.tsx](../../../app/components/DashboardDetail.tsx) | Extend `isItemEnabled` to lock all non-Employee-Dashboard cards for Academy |
| [app/components/DashboardHome.tsx](../../../app/components/DashboardHome.tsx) | Lock all non-HRMS dashboards for Academy |
| [app/manpower-schedule/plan-new-week/page.tsx](../../../app/manpower-schedule/plan-new-week/page.tsx) | Render `🎓` badge next to coach names in training |
| [app/manpower-schedule/update/page.tsx](../../../app/manpower-schedule/update/page.tsx) | Same |
| [app/manpower-schedule/archive/page.tsx](../../../app/manpower-schedule/archive/page.tsx) | Same |
| [middleware.ts](../../../middleware.ts) | Verify/add Academy route restrictions |

## Testing plan

- Log in as `academy@gmail.com`. Confirm: home shows HRMS unlocked + everything else greyed out; HRMS hub shows Employee Dashboard unlocked + everything else greyed out.
- Inside Employee Dashboard as Academy: list contains only FT/PT coaches across all branches; admins/HOD/BM rows do not appear. Table renders only the 9 narrow columns; NRIC, DOB, home address, biometrics, access status, employee ID, gender, and nickname columns do not appear.
- Open a coach record as Academy: Personal Info / Emergency Contact / Bank Details sections do not render. Employment section shows only Full Name, Phone, Role, Branch/Dept, Contract, Status, Start Date — all read-only. Only Training section is editable; setting start + end and saving works.
- As Academy, inspect `GET /api/employees` response in browser devtools — verify rows contain only the 10 allowed keys (`id`, `fullName`, `phone`, `branch`, `role`, `contract`, `startDate`, `Emp_Status`, `trainingStartDate`, `trainingEndDate`). NRIC / DOB / bank / email / etc. must not appear in the JSON.
- As Academy, attempt to PUT `{id, fullName: "X"}` directly via curl/devtools — server returns 403.
- As Academy, attempt to PUT a training date for a non-coach (set role to BM in DB and try) — server returns 403.
- As Admin, set training dates on a coach. Open manpower-schedule plan-new-week — coach name shows `🎓` badge during the window. After end date, badge disappears.
- Set end date before start date — form prevents save; if bypassed, server returns 400.
- Existing admin/HR/BM workflows unchanged — regression check.

## Open questions

None at design time. Implementation plan will resolve any small details (e.g., exact pixel-level styling of the badge, exact wording of error messages).
