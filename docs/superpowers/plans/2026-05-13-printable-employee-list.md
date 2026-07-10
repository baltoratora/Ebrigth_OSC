# Printable Employee List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Print List" feature to the HR Employee Management dashboard that opens a clean printable page (Name / Branch / Status / Role) grouped by branch, auto-triggers the browser print dialog, and lets the user choose between the currently filtered view or all employees.

**Architecture:** A new client route `/dashboard-employee-management/print` reuses the existing `/api/employees` endpoint (no backend changes — permissions and Academy stripping carry over). Pure filter/sort/group helpers live in `lib/printEmployees.ts` so they can be unit tested in isolation. A "Print List" button + modal lives inside `EmployeeTable.tsx` where filter state already exists, opening the print route in a new tab with query params that mirror the current filters.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest (unit tests). No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-05-13-printable-employee-list-design.md](../specs/2026-05-13-printable-employee-list-design.md)

---

## File Structure

**Files created:**
- `lib/printEmployees.ts` — pure helpers: `parsePrintParams`, `buildPrintApiUrl`, `filterEmployeesForPrint`, `sortAndGroupByBranch`
- `lib/__tests__/printEmployees.test.ts` — unit tests for those helpers
- `app/dashboard-employee-management/print/page.tsx` — the printable client route

**Files modified:**
- [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx) — add "Print List" button (hidden for Academy) and a small modal with two options ("Print current view" / "Print all employees")

**Files not touched:**
- `app/api/employees/route.ts` — unchanged
- `app/dashboard-employee-management/page.tsx` — unchanged
- `prisma/schema.prisma` — unchanged

Run `npm run typecheck` and `npx vitest run` after each task to keep the tree green.

---

## Task 1: Pure print helpers (TDD)

**Files:**
- Create: `lib/printEmployees.ts`
- Create: `lib/__tests__/printEmployees.test.ts`

### Step 1.1: Write the failing tests

- [ ] **Step 1.1: Write `lib/__tests__/printEmployees.test.ts`**

Create the file with this content:

