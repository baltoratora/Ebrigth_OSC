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
