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
  if (status === 'Archived') return rows.filter((e) => (e.accessStatus ?? '') === 'ARCHIVED');
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
    const ai = a !== '' && a in BRANCH_ORDER ? BRANCH_ORDER[a] : Number.MAX_SAFE_INTEGER;
    const bi = b !== '' && b in BRANCH_ORDER ? BRANCH_ORDER[b] : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    // Put empty string last among unknowns
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    return a.localeCompare(b);
  });
  return branches.map((branch) => ({
    branch,
    employees: (byBranch.get(branch) ?? []).slice().sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' })
    ),
  }));
}