```ts
import { describe, it, expect } from 'vitest';
import {
  parsePrintParams,
  buildPrintApiUrl,
  filterEmployeesForPrint,
  sortAndGroupByBranch,
  type PrintEmployee,
} from '@/lib/printEmployees';

describe('parsePrintParams', () => {
  it('returns all=true when all=1 is present and ignores other filters', () => {
    const params = new URLSearchParams('all=1&branch=HQ&role=BM&status=Active&search=ali');
    expect(parsePrintParams(params)).toEqual({
      all: true,
      branch: '',
      role: '',
      status: '',
      search: '',
    });
  });

  it('returns each filter when set', () => {
    const params = new URLSearchParams('branch=HQ&role=BM&status=Active&search=ali');
    expect(parsePrintParams(params)).toEqual({
      all: false,
      branch: 'HQ',
      role: 'BM',
      status: 'Active',
      search: 'ali',
    });
  });

  it('defaults missing filters to empty string and all to false', () => {
    expect(parsePrintParams(new URLSearchParams(''))).toEqual({
      all: false,
      branch: '',
      role: '',
      status: '',
      search: '',
    });
  });
});

describe('buildPrintApiUrl', () => {
  it('returns /api/employees with no params when all=true', () => {
    expect(
      buildPrintApiUrl({ all: true, branch: 'HQ', role: 'BM', status: 'Active', search: 'x' })
    ).toBe('/api/employees');
  });

  it('only includes search, branch, role in the query string (status filtered client-side)', () => {
    const url = buildPrintApiUrl({
      all: false,
      branch: 'HQ',
      role: 'BM',
      status: 'Active',
      search: 'ali',
    });
    // status is NOT in the URL — API doesn't filter on it; client does
    expect(url).toBe('/api/employees?search=ali&branch=HQ&role=BM');
  });

  it('omits empty filters', () => {
    expect(
      buildPrintApiUrl({ all: false, branch: 'HQ', role: '', status: '', search: '' })
    ).toBe('/api/employees?branch=HQ');
  });
});

describe('filterEmployeesForPrint', () => {
  const sample: PrintEmployee[] = [
    { id: '1', fullName: 'Alice',  branch: 'HQ',  role: 'BM',         Emp_Status: 'Active',   accessStatus: 'AUTHORIZED' },
    { id: '2', fullName: 'Bob',    branch: 'HQ',  role: 'FT - Coach', Emp_Status: 'Inactive', accessStatus: 'AUTHORIZED' },
    { id: '3', fullName: 'Carol',  branch: 'KD',  role: 'BM',         Emp_Status: 'Active',   accessStatus: 'ARCHIVED'   },
    { id: '4', fullName: 'Daniel', branch: 'KD',  role: 'PT - Coach', Emp_Status: 'Active',   accessStatus: 'AUTHORIZED' },
  ];

  it('returns all rows when status filter is empty', () => {
    expect(filterEmployeesForPrint(sample, '').map((e) => e.id)).toEqual(['1', '2', '3', '4']);
  });

  it('filters by Emp_Status when status is Active or Inactive', () => {
    expect(filterEmployeesForPrint(sample, 'Active').map((e) => e.id)).toEqual(['1', '4']);
    expect(filterEmployeesForPrint(sample, 'Inactive').map((e) => e.id)).toEqual(['2']);
  });

  it('filters by accessStatus=ARCHIVED when status is Archived', () => {
    expect(filterEmployeesForPrint(sample, 'Archived').map((e) => e.id)).toEqual(['3']);
  });
});

describe('sortAndGroupByBranch', () => {
  const sample: PrintEmployee[] = [
    { id: '1', fullName: 'charlie', branch: 'KD',  role: 'BM',         Emp_Status: 'Active', accessStatus: 'AUTHORIZED' },
    { id: '2', fullName: 'Alice',   branch: 'HQ',  role: 'FT - Coach', Emp_Status: 'Active', accessStatus: 'AUTHORIZED' },
    { id: '3', fullName: 'bob',     branch: 'HQ',  role: 'BM',         Emp_Status: 'Active', accessStatus: 'AUTHORIZED' },
    { id: '4', fullName: 'Diana',   branch: 'KD',  role: 'PT - Coach', Emp_Status: 'Active', accessStatus: 'AUTHORIZED' },
    { id: '5', fullName: 'Eve',     branch: 'ZZZ', role: 'BM',         Emp_Status: 'Active', accessStatus: 'AUTHORIZED' },
  ];

  it('groups by branch in BRANCH_OPTIONS order with unknown branches last', () => {
    const groups = sortAndGroupByBranch(sample);
    expect(groups.map((g) => g.branch)).toEqual(['HQ', 'KD', 'ZZZ']);
  });

  it('sorts employees within each branch alphabetically (case-insensitive)', () => {
    const groups = sortAndGroupByBranch(sample);
    expect(groups[0].employees.map((e) => e.fullName)).toEqual(['Alice', 'bob']);
    expect(groups[1].employees.map((e) => e.fullName)).toEqual(['charlie', 'Diana']);
  });

  it('treats missing branch as empty-string and groups it at the end', () => {
    const withBlank: PrintEmployee[] = [
      ...sample,
      { id: '6', fullName: 'Frank', branch: '', role: 'BM', Emp_Status: 'Active', accessStatus: 'AUTHORIZED' },
    ];
    const groups = sortAndGroupByBranch(withBlank);
    expect(groups[groups.length - 1].branch).toBe('');
  });
});
```

- [ ] **Step 1.2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/printEmployees.test.ts`

Expected: FAIL — `Cannot find module '@/lib/printEmployees'`.

### Step 1.3: Implement the helpers

- [ ] **Step 1.3: Write `lib/printEmployees.ts`**

Create the file with this content:

```ts
import { BRANCH_OPTIONS } from '@/lib/constants';

export interface PrintEmployee {
  id: string;
  fullName: string;
  branch: string;
  role: string;
  Emp_Status?: string;
  accessStatus?: string;
}

export interface PrintParams {
  all: boolean;
  branch: string;
  role: string;
  status: string;
  search: string;
}

export interface BranchGroup {
  branch: string;
  employees: PrintEmployee[];
}

export function parsePrintParams(params: URLSearchParams): PrintParams {
  if (params.get('all') === '1') {
    return { all: true, branch: '', role: '', status: '', search: '' };
  }
  return {
    all: false,
    branch: params.get('branch') ?? '',
    role: params.get('role') ?? '',
    status: params.get('status') ?? '',
    search: params.get('search') ?? '',
  };
}

export function buildPrintApiUrl(p: PrintParams): string {
  if (p.all) return '/api/employees';
  const qs = new URLSearchParams();
  if (p.search) qs.append('search', p.search);
  if (p.branch) qs.append('branch', p.branch);
  if (p.role) qs.append('role', p.role);
  const s = qs.toString();
  return s ? `/api/employees?${s}` : '/api/employees';
}

