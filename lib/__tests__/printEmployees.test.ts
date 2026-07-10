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
    expect(url).toBe('/api/employees?search=ali&branch=HQ&role=BM');
  });

  it('omits empty filters', () => {
    expect(
      buildPrintApiUrl({ all: false, branch: 'HQ', role: '', status: '', search: '' })
    ).toBe('/api/employees?branch=HQ');
  });

  it('returns bare /api/employees when all is false and every filter is empty', () => {
    expect(
      buildPrintApiUrl({ all: false, branch: '', role: '', status: '', search: '' })
    ).toBe('/api/employees');
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

  it('filters by Emp_Status (mirrors EmployeeTable: does not exclude ARCHIVED rows)', () => {
    // Matches EmployeeTable.tsx:159-163 — Active/Inactive matches Emp_Status only.
    expect(filterEmployeesForPrint(sample, 'Active').map((e) => e.id)).toEqual(['1', '3', '4']);
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
