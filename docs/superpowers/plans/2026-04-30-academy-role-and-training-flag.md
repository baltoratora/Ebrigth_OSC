# Academy Role & Training Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `ACADEMY` user role that can sign in to HRMS and edit `trainingStartDate` / `trainingEndDate` on FT-Coach and PT-Coach records (and nothing else), and surface a `🎓` "in training" badge next to coach names in the Employee Dashboard table and the manpower-schedule planner so Branch Managers can see who is mid-training when picking weekly manpower.

**Architecture:** Two new nullable `String?` columns on `BranchStaff`. New `ACADEMY` role + `isAcademy` predicate in [lib/roles.ts](../../../lib/roles.ts). New `lib/training.ts` `isInTraining(start, end, today?)` helper (single source of truth — derived flag, not a stored column). Server-side defense in depth: GET filters rows to FT/PT coaches and uses a parallel `toEmployeeForAcademy()` mapper that strips PII; PUT gates by role and enforces a 3-key allowlist (`id`, `trainingStartDate`, `trainingEndDate`) for Academy callers. UI hides everything outside the 9-field allowlist for Academy.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma 6, PostgreSQL, NextAuth (JWT strategy), Tailwind CSS, Vitest (unit tests).

---

## File Structure

**Files created:**
- `lib/training.ts` — `isInTraining()` helper
- `lib/__tests__/training.test.ts` — unit tests for `isInTraining`
- `lib/__tests__/roles.test.ts` — unit tests for `isAcademy` + `normalizeRole` Academy alias (only if file does not already exist; if it does, append)

**Files modified:**
- [prisma/schema.prisma](../../../prisma/schema.prisma) — add `trainingStartDate` and `trainingEndDate` columns to `BranchStaff`
- [lib/roles.ts](../../../lib/roles.ts) — add `ACADEMY` role, `isAcademy` predicate, `TRAINING_EDIT_ROLES` grouping
- [lib/auth.ts](../../../lib/auth.ts) — `canSeeAllBranches` returns `true` for ACADEMY
- [app/api/employees/route.ts](../../../app/api/employees/route.ts) — training fields in `toEmployee`, new `toEmployeeForAcademy`, GET row filter, PUT dual-role gate + allowlist + date validation
- [app/api/branch-staff/route.ts](../../../app/api/branch-staff/route.ts) — expose `trainingStartDate` / `trainingEndDate` on the GET response
- [middleware.ts](../../../middleware.ts) — allow ACADEMY into `/dashboard-employee-management` and `/user-management`; non-management/non-ACADEMY rules unchanged
- [app/components/DashboardHome.tsx](../../../app/components/DashboardHome.tsx) — lock all dashboards except HRMS for Academy
- [app/components/DashboardDetail.tsx](../../../app/components/DashboardDetail.tsx) — extend the existing HR gate to also lock all HRMS items except Employee Dashboard for Academy
- [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx) — new "Training" column for all roles, narrow 9-column view for Academy, FT/PT-only client filter
- [app/components/UserManagement.tsx](../../../app/components/UserManagement.tsx) — new "Training" section for Admin/SuperAdmin, narrow view-and-edit-only-training form for Academy, FT/PT-only client filter
- [app/manpower-schedule/plan-new-week/page.tsx](../../../app/manpower-schedule/plan-new-week/page.tsx) — `🎓` badge next to coach name in summary table and dropdown options
- [app/manpower-schedule/update/page.tsx](../../../app/manpower-schedule/update/page.tsx) — same
- [app/manpower-schedule/archive/page.tsx](../../../app/manpower-schedule/archive/page.tsx) — same

**Tasks ordered so each one leaves the tree green** (typecheck + existing tests pass). Run `npm run typecheck` after every task; run `npx vitest run` after lib changes.

---

## Task 1: Schema migration — add training columns to BranchStaff

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two columns**

In [prisma/schema.prisma](../../../prisma/schema.prisma), inside the `BranchStaff` model, add two new fields just before the closing brace (after the existing `updatedAt` field at line 88):

```prisma
model BranchStaff {
  // ... existing fields unchanged ...
  updatedAt          DateTime? @updatedAt
  trainingStartDate  String?
  trainingEndDate    String?

  @@map("BranchStaff")
}
```

Both are `String?` (nullable) to match the existing date convention (`start_date`, `endDate`, `probation`, `dob` are all `String?`).

- [ ] **Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_branchstaff_training_dates`

Expected output: `Database migration successful` and a new file at `prisma/migrations/<timestamp>_add_branchstaff_training_dates/migration.sql` containing:

```sql
ALTER TABLE "BranchStaff" ADD COLUMN "trainingStartDate" TEXT;
ALTER TABLE "BranchStaff" ADD COLUMN "trainingEndDate" TEXT;
```

If `prisma migrate dev` prompts about a shadow database / schema drift, abort and ask Dina before proceeding (her DB is shared and you should not reset).

- [ ] **Step 3: Verify Prisma client regenerated**

Run: `npx prisma generate`
Expected: `Generated Prisma Client (vX.Y.Z) to ./node_modules/@prisma/client`.

- [ ] **Step 4: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: clean (no errors). The new columns are visible to the Prisma client but no consumer references them yet.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add trainingStartDate and trainingEndDate to BranchStaff"
```

---

## Task 2: Add `ACADEMY` role and `isAcademy` predicate

**Files:**
- Modify: `lib/roles.ts`
- Create: `lib/__tests__/roles.test.ts` (if not present; otherwise append)

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/roles.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ALL_ROLES,
  ROLE_VALUES,
  TRAINING_EDIT_ROLES,
  normalizeRole,
  isAcademy,
  isAdmin,
  isHR,
} from '@/lib/roles';

describe('ACADEMY role', () => {
  it('appears in ROLES, ALL_ROLES, and ROLE_VALUES', () => {
    expect(ROLES.ACADEMY).toBe('ACADEMY');
    expect(ALL_ROLES).toContain('ACADEMY');
    expect(ROLE_VALUES).toContain('ACADEMY');
  });

  it('normalizes "ACADEMY", "academy", and "Academy" to ROLES.ACADEMY', () => {
    expect(normalizeRole('ACADEMY')).toBe(ROLES.ACADEMY);
    expect(normalizeRole('academy')).toBe(ROLES.ACADEMY);
    expect(normalizeRole('Academy')).toBe(ROLES.ACADEMY);
  });

  it('isAcademy returns true only for ACADEMY role', () => {
    expect(isAcademy('ACADEMY')).toBe(true);
    expect(isAcademy('academy')).toBe(true);
    expect(isAcademy('ADMIN')).toBe(false);
    expect(isAcademy('HR')).toBe(false);
    expect(isAcademy(null)).toBe(false);
    expect(isAcademy(undefined)).toBe(false);
    expect(isAcademy('')).toBe(false);
  });

  it('Academy is NOT considered admin or HR', () => {
    expect(isAdmin('ACADEMY')).toBe(false);
    expect(isHR('ACADEMY')).toBe(false);
  });
});