export function filterEmployeesForPrint(rows: PrintEmployee[], status: string): PrintEmployee[] {
  if (!status) return rows;
  if (status === 'Archived') return rows.filter((e) => e.accessStatus === 'ARCHIVED');
  return rows.filter((e) => (e.Emp_Status ?? '') === status);
}

const BRANCH_ORDER: Record<string, number> = Object.fromEntries(
  BRANCH_OPTIONS.map((o, i) => [o.value, i])
);

export function sortAndGroupByBranch(rows: PrintEmployee[]): BranchGroup[] {
  const byBranch = new Map<string, PrintEmployee[]>();
  for (const row of rows) {
    const key = row.branch ?? '';
    const list = byBranch.get(key) ?? [];
    list.push(row);
    byBranch.set(key, list);
  }
  const branches = Array.from(byBranch.keys()).sort((a, b) => {
    const ai = a in BRANCH_ORDER ? BRANCH_ORDER[a] : Number.MAX_SAFE_INTEGER;
    const bi = b in BRANCH_ORDER ? BRANCH_ORDER[b] : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
  return branches.map((branch) => ({
    branch,
    employees: (byBranch.get(branch) ?? []).slice().sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' })
    ),
  }));
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/printEmployees.test.ts`

Expected: PASS — all tests green.

- [ ] **Step 1.5: Run typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 1.6: Commit**

```bash
git add lib/printEmployees.ts lib/__tests__/printEmployees.test.ts
git commit -m "feat(print-employees): add pure helpers for print route

- parsePrintParams reads URL query string (all/branch/role/status/search)
- buildPrintApiUrl wraps /api/employees with non-empty filters only
- filterEmployeesForPrint handles the Archived synonym client-side
- sortAndGroupByBranch sorts branches via BRANCH_OPTIONS order, names A-Z

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Build the print page

**Files:**
- Create: `app/dashboard-employee-management/print/page.tsx`

This is the printable client route. It fetches `/api/employees` via the helpers from Task 1, renders a clean layout, and calls `window.print()` after data loads.

- [ ] **Step 2.1: Create the print page**

Create `app/dashboard-employee-management/print/page.tsx` with this content:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parsePrintParams,
  buildPrintApiUrl,
  filterEmployeesForPrint,
  sortAndGroupByBranch,
  type PrintEmployee,
  type PrintParams,
} from "@/lib/printEmployees";
import { getBranchLabel, getRoleLabel } from "@/lib/constants";

type LoadState = "loading" | "ready" | "error" | "empty";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function FilterSummary({ params }: { params: PrintParams }) {
  if (params.all) return <p className="text-sm text-gray-700">Filters: All employees</p>;
  const parts: string[] = [];
  if (params.branch) parts.push(`Branch = ${getBranchLabel(params.branch)}`);
  if (params.role) parts.push(`Role = ${getRoleLabel(params.role)}`);
  if (params.status) parts.push(`Status = ${params.status}`);
  if (params.search) parts.push(`Search = "${params.search}"`);
  return (
    <p className="text-sm text-gray-700">
      Filters: {parts.length === 0 ? "None" : parts.join(", ")}
    </p>
  );
}

export default function PrintEmployeeListPage() {
  const [employees, setEmployees] = useState<PrintEmployee[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  const params: PrintParams = useMemo(() => {
    if (typeof window === "undefined") {
      return { all: false, branch: "", role: "", status: "", search: "" };
    }
    return parsePrintParams(new URLSearchParams(window.location.search));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildPrintApiUrl(params));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PrintEmployee[];
        if (cancelled) return;
        const filtered = filterEmployeesForPrint(data, params.status);
        setEmployees(filtered);
        setState(filtered.length === 0 ? "empty" : "ready");
      } catch (err) {
        console.error("print: failed to load employees", err);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (state === "ready") {
      const t = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  const groups = useMemo(() => sortAndGroupByBranch(employees), [employees]);

  return (
    <div className="bg-white text-gray-900 p-8 max-w-5xl mx-auto">
      <style jsx global>{`
        @page { margin: 1.5cm; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr, .branch-group { break-inside: avoid; }
        }
      `}</style>

      <header className="mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold">Ebright — Employee List</h1>
        <p className="text-sm text-gray-700">Generated: {todayIso()}</p>
        <FilterSummary params={params} />
        {state === "ready" && (
          <p className="text-sm text-gray-700">Total: {employees.length} employees</p>
        )}
      </header>

      {state === "loading" && <p className="text-gray-600">Loading employees…</p>}

      {state === "error" && (
        <div className="text-red-700">
          <p>Failed to load employees. Close this tab and try again.</p>
          <button
            onClick={() => window.close()}
            className="no-print mt-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          >
            Close window
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="text-gray-700">
          <p>No employees match these filters.</p>
          <button
            onClick={() => window.close()}
            className="no-print mt-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          >
            Close window
          </button>
        </div>
      )}

      {state === "ready" && (
        <>
          <div className="no-print mb-4 flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Print again
            </button>
            <button
              onClick={() => window.close()}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
            >
              Close window
            </button>
          </div>

          {groups.map((g) => (
            <section key={g.branch || "_unknown"} className="branch-group mb-6">
              <h2 className="text-lg font-semibold border-b pb-1 mb-2">
                {getBranchLabel(g.branch) || "(No branch)"}{" "}
                <span className="text-sm font-normal text-gray-600">
                  ({g.employees.length})
                </span>
              </h2>
              <table className="w-full text-sm border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-2/5">Name</th>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-1/5">Branch</th>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-1/5">Status</th>
                    <th className="text-left px-2 py-1 border-b border-gray-300 w-1/5">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {g.employees.map((e) => (
                    <tr key={e.id} className="border-b border-gray-200">
                      <td className="px-2 py-1">{e.fullName || "—"}</td>
                      <td className="px-2 py-1">{getBranchLabel(e.branch) || "—"}</td>
                      <td className="px-2 py-1">
                        {e.accessStatus === "ARCHIVED" ? "Archived" : e.Emp_Status || "—"}
                      </td>
                      <td className="px-2 py-1">{getRoleLabel(e.role) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2.2: Run typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 2.3: Smoke-test in dev**

In a separate terminal, run: `npm run dev`

In a browser, log in as a super-admin user and navigate to:
- `http://localhost:3000/dashboard-employee-management/print?all=1`

Expected:
- Page loads, header shows today's date and total count.
- Employees are grouped by branch in `BRANCH_OPTIONS` order (HQ first, then OD, MKT, …).
- Within each branch, names are sorted alphabetically.
- The browser's Print dialog opens automatically after about a quarter-second.
- Cancel the print dialog. The on-screen layout is clean (no sidebar, no app chrome).

Also try `?branch=HQ` — only HQ employees show. Try `?status=Active` — only active rows.

If any of those is wrong, fix before committing.

- [ ] **Step 2.4: Commit**

```bash
git add app/dashboard-employee-management/print/page.tsx
git commit -m "feat(print): add printable employee list route

New /dashboard-employee-management/print client route fetches via existing
/api/employees, applies the client-side status filter, groups by branch,
sorts names A-Z, and auto-fires window.print() once data loads. Permissions
and Academy-stripping carry over from the API unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add "Print List" button + modal to EmployeeTable

**Files:**
- Modify: [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx)

The button lives next to the filter row inside `EmployeeTable` because that's where the four filter state variables (`searchTerm`, `branchFilter`, `roleFilter`, `statusFilter`) already are. It is hidden for Academy users (matching the existing "+ Add User" pattern).

- [ ] **Step 3.1: Add state for the modal**

In [app/components/EmployeeTable.tsx](../../../app/components/EmployeeTable.tsx), find the block of `useState` declarations around lines 60–67:

```tsx
const [employees, setEmployees] = useState<Employee[]>([]);
const [loading, setLoading] = useState(true);
const [searchTerm, setSearchTerm] = useState("");
const [branchFilter, setBranchFilter] = useState("all");
const [roleFilter, setRoleFilter] = useState("all");
const [statusFilter, setStatusFilter] = useState("all");
const [openDropdown, setOpenDropdown] = useState<string | null>(null);
const dropdownRef = useRef<HTMLDivElement>(null);
```

Add a new state variable right after `dropdownRef`:

```tsx
const [printModalOpen, setPrintModalOpen] = useState(false);
```

- [ ] **Step 3.2: Add a helper that opens the print route**

Just above the `return (` statement (around line 165), add:

```tsx
const openPrintRoute = (useCurrentFilters: boolean) => {
  const qs = new URLSearchParams();
  if (useCurrentFilters) {
    if (searchTerm) qs.append("search", searchTerm);
    if (branchFilter !== "all") qs.append("branch", branchFilter);
    if (roleFilter !== "all") qs.append("role", roleFilter);
    if (statusFilter !== "all") qs.append("status", statusFilter);
  } else {
    qs.append("all", "1");
  }
  const url = `/dashboard-employee-management/print?${qs.toString()}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setPrintModalOpen(false);
};
```

- [ ] **Step 3.3: Add the button next to the filter row**

In the same file, find the filter block (around line 170, the `<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">`). Right *before* that grid div, insert a print button row:

```tsx
{!academyView && (
  <div className="flex justify-end mb-4">
    <button
      type="button"
      onClick={() => setPrintModalOpen(true)}
      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow"
    >
      Print List
    </button>
  </div>
)}
```

(`academyView` is already defined on line 69 as `isAcademy(userRole)`.)

- [ ] **Step 3.4: Add the modal markup**

Inside the outermost `<div className="bg-white rounded-lg shadow p-6">` returned by the component, just before its closing `</div>` at the end of the JSX, add:

```tsx
{printModalOpen && (
  <div
    className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
    onClick={() => setPrintModalOpen(false)}
  >
    <div
      className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-lg font-bold mb-2 text-gray-900">Print Employee List</h3>
      <p className="text-sm text-gray-600 mb-4">
        Choose which employees to include. The list opens in a new tab and the print dialog appears automatically.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => openPrintRoute(true)}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
        >
          Print current view
        </button>
        <button
          type="button"
          onClick={() => openPrintRoute(false)}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 text-sm"
        >
          Print all employees
        </button>
        <button
          type="button"
          onClick={() => setPrintModalOpen(false)}
          className="px-4 py-2 rounded bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3.5: Run typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 3.6: Run lint**

Run: `npm run lint`

Expected: no new errors in `app/components/EmployeeTable.tsx` or `app/dashboard-employee-management/print/page.tsx`.

- [ ] **Step 3.7: Smoke-test in browser**

With `npm run dev` running:
1. Log in as a super-admin (non-Academy) user.
2. Navigate to `/dashboard-employee-management`.
3. Confirm the blue "Print List" button is visible above the filter row.
4. Without changing filters, click "Print List" → modal appears with three buttons.
5. Click "Print all employees" → a new tab opens at `/dashboard-employee-management/print?all=1`, list is grouped by branch, the browser Print dialog opens.
6. Back in the dashboard, set Branch = HQ, Status = Active. Click "Print List" → "Print current view" → new tab URL contains `?branch=HQ&status=Active`, the list shows only matching rows.
7. Log out, log in as an Academy user → the "Print List" button is **not** visible (the existing "+ Add User" button should also be hidden, matching the gate).

If any step fails, fix it before committing.

- [ ] **Step 3.8: Commit**

```bash
git add app/components/EmployeeTable.tsx
git commit -m "feat(print): add Print List button + modal to EmployeeTable

Button sits above the filter row (hidden for Academy). Modal offers
'Print current view' (carries searchTerm/branch/role/status as URL params)
or 'Print all employees' (?all=1). Both open the print route in a new tab
so the dashboard's filter state and scroll position are preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Final verification

**Files:** none (manual + automated checks only).

- [ ] **Step 4.1: Run the full unit test suite**

Run: `npx vitest run`

Expected: all tests pass (training, roles, manpowerDashboard, employeeId, printEmployees).

- [ ] **Step 4.2: Production build**

Run: `npm run build`

Expected: build succeeds. The new `/dashboard-employee-management/print` route appears in the route list.

- [ ] **Step 4.3: Manual verification matrix**

With `npm run dev` and a fresh browser session, complete the matrix from the spec's §11:

| Step | Expected |
|---|---|
| Super-admin → dashboard → "Print List" button visible | ✅ |
| Filter by Branch = HQ → Print List → Print current view | New tab, only HQ employees, print dialog opens |
| Print List → Print all employees | New tab, every branch shown in `BRANCH_OPTIONS` order |
| Academy user → dashboard | "Print List" button hidden |
| Direct-nav as Academy to `/print?all=1` | Page renders, network response contains only Academy-permitted fields |
| Print preview (Chrome DevTools "Print" emulation) | Column headers repeat per page; branch groups don't split mid-section when small |

- [ ] **Step 4.4: No final commit needed**

If everything passes, the feature is done. If the matrix surfaces a bug, fix it as a separate commit.