describe('TRAINING_EDIT_ROLES', () => {
  it('includes SUPER_ADMIN, ADMIN, ACADEMY only', () => {
    expect(TRAINING_EDIT_ROLES).toEqual([
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.ACADEMY,
    ]);
  });

  it('does NOT include HR', () => {
    expect(TRAINING_EDIT_ROLES).not.toContain(ROLES.HR);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/roles.test.ts`
Expected: FAIL with errors about `ROLES.ACADEMY`, `isAcademy`, and `TRAINING_EDIT_ROLES` being undefined / not exported.

- [ ] **Step 3: Update [lib/roles.ts](../../../lib/roles.ts) — add ACADEMY**

Add `ACADEMY` to `ROLES` (after `PART_TIME` at line 25):

```ts
export const ROLES = {
  SUPER_ADMIN:    "SUPER_ADMIN",
  ADMIN:          "ADMIN",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  HOD:            "HOD",
  HR:             "HR",
  EXECUTIVE:      "EXECUTIVE",
  INTERN:         "INTERN",
  FULL_TIME:      "Full_Time",
  PART_TIME:      "Part_Time",
  ACADEMY:        "ACADEMY",
} as const;
```

Add to `ROLE_VALUES`:

```ts
export const ROLE_VALUES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.BRANCH_MANAGER,
  ROLES.HOD,
  ROLES.HR,
  ROLES.EXECUTIVE,
  ROLES.INTERN,
  ROLES.FULL_TIME,
  ROLES.PART_TIME,
  ROLES.ACADEMY,
] as const;
```

Add aliases inside `normalizeRole` (the `aliases` map):

```ts
    PARTTIME:       ROLES.PART_TIME,
    ACADEMY:        ROLES.ACADEMY,
```

Add the predicate (after `isPartTime` near line 107):

```ts
export const isAcademy = (raw: unknown) => hasRole(raw, [ROLES.ACADEMY]);
```

Add the new grouping (after `EMPLOYEE_ROLES` near line 90):

```ts
export const TRAINING_EDIT_ROLES: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.ACADEMY,
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/roles.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/roles.ts lib/__tests__/roles.test.ts
git commit -m "feat(roles): add ACADEMY role, isAcademy predicate, TRAINING_EDIT_ROLES"
```

---

## Task 3: Create `lib/training.ts` with `isInTraining` helper

**Files:**
- Create: `lib/training.ts`
- Create: `lib/__tests__/training.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/training.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isInTraining } from '@/lib/training';

describe('isInTraining', () => {
  // Use a fixed reference date: 2026-05-15 (mid-May 2026)
  const today = new Date('2026-05-15T08:00:00.000Z');

  it('returns false when start is missing', () => {
    expect(isInTraining(undefined, '2026-06-30', today)).toBe(false);
    expect(isInTraining(null, '2026-06-30', today)).toBe(false);
    expect(isInTraining('', '2026-06-30', today)).toBe(false);
  });

  it('returns false when end is missing', () => {
    expect(isInTraining('2026-05-01', undefined, today)).toBe(false);
    expect(isInTraining('2026-05-01', null, today)).toBe(false);
    expect(isInTraining('2026-05-01', '', today)).toBe(false);
  });

  it('returns true when today is between start and end', () => {
    expect(isInTraining('2026-05-01', '2026-06-30', today)).toBe(true);
  });

  it('returns true when today equals start date (inclusive)', () => {
    expect(isInTraining('2026-05-15', '2026-06-30', today)).toBe(true);
  });

  it('returns true when today equals end date (inclusive)', () => {
    expect(isInTraining('2026-04-01', '2026-05-15', today)).toBe(true);
  });

  it('returns false when today is before start', () => {
    expect(isInTraining('2026-06-01', '2026-07-01', today)).toBe(false);
  });

  it('returns false when today is after end', () => {
    expect(isInTraining('2026-01-01', '2026-04-30', today)).toBe(false);
  });

  it('returns false when end is before start (invalid window)', () => {
    expect(isInTraining('2026-06-30', '2026-05-01', today)).toBe(false);
  });

  it('uses real `new Date()` when today arg is omitted', () => {
    // Pick dates that bracket "now" generously
    const start = '1900-01-01';
    const end = '2999-12-31';
    expect(isInTraining(start, end)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/training.test.ts`
Expected: FAIL — `Cannot find module '@/lib/training'`.

- [ ] **Step 3: Create the helper**

Create `lib/training.ts`:

```ts
// Computes whether a coach is currently in their training window.
// Single source of truth — there is no stored "in training" boolean on the
// BranchStaff row, so the flag and the dates cannot drift.
//
// Uses string comparison on YYYY-MM-DD because that is the format the form
// already submits and lexical order matches calendar order for ISO dates.
//
// Timezone: Malaysia operations are single-zone (UTC+8). Server time is
// treated as local time. If the system is ever multi-region, swap
// `toISOString()` for a Malaysia-pinned formatter.

export function isInTraining(
  start?: string | null,
  end?: string | null,
  today: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const t = today.toISOString().slice(0, 10);
  return start <= t && t <= end;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/training.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/training.ts lib/__tests__/training.test.ts
git commit -m "feat(training): add isInTraining helper with date-window logic"
```

---

## Task 4: Update `canSeeAllBranches` to include ACADEMY

**Files:**
- Modify: `lib/auth.ts:43-46`

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/roles.test.ts` (or create `lib/__tests__/auth.test.ts` if you prefer an isolated file — pick one and stick with it):

```ts
import { canSeeAllBranches } from '@/lib/auth';

describe('canSeeAllBranches', () => {
  const make = (role: string) => ({ user: { role, branchName: null } });

  it('returns true for SUPER_ADMIN, ADMIN, HOD, HR, ACADEMY', () => {
    expect(canSeeAllBranches(make('SUPER_ADMIN'))).toBe(true);
    expect(canSeeAllBranches(make('ADMIN'))).toBe(true);
    expect(canSeeAllBranches(make('HOD'))).toBe(true);
    expect(canSeeAllBranches(make('HR'))).toBe(true);
    expect(canSeeAllBranches(make('ACADEMY'))).toBe(true);
  });

  it('returns false for BRANCH_MANAGER and other employee roles', () => {
    expect(canSeeAllBranches(make('BRANCH_MANAGER'))).toBe(false);
    expect(canSeeAllBranches(make('Full_Time'))).toBe(false);
    expect(canSeeAllBranches(make('Part_Time'))).toBe(false);
  });

  it('returns false for null session', () => {
    expect(canSeeAllBranches(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/roles.test.ts`
Expected: the new ACADEMY assertion fails (`canSeeAllBranches(make('ACADEMY'))` returns `false`).

- [ ] **Step 3: Update `canSeeAllBranches`**

In [lib/auth.ts](../../../lib/auth.ts), change the import on line 5 to add `isAcademy`:

```ts
import { hasAnyRole, isAdmin, isHOD, isHR, isAcademy, type Role } from '@/lib/roles';
```

And update the function (line 43-46):

```ts
export function canSeeAllBranches(session: { user?: SessionUser } | null): boolean {
  const role = session?.user?.role;
  return isAdmin(role) || isHOD(role) || isHR(role) || isAcademy(role);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/__tests__/roles.test.ts
git commit -m "feat(auth): allow ACADEMY to act across branches like admin/HR"
```

---

## Task 5: API — `GET /api/employees` exposes training fields and adds Academy filter + redaction

**Files:**
- Modify: `app/api/employees/route.ts:8-82`

- [ ] **Step 1: Add training fields to `toEmployee` mapper**

In [app/api/employees/route.ts](../../../app/api/employees/route.ts), inside `toEmployee()` (lines 8-43), add two fields before the closing brace (right after `updatedAt`):

```ts
function toEmployee(s: Record<string, unknown>) {
  return {
    // ... all existing fields unchanged ...
    updatedAt: s.updatedAt ? new Date(s.updatedAt as string).toISOString() : '',
    trainingStartDate: (s.trainingStartDate as string) || '',
    trainingEndDate: (s.trainingEndDate as string) || '',
  };
}
```

- [ ] **Step 2: Add the `toEmployeeForAcademy` mapper**

Right below `toEmployee` (around line 44), add a new function:

```ts
// Strict allowlist mapper for ACADEMY callers. Returns ONLY the 10 keys the
// Academy role is permitted to see. Sensitive fields (NRIC, DOB, home_address,
// bank, emergency contact, university, gender, nickname, employeeId,
// biometricTemplate, accessStatus, probation, endDate, rate, hire_date,
// signed_date, employment_type, email) MUST NOT leak over the wire.
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

- [ ] **Step 3: Update imports**

At the top of `app/api/employees/route.ts`, change line 4 to also import `isAcademy`:

```ts
import { ADMIN_ROLES, isAcademy } from '@/lib/roles';
```

- [ ] **Step 4: Add Academy row filter and mapper switch in GET**

In the GET handler (around line 53-70), after the existing `where` block is built and after the existing `if (!canSeeAllBranches(session))` block, but before the `prisma.branchStaff.findMany` call, add:

```ts
  // Academy callers are restricted to FT/PT coaches. This intersects with any
  // client-supplied role filter, so passing role=BM yields an empty result.
  const callerRole = (session.user as { role?: unknown } | undefined)?.role;
  if (isAcademy(callerRole)) {
    where.role = { in: ["FT - Coach", "PT - Coach"] };
  }
```

Then change the mapping line (currently `let results = staff.map(toEmployee);`) to:

```ts
  const mapper = isAcademy(callerRole) ? toEmployeeForAcademy : toEmployee;
  let results = staff.map(mapper);
```

And restrict the search filter for Academy (currently the search checks `fullName`, `email`, `employeeId`):

```ts
  if (search) {
    results = results.filter((e: Record<string, unknown>) =>
      isAcademy(callerRole)
        ? (e.fullName as string).toLowerCase().includes(search)
        : (e.fullName as string).toLowerCase().includes(search) ||
          ((e.email as string) || '').toLowerCase().includes(search) ||
          ((e.employeeId as string) || '').toLowerCase().includes(search)
    );
  }
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Manual smoke test**

Start the dev server: `npm run dev`. In a browser, log in as an Admin (e.g., your existing admin account) and visit `http://localhost:3001/api/employees`. Verify the JSON now includes `trainingStartDate` and `trainingEndDate` keys (empty strings for existing rows).

Then log in as `academy@gmail.com` (the row Dina already created) in a different browser window / private tab. Visit `http://localhost:3001/api/employees`. Verify:
- Only FT/PT coach rows appear.
- Each row contains EXACTLY these 10 keys: `id`, `fullName`, `phone`, `branch`, `role`, `contract`, `startDate`, `Emp_Status`, `trainingStartDate`, `trainingEndDate`.
- No `nric`, `dob`, `homeAddress`, `email`, `Bank*`, `Emc_*`, `employeeId`, etc.

If anything sensitive appears for Academy, abort and fix before committing.

- [ ] **Step 7: Commit**

```bash
git add app/api/employees/route.ts
git commit -m "feat(api): expose training dates and add Academy row+field filtering on GET /api/employees"
```

---

## Task 6: API — `PUT /api/employees` dual-role gate + allowlist + date validation

**Files:**
- Modify: `app/api/employees/route.ts:163-247`

- [ ] **Step 1: Update imports**

Ensure `app/api/employees/route.ts` has `isAdmin`, `isAcademy`, and `isHR` imported. The existing import at line 3-4 should now look like:

```ts
import { requireSession, requireRole, assertSameBranch, canSeeAllBranches } from '@/lib/auth';
import { ADMIN_ROLES, isAcademy, isAdmin, isHR } from '@/lib/roles';
```

- [ ] **Step 2: Replace the PUT gate**

Replace the existing PUT handler signature block (lines 163-167):

```ts
export async function PUT(request: Request) {
  const { session, error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
```

With:

```ts
export async function PUT(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const callerRole = (session.user as { role?: unknown } | undefined)?.role;
  const isAdminEdit = isAdmin(callerRole);
  const isAcademyEdit = isAcademy(callerRole);
  if (!isAdminEdit && !isAcademyEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
```

- [ ] **Step 3: Add Academy-only allowlist and target-role check**

After the existing body destructure (around line 168-173) and the `if (!id) ...` check, but before the existing branch-guard block, add:

```ts
    if (isAcademyEdit) {
      const allowedKeys = new Set(['id', 'trainingStartDate', 'trainingEndDate']);
      const extraKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
      if (extraKeys.length > 0) {
        return NextResponse.json(
          { error: `Academy cannot edit: ${extraKeys.join(', ')}` },
          { status: 403 },
        );
      }
      const target = await prisma.branchStaff.findUnique({
        where: { id: parseInt(id) },
        select: { role: true },
      });
      if (!target || !['FT - Coach', 'PT - Coach'].includes(target.role || '')) {
        return NextResponse.json(
          { error: 'Academy can only edit FT-Coach or PT-Coach' },
          { status: 403 },
        );
      }
    }
```

- [ ] **Step 4: Block HR from training fields (defense in depth)**

The spec says "HR does not get this power in v1". HR is in `ADMIN_ROLES` so the dual-role gate above lets HR through, but they must not be allowed to write training dates. Right after the Academy block in Step 3, add:

```ts
    if (isHR(callerRole) && (
      body.trainingStartDate !== undefined ||
      body.trainingEndDate !== undefined
    )) {
      return NextResponse.json(
        { error: 'HR cannot edit training fields in v1' },
        { status: 403 },
      );
    }
```

- [ ] **Step 5: Add date validation**

After the destructure (which now needs to include the two training fields), add:

```ts
    // End date must be on or after start date (when both are supplied).
    if (trainingStartDate && trainingEndDate && trainingStartDate > trainingEndDate) {
      return NextResponse.json(
        { error: 'Training end date must be on or after start date' },
        { status: 400 },
      );
    }
```

- [ ] **Step 6: Update the body destructure to include the training fields**

Change the destructure block at lines 168-173. The current block destructures many fields; add `trainingStartDate, trainingEndDate` to the list:

```ts
    const body = await request.json();
    const { id, fullName, email, phone, branch, role, gender, nickName, nric, dob,
            homeAddress, contract, startDate, endDate, probation, rate, accessStatus,
            Emc_Number, Emc_Email, Emc_Relationship, Signed_Date, Emp_Hire_Date,
            Emp_Type, Emp_Status, Bank, Bank_Name, Bank_Account, University,
            employeeId, biometricTemplate,
            trainingStartDate, trainingEndDate } = body;
```

- [ ] **Step 7: Skip the existing branch guard for Academy edits**

The existing `assertSameBranch` checks (around lines 179-191) should be skipped for Academy callers (Academy has cross-branch authority). Wrap the existing branch guards:

```ts
    if (!isAcademyEdit) {
      if (branch !== undefined) {
        const branchGuard = assertSameBranch(session, branch);
        if (branchGuard) return branchGuard;
      }
      const existing = await prisma.branchStaff.findUnique({
        where: { id: parseInt(id) },
        select: { branch: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const idGuard = assertSameBranch(session, existing.branch);
      if (idGuard) return idGuard;
    }
```

(The Academy path already verified the row exists via the target-role check in Step 3, so we don't double-fetch here.)

- [ ] **Step 8: Persist the two training fields**

In the `prisma.branchStaff.update` call (around line 205), append two new conditional fields to the `data` object:

```ts
        ...(employeeId !== undefined && { employeeId }),
        ...(trainingStartDate !== undefined && { trainingStartDate: trainingStartDate || null }),
        ...(trainingEndDate !== undefined && { trainingEndDate: trainingEndDate || null }),
      },
    });
```

(Coercing falsy values to `null` so saving an empty string clears the column.)

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 10: Manual smoke tests**

Start dev server: `npm run dev`. In one browser logged in as Admin and another as Academy:

1. **Admin sets training dates on a coach.** Open the Employee Dashboard → click any FT-Coach → Edit → in devtools network tab, send a PUT to `/api/employees` with body `{id: <coach-id>, trainingStartDate: "2026-05-01", trainingEndDate: "2026-06-30"}`. Verify response is 200.

2. **Admin tries invalid date order.** Same coach, body `{id, trainingStartDate: "2026-06-30", trainingEndDate: "2026-05-01"}`. Expected: 400 with the date-order error.

3. **Academy edits training dates on a coach.** Same kind of request as #1 but as Academy. Expected: 200.

4. **Academy tries to edit a non-training field.** Body `{id, fullName: "X"}`. Expected: 403, error message lists `fullName`.

5. **Academy tries to edit a non-coach.** Pick an `ADMIN` or `BM` row's `id`, body `{id, trainingStartDate: "2026-05-01", trainingEndDate: "2026-06-30"}`. Expected: 403, error message says "Academy can only edit FT-Coach or PT-Coach".

6. **HR tries to edit training fields.** As HR, body `{id: <coach-id>, trainingStartDate: "2026-05-01", trainingEndDate: "2026-06-30"}`. Expected: 403 `HR cannot edit training fields in v1`.

7. **HR edits a non-training field.** As HR, body `{id, phone: "+60-..."}`. Expected: 200 (regression check — HR can still edit other fields).

8. **Anonymous request.** Without a session, body `{id, trainingStartDate: ...}`. Expected: 401.

If any of these don't behave correctly, fix before committing.

- [ ] **Step 11: Commit**

```bash
git add app/api/employees/route.ts
git commit -m "feat(api): dual-role PUT gate with Academy allowlist + training date validation"
```

---

## Task 7: API — `GET /api/branch-staff` exposes training dates

**Files:**
- Modify: `app/api/branch-staff/route.ts:36-54`

- [ ] **Step 1: Add the two columns to the SELECT**

In [app/api/branch-staff/route.ts](../../../app/api/branch-staff/route.ts), update the type and `select` clause (lines 36-40):

```ts
    type StaffRow = {
      id: number;
      nickname: string | null;
      branch: string | null;
      role: string | null;
      status: string | null;
      trainingStartDate: string | null;
      trainingEndDate: string | null;
    };
    const staff = await prisma.branchStaff.findMany({
      select: {
        id: true,
        nickname: true,
        branch: true,
        role: true,
        status: true,
        trainingStartDate: true,
        trainingEndDate: true,
      },
      where: { status: { equals: 'Active', mode: 'insensitive' } },
    }) as StaffRow[];
```

- [ ] **Step 2: Pass the training fields through in the mapped object**

Update the `.map(s => { ... })` block (lines 44-54):

```ts
      .map(s => {
        const fullBranch = BRANCH_CODE_MAP[s.branch ?? ''] ?? s.branch;
        return {
          id: s.id,
          name: s.nickname as string,
          branch: fullBranch,
          role: s.role?.toUpperCase() === 'BM'
            ? `branch_manager_${(fullBranch ?? '').substring(0, 3).toLowerCase()}`
            : null,
          trainingStartDate: s.trainingStartDate,
          trainingEndDate: s.trainingEndDate,
        };
      });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

`npm run dev`, log in as Admin, hit `http://localhost:3001/api/branch-staff?include=all`. Verify each row in the response now has `trainingStartDate` and `trainingEndDate` keys (null for rows that have no training set).

- [ ] **Step 5: Commit**

```bash
git add app/api/branch-staff/route.ts
git commit -m "feat(api): expose training dates on GET /api/branch-staff"
```

---

## Task 8: Middleware — allow ACADEMY into Employee Dashboard and User Management

**Files:**
- Modify: `middleware.ts:10-22`

- [ ] **Step 1: Update imports**

In [middleware.ts](../../../middleware.ts), change the imports on line 3 to also bring in `ROLES` (we'll need to compose a custom role list):

```ts
import { normalizeRole, ADMIN_ROLES, MANAGEMENT_ROLES, ROLES, type Role } from "@/lib/roles";
```

- [ ] **Step 2: Adjust the role rules**

Replace the `ROLE_RULES` array (lines 10-22) with:

```ts
const ROLE_RULES: Array<{ prefix: string; allowed: readonly Role[] }> = [
  // Admin-only pages (user / account administration). Academy gets in here too,
  // because the user-management route hosts the per-coach edit form they need
  // to set training dates from. The route handler narrows what they can see/edit.
  { prefix: "/user-management",               allowed: [...ADMIN_ROLES, ROLES.ACADEMY] },
  { prefix: "/account-management",            allowed: ADMIN_ROLES },
  { prefix: "/register-employee",             allowed: ADMIN_ROLES },

  // Management-level pages. Employee dashboard is also visible to Academy
  // (read-mostly view of FT/PT coaches). Manpower, HR, on/offboarding remain
  // management-only.
  { prefix: "/dashboard-employee-management", allowed: [...MANAGEMENT_ROLES, ROLES.ACADEMY] },
  { prefix: "/manpower-schedule",             allowed: MANAGEMENT_ROLES },
  { prefix: "/hr-dashboard",                  allowed: MANAGEMENT_ROLES },
  { prefix: "/onboarding",                    allowed: MANAGEMENT_ROLES },
  { prefix: "/offboarding",                   allowed: MANAGEMENT_ROLES },
];
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. In a private tab, log in as `academy@gmail.com`. Try these URLs by typing them directly:

- `/dashboard-employee-management` → should load (no redirect to /home).
- `/user-management` → should load.
- `/manpower-schedule` → should redirect to `/home?forbidden=/manpower-schedule`.
- `/hr-dashboard` → should redirect to `/home?forbidden=...`.
- `/onboarding` → redirect.
- `/offboarding` → redirect.

If any of those don't behave, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "feat(middleware): allow ACADEMY into employee-dashboard and user-management"
```

---

## Task 9: UI hub — DashboardHome locks all but HRMS for Academy

**Files:**
- Modify: `app/components/DashboardHome.tsx:94-110`

- [ ] **Step 1: Update imports**

At the top of [app/components/DashboardHome.tsx](../../../app/components/DashboardHome.tsx) (line 4), import `isAcademy`:

```ts
import { isBranchManager, isAcademy } from "@/lib/roles";
```

- [ ] **Step 2: Compute Academy gate**

Inside `DashboardHome` (around line 95), after the existing `branchManager` const, add:

```ts
  const isAcademyUser = isAcademy(userRole);
```

Update `accessibleCount` and the disabled check:

```ts
  const accessibleCount = (branchManager || isAcademyUser) ? 1 : dashboards.length;
```

In the `dashboards.map` callback (line 109-110), broaden the disabled rule:

```ts
            const isDisabled =
              (branchManager && !["hrms", "inventory"].includes(dashboard.id)) ||
              (isAcademyUser && dashboard.id !== "hrms");
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. Log in as Academy. Visit `/home`. Expected:
- "1 accessible dashboard" subtitle.
- All dashboard cards greyed-out except HRMS (which is clickable).
- HRMS card click → `/dashboards/hrms`.

Log in as Admin in another tab. Visit `/home`. Expected: all cards still active (no regression).

- [ ] **Step 5: Commit**

```bash
git add app/components/DashboardHome.tsx
git commit -m "feat(home): lock all dashboards except HRMS for Academy"
```

---

## Task 10: UI hub — DashboardDetail locks HRMS items except Employee Dashboard for Academy

**Files:**
- Modify: `app/components/DashboardDetail.tsx:115-128`

- [ ] **Step 1: Update imports**

In [app/components/DashboardDetail.tsx](../../../app/components/DashboardDetail.tsx) (line 6), add `isAcademy`:

```ts
import { isHR, isAcademy } from "@/lib/roles";
```

- [ ] **Step 2: Add the Academy gate**

After line 118 (`const userIsHR = ...`), add:

```ts
  const userIsAcademy = isAcademy((session?.user as { role?: unknown } | undefined)?.role);
```

Update the `isItemEnabled` check (line 122-123):

```ts
  const isItemEnabled = (href: string) =>
    !((userIsHR || userIsAcademy) && id === "hrms" && href !== "/dashboard-employee-management");
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

`npm run dev`, log in as Academy, visit `/dashboards/hrms`. Expected: only "Employee Dashboard" card active; Manpower Planning, Claims, Attendance, Onboarding, Offboarding, HR Dashboard, Manpower Cost Report all greyed out.

Click "Employee Dashboard" → should navigate to `/dashboard-employee-management`.

- [ ] **Step 5: Commit**

```bash
git add app/components/DashboardDetail.tsx
git commit -m "feat(hrms-hub): lock all items except Employee Dashboard for Academy"
```

---

## Task 11: UI — EmployeeTable adds Training column for everyone, narrow view for Academy

**Files:**
- Modify: `app/components/EmployeeTable.tsx`

This task modifies a moderately large file. We add a `userRole` prop (passed in from the parent page), use it to switch column sets, and append a Training column for the existing admin/HR/management view.

- [ ] **Step 1: Update the parent page to pass `userRole`**

In [app/dashboard-employee-management/page.tsx](../../../app/dashboard-employee-management/page.tsx), make the page client-side aware of the session and forward the role to EmployeeTable. Replace the file:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import EmployeeTable from "@/app/components/EmployeeTable";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role || "";

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center pl-14 pr-4 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboards/hrms"
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-3xl font-bold">HR Employee Management</h1>
              <p className="text-blue-100 mt-1">Super Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-2">
              <UserHeader userName="Admin User" userEmail="admin@ebright.com" />
              <a
                href="/user-management"
                className="bg-white text-blue-600 hover:bg-blue-50 font-medium py-2 px-4 rounded-lg transition-colors shadow text-sm"
              >
                + Add User
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <EmployeeTable userRole={userRole} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the `Employee` interface and add `userRole` prop**

In [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx), update the `Employee` interface (lines 6-28) to include the two new optional fields:

```ts
interface Employee {
  id: string;
  employeeId: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  gender: string;
  nickName: string;
  email: string;
  phone: string;
  nric: string;
  dob: string;
  homeAddress: string;
  branch: string;
  role: string;
  contract: string;
  startDate: string;
  probation: string;
  Emp_Status?: string;
  accessStatus: string;
  biometricTemplate: string | null;
  registeredAt: string;
  trainingStartDate?: string;
  trainingEndDate?: string;
}

interface EmployeeTableProps {
  refreshTrigger?: number;
  userRole?: string;
}

export default function EmployeeTable({
  refreshTrigger,
  userRole = "",
}: EmployeeTableProps) {
```

- [ ] **Step 3: Add Academy detection and a TrainingBadge component**

Below the imports at the top of the file, add a small inline component:

```tsx
import { isAcademy } from "@/lib/roles";
import { isInTraining } from "@/lib/training";
```

Inside `EmployeeTable`, near the top of the function:

```ts
  const academyView = isAcademy(userRole);
```

Add a helper at file scope (above `export default function EmployeeTable`):

```tsx
function TrainingCell({ start, end }: { start?: string; end?: string }) {
  if (!start && !end) return <span className="text-gray-400 text-xs">—</span>;
  const inWindow = isInTraining(start, end);
  const today = new Date().toISOString().slice(0, 10);
  const future = !!start && start > today;
  const cls = inWindow
    ? "bg-green-100 text-green-800"
    : future
    ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ${cls}`}>
      🎓 {start || "—"} → {end || "—"}
    </span>
  );
}
```

- [ ] **Step 4: Apply the FT/PT-only filter for Academy**

After the existing filter logic (around line 132), pre-filter the employees for Academy:

```ts
  const filteredEmployees = employees
    .filter((e) => !academyView || ["FT - Coach", "PT - Coach"].includes(e.role))
    .filter((e) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "Archived") return e.accessStatus === "ARCHIVED";
      return (e.Emp_Status || "") === statusFilter;
    });
```

- [ ] **Step 5: Render the narrow column set when Academy**

The full table block (around lines 188-210 for the header, plus the body) needs to render two different shapes. Wrap the existing `<table>` in a conditional:

```tsx
        <div className="overflow-x-auto">
          {academyView ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Full Name</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Phone</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Role</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Branch/Dept</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Contract</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Start Date</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Status</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Training</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700 text-xs">Manage</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-3 text-gray-900 text-xs uppercase">
                      {employee.fullName || `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "-"}
                      {isInTraining(employee.trainingStartDate, employee.trainingEndDate) && (
                        <span className="ml-1" title={`In training: ${employee.trainingStartDate} → ${employee.trainingEndDate}`}>🎓</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.phone}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{getRoleLabel(employee.role)}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{getBranchLabel(employee.branch)}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.contract || "-"}</td>
                    <td className="px-2 py-3 text-gray-600 text-xs">{employee.startDate || "-"}</td>
                    <td className="px-2 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        employee.Emp_Status === "Active"
                          ? "bg-green-100 text-green-800"
                          : employee.Emp_Status === "Inactive"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {employee.Emp_Status || "—"}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <TrainingCell start={employee.trainingStartDate} end={employee.trainingEndDate} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <a
                        href={`/user-management?employeeId=${employee.id}`}
                        className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Edit
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            // Existing full table block goes here unchanged.
            <table className="w-full text-sm">
              {/* ... existing thead and tbody ... */}
            </table>
          )}
        </div>
```

In the existing `tbody` (admin view), insert a new `<td>` for the Training column. Find the row that renders cells; add after the "Probation" `<td>` (around line 237) and before the Status `<td>`:

```tsx
                  <td className="px-2 py-3">
                    <TrainingCell start={employee.trainingStartDate} end={employee.trainingEndDate} />
                  </td>
```

And add a corresponding `<th>` in the existing admin `<thead>` between "Probation" and "Status":

```tsx
                <th className="px-2 py-3 text-left font-semibold text-gray-700 text-xs">Training</th>
```

- [ ] **Step 6: Hide the "+ Add User" link for Academy**

Back in [app/dashboard-employee-management/page.tsx](../../../app/dashboard-employee-management/page.tsx), wrap the "+ Add User" link with a role check:

```tsx
              {!isAcademy(userRole) && (
                <a
                  href="/user-management"
                  className="bg-white text-blue-600 hover:bg-blue-50 font-medium py-2 px-4 rounded-lg transition-colors shadow text-sm"
                >
                  + Add User
                </a>
              )}
```

Don't forget the import: `import { isAcademy } from "@/lib/roles";`.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Manual smoke test**

`npm run dev`. Log in as Admin: visit `/dashboard-employee-management`. Verify the existing table now has a "Training" column with `—` for rows that have no dates set, and a `🎓 → →` badge for rows with dates. No regressions on other columns.

Log in as Academy: same URL. Verify only 9 columns render in the listed order, only FT/PT coaches appear, "+ Add User" is hidden.

- [ ] **Step 9: Commit**

```bash
git add app/components/EmployeeTable.tsx app/dashboard-employee-management/page.tsx
git commit -m "feat(employee-table): training column for admin, narrow 9-column view for Academy"
```

---

## Task 12: UI — UserManagement adds Training section + narrow form for Academy

**Files:**
- Modify: `app/components/UserManagement.tsx`

This is the most invasive UI task. We add the Training section to the standard edit form, then branch the rendering for Academy users to show a narrow read-mostly form.

- [ ] **Step 1: Update imports and the User interface**

In [app/components/UserManagement.tsx](../../../app/components/UserManagement.tsx), update line 6. The existing import `import { isAdmin } from "@/lib/roles";` becomes:

```ts
import { isAdmin, isAcademy } from "@/lib/roles";
import { isInTraining } from "@/lib/training";
```

Update the `User` interface (lines 10-45) to include the two new optional fields:

```ts
interface User {
  // ... existing fields ...
  registeredAt: string;
  updatedAt: string;
  trainingStartDate?: string;
  trainingEndDate?: string;
}
```

- [ ] **Step 2: Re-derive `isAuthorized` to include Academy**

Replace the line `const isAuthorized = isAdmin(userRole);` (around line 83) with:

```ts
  const academyView = isAcademy(userRole);
  const isAuthorized = isAdmin(userRole) || academyView;
```

- [ ] **Step 3: Apply FT/PT filter to the user list for Academy**

Update `filteredUsers` (around line 208) to add an Academy pre-filter:

```ts
  const filteredUsers = users
    .filter((u) => !academyView || ["FT - Coach", "PT - Coach"].includes(u.role))
    .filter(
      (user) =>
        getDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
    );
```

- [ ] **Step 4: Add "Training" section to the existing admin edit form**

Inside the `editMode` block (around line 354-480), after the existing "Employment" section closes (around line 443) and before "Emergency Contact" begins (line 446), insert:

```tsx
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inp("Training Start Date", "trainingStartDate", "date")}
                      {inp("Training End Date", "trainingEndDate", "date")}
                    </div>
                    {editData?.trainingStartDate && editData?.trainingEndDate &&
                      editData.trainingStartDate > editData.trainingEndDate && (
                      <p className="text-xs text-red-600 mt-2">End date must be on or after start date.</p>
                    )}
                  </section>
```

- [ ] **Step 5: Show "🎓 In Training" badge in the panel header**

In the panel header (around line 314-319), the existing `Authorized/Unauthorized` badge is rendered. Add a Training badge next to it:

```tsx
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    selectedUser.accessStatus === "AUTHORIZED" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}>
                    {selectedUser.accessStatus === "AUTHORIZED" ? "✓ Authorized" : "✗ Unauthorized"}
                  </span>
                  {isInTraining(selectedUser.trainingStartDate, selectedUser.trainingEndDate) && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"
                          title={`Training: ${selectedUser.trainingStartDate} → ${selectedUser.trainingEndDate}`}>
                      🎓 In Training
                    </span>
                  )}
```

- [ ] **Step 6: Block Save when end < start**

Update the Save handler (around line 151), at the very top of `handleSave`, add:

```ts
    if (editData.trainingStartDate && editData.trainingEndDate &&
        editData.trainingStartDate > editData.trainingEndDate) {
      setError("Training end date must be on or after start date.");
      return;
    }
```

- [ ] **Step 7: Narrow the payload for Academy edits**

Still in `handleSave`, after computing `payload` and before the `fetch`, branch on `academyView`:

```ts
      const fullPayload = newEmployeeId !== undefined
        ? { ...editData, employeeId: newEmployeeId }
        : editData;
      const payload = academyView
        ? {
            id: editData.id,
            trainingStartDate: editData.trainingStartDate || "",
            trainingEndDate: editData.trainingEndDate || "",
          }
        : fullPayload;
```

(Replaces the existing `const payload = ...` line.)

- [ ] **Step 8: Render a narrow form for Academy in editMode**

Inside the `editMode ? (...) : (...)` ternary (around line 353), wrap a third branch for `academyView`. Restructure as:

```tsx
              {editMode && academyView ? (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Full Name", getDisplayName(selectedUser))}
                      {field("Phone", selectedUser.phone)}
                      {field("Role", selectedUser.role)}
                      {field("Branch/Dept", selectedUser.branch)}
                      {field("Contract", selectedUser.contract)}
                      {field("Start Date", selectedUser.startDate)}
                      {field("Status", selectedUser.Emp_Status)}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {inp("Training Start Date", "trainingStartDate", "date")}
                      {inp("Training End Date", "trainingEndDate", "date")}
                    </div>
                    {editData?.trainingStartDate && editData?.trainingEndDate &&
                      editData.trainingStartDate > editData.trainingEndDate && (
                      <p className="text-xs text-red-600 mt-2">End date must be on or after start date.</p>
                    )}
                  </section>

                  <div className="flex gap-3 pt-2 border-t">
                    <button onClick={handleSave}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                      💾 Save
                    </button>
                    <button onClick={() => {
                      setEditMode(false);
                      setEditData({ ...selectedUser });
                      setEmpIdError("");
                    }}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : editMode ? (
                /* ... existing admin editMode block unchanged ... */
              ) : academyView ? (
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Employment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Full Name", getDisplayName(selectedUser))}
                      {field("Phone", selectedUser.phone)}
                      {field("Role", selectedUser.role)}
                      {field("Branch/Dept", selectedUser.branch)}
                      {field("Contract", selectedUser.contract)}
                      {field("Start Date", selectedUser.startDate)}
                      {field("Status", selectedUser.Emp_Status)}
                    </div>
                  </section>
                  <section>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b pb-2 mb-4">Training</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {field("Training Start Date", selectedUser.trainingStartDate)}
                      {field("Training End Date", selectedUser.trainingEndDate)}
                    </div>
                  </section>
                </div>
              ) : (
                /* ... existing admin read-only block unchanged ... */
              )}
```

In other words, the rendering becomes a 4-way choice:
1. `editMode && academyView` → narrow editable form (training only)
2. `editMode && !academyView` → existing full admin edit form (now with Training section from Step 4)
3. `!editMode && academyView` → narrow read-only view
4. `!editMode && !academyView` → existing full admin read-only view

- [ ] **Step 9: Hide Archive/Delete buttons for Academy**

In the panel header where Edit / Archive / Delete render (around line 320-348), wrap Archive and Delete with `!academyView`:

```tsx
                      {!academyView && selectedUser.accessStatus !== "ARCHIVED" && (
                        <button onClick={() => handleArchive(selectedUser.id)} ...>Archive</button>
                      )}
                      {!academyView && (
                        <button onClick={() => handleDelete(selectedUser.id)} ...>Delete</button>
                      )}
```

(Edit button stays — Academy needs it to enter training-edit mode.)

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 11: Manual smoke test**

`npm run dev`. Log in as Admin, visit `/user-management`. Verify:
- Training section appears in the edit form between Employment and Emergency Contact.
- Setting both dates and saving works; the badge appears in the panel header when today is in window.
- Setting end < start → red inline error, Save still attempts but server rejects (and the client error appears via the existing error path).

Log in as Academy, visit `/user-management`. Verify:
- User list contains only FT/PT coaches.
- Click a coach: only Employment (7 read-only fields) and Training sections render.
- Personal Info, Emergency Contact, Bank Details sections do NOT render at all.
- Archive and Delete buttons are hidden; Edit is visible.
- Click Edit: Employment fields are read-only, only Training inputs are editable. Save works.
- Devtools network: PUT body contains only `id`, `trainingStartDate`, `trainingEndDate`.

- [ ] **Step 12: Commit**

```bash
git add app/components/UserManagement.tsx
git commit -m "feat(user-mgmt): training section for admin, narrow training-only form for Academy"
```

---

## Task 13: UI — Manpower-schedule planner shows 🎓 badge next to coach names

**Files:**
- Modify: `app/manpower-schedule/plan-new-week/page.tsx`
- Modify: `app/manpower-schedule/update/page.tsx`
- Modify: `app/manpower-schedule/archive/page.tsx`

The three planner pages all fetch from `/api/branch-staff?include=all` and reduce the response to `Record<string, string[]>`. We extend the cached state to also keep a `Map<name, {start, end}>` so we can render the badge wherever a name is shown.

- [ ] **Step 1: Add a shared training map state to plan-new-week**

In [app/manpower-schedule/plan-new-week/page.tsx](../../../app/manpower-schedule/plan-new-week/page.tsx), add the import at the top:

```tsx
import { isInTraining } from "@/lib/training";
```

Near the existing `useState` declarations (around line 97), add:

```tsx
  const [trainingMap, setTrainingMap] = useState<Record<string, { start?: string; end?: string }>>({});
```

Update `fetchStaff` (line 164-181) to populate it:

```tsx
  const fetchStaff = async () => {
    const res = await fetch('/api/branch-staff?include=all');
    const staffList = await res.json();
    if (!Array.isArray(staffList)) return;
    const grouped: Record<string, string[]> = {};
    const managers: Record<string, string[]> = {};
    const tmap: Record<string, { start?: string; end?: string }> = {};
    staffList.forEach((s: any) => {
      if (!s.branch) return;
      if (!grouped[s.branch]) grouped[s.branch] = [];
      grouped[s.branch].push(s.name);
      if (s.role && s.role.startsWith('branch_manager')) {
        if (!managers[s.branch]) managers[s.branch] = [];
        managers[s.branch].push(s.name);
      }
      if (s.trainingStartDate || s.trainingEndDate) {
        tmap[s.name] = { start: s.trainingStartDate ?? undefined, end: s.trainingEndDate ?? undefined };
      }
    });
    setBranchStaffData(grouped);
    setBranchManagerData(managers);
    setTrainingMap(tmap);
  };
```

- [ ] **Step 2: Add a small badge helper at file scope**

Above the page component (after imports), add:

```tsx
function nameWithBadge(name: string, training?: { start?: string; end?: string }) {
  const inWindow = isInTraining(training?.start, training?.end);
  if (!inWindow) return name;
  return (
    <span title={`In training: ${training?.start} → ${training?.end}`}>
      {name} 🎓
    </span>
  );
}
```

(Note: this returns either a string or JSX; callers in JSX context render it directly with `{nameWithBadge(...)}`.)

- [ ] **Step 3: Apply the badge at render sites in plan-new-week**

Wherever `row.name` or `s.name` is rendered as visible text:

Around line 53:

```tsx
<td className="border border-slate-300 px-3 py-3 font-black text-slate-800">
  {nameWithBadge(row.name, trainingMap[row.name])}
</td>
```

For dropdown options (search the file for `{e}` or `{name}` inside `<option>` tags), append a `🎓` glyph to the visible label. For example, the `<option key={e} value={e} ...>` blocks around lines 666 and 717: change

```tsx
                                          <option key={e} value={e} disabled={isDisabled}>
                                            {e}
                                          </option>
```

to

```tsx
                                          <option key={e} value={e} disabled={isDisabled}>
                                            {e}{isInTraining(trainingMap[e]?.start, trainingMap[e]?.end) ? ' 🎓' : ''}
                                          </option>
```

(Browser `<option>` elements only render plain text, so we append a unicode glyph rather than JSX.)

Repeat for any other `<option>` in the file that uses a coach name as value/label.

- [ ] **Step 4: Apply the same changes to update and archive pages**

In [app/manpower-schedule/update/page.tsx](../../../app/manpower-schedule/update/page.tsx):

1. Add the same import: `import { isInTraining } from "@/lib/training";`
2. Add the same `trainingMap` state.
3. Update `fetchStaff` (lines 133-150) the same way.
4. Add the badge to every `<option>` rendering a coach name.

In [app/manpower-schedule/archive/page.tsx](../../../app/manpower-schedule/archive/page.tsx):

1. Same import.
2. Same `trainingMap` state.
3. Update its `fetchStaff` (around line 109).
4. Apply the badge to every coach name render.

If a name appears as plain text inside a `<td>` (not inside `<option>`), use the `nameWithBadge` JSX helper from Step 2 (replicate the helper at the top of each file, or factor it into a shared component if you prefer — but **only** if there are >2 call sites; otherwise inline is fine).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Manual smoke test**

`npm run dev`. As Admin, set training dates on a coach via the Employee Dashboard (e.g., trainingStartDate: today, trainingEndDate: today+30 days). Then navigate to `/manpower-schedule/plan-new-week`, choose any branch, and find that coach in the dropdown options — should show `<name> 🎓`.

In the summary table at the top of the page (after the BM picks slots and the "weekly summary" tables render), if that coach's name appears, the cell should show `<name> 🎓` and the tooltip on hover should read `In training: <start> → <end>`.

Repeat on `/manpower-schedule/update/<id>` and `/manpower-schedule/archive` — the badge should appear wherever names render.

Set the end date to yesterday for that coach. Refresh — the 🎓 should disappear (window has passed).

- [ ] **Step 7: Commit**

```bash
git add app/manpower-schedule/plan-new-week/page.tsx app/manpower-schedule/update/page.tsx app/manpower-schedule/archive/page.tsx
git commit -m "feat(manpower): show 🎓 badge next to coaches currently in training"
```

---

## Task 14: End-to-end manual verification

**Files:** none — this is a guided manual test pass.

- [ ] **Step 1: Confirm Academy login + home gating**

In a private/incognito window, log out, then log in as `academy@gmail.com`. Land at `/home`. Expected:
- "1 accessible dashboard" subtitle.
- HRMS card is the only one not greyed out.

- [ ] **Step 2: Confirm HRMS hub gating**

Click HRMS. Expected: only "Employee Dashboard" card is enabled. All other items (Manpower Planning, Claims, Attendance, Onboarding, Offboarding, HR Dashboard, Manpower Cost Report) are greyed out.

- [ ] **Step 3: Confirm Employee Dashboard view restrictions**

Click Employee Dashboard. Expected:
- Only FT-Coach and PT-Coach rows in the list (across all branches; verify by changing the Branch dropdown and searching).
- Table shows exactly 9 columns: Full Name, Phone, Role, Branch/Dept, Contract, Start Date, Status, Training, Manage.
- No NRIC, DOB, home address, biometrics, access status, employee ID, gender, or nickname columns.
- "+ Add User" button hidden.

- [ ] **Step 4: Confirm User Management view restrictions**

Click "Edit" on any coach row. Expected to land at `/user-management?employeeId=...`. Then:
- User list contains only FT/PT coaches.
- Detail panel: only Employment section (7 read-only fields) and Training section (read-only when not in edit mode).
- No Personal Info, Emergency Contact, or Bank Details sections.
- Archive and Delete buttons hidden; Edit visible.

- [ ] **Step 5: Confirm Academy edit flow**

Click Edit on a coach. Expected:
- Only Training inputs are interactive (Employment shown read-only).
- Set valid start + end dates, click Save → success.
- Re-open the same coach: dates persisted; "🎓 In Training" badge appears in the panel header if today is in the window.

- [ ] **Step 6: Confirm API hardening (devtools)**

Still as Academy, open browser devtools → Network tab. Reload Employee Dashboard. Inspect the `/api/employees` JSON response. Expected: each row has exactly 10 keys (`id`, `fullName`, `phone`, `branch`, `role`, `contract`, `startDate`, `Emp_Status`, `trainingStartDate`, `trainingEndDate`). No NRIC, DOB, bank, email, etc.

Manually craft a PUT request from the devtools console:

```js
fetch('/api/employees', {
  method: 'PUT',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({id: '<some-coach-id>', fullName: 'NEW NAME'}),
}).then(r => r.json()).then(console.log)
```

Expected: 403 with `Academy cannot edit: fullName`.

Try editing a non-coach (set role to BM in DB, then PUT training dates with that id) — expected: 403 `Academy can only edit FT-Coach or PT-Coach`.

- [ ] **Step 7: Confirm direct URL navigation is blocked**

As Academy, type these URLs into the address bar:
- `/manpower-schedule` → redirects to `/home?forbidden=/manpower-schedule`
- `/hr-dashboard` → redirects
- `/onboarding` → redirects
- `/crm` → redirects (if applicable)

- [ ] **Step 8: Confirm admin/HR/BM regression**

Log out, log back in as your usual Admin / Super Admin account. Confirm:
- All cards on home are active.
- Employee Dashboard table now has a "Training" column. Existing columns unchanged.
- User Management edit form has a Training section between Employment and Emergency Contact.
- Setting + saving training dates works.
- Manpower-schedule planner shows 🎓 badges next to coaches currently in their training window.

If any step fails, fix the underlying cause and re-run the affected steps. Do not "patch around" the symptom.

- [ ] **Step 9: Run full test + typecheck once more**

```bash
npx vitest run && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 10: Commit any final fixes**

If Step 9 surfaces problems, fix them in a separate commit (`fix(...)`). Otherwise nothing to commit.

---

## Notes for the implementer

- **DRY** — the 9 visible Academy fields are listed in three places (UI table columns, UI form sections, API mapper). They MUST stay in sync. If a future field is added, update all three. There is no test that catches drift between the UI and the API mapper today; rely on the manual devtools network check in Task 14 Step 6 as the regression gate.
- **YAGNI** — do not introduce a `core_audit_log` entry for training-date edits in this work. The schema has the table but the spec explicitly does not require an audit trail in v1.
- **Don't refactor** the existing UserManagement.tsx renderers beyond what these tasks require. The file is already large; consolidating it is a separate cleanup. Stay surgical.
- **Time-window logic lives in `isInTraining()`**. Do not inline date comparisons elsewhere. If a UI site needs the flag, import the helper.
- **No new role groupings** beyond `TRAINING_EDIT_ROLES`. Don't speculatively expose the role anywhere else (e.g., don't add it to `MANAGEMENT_ROLES`).
