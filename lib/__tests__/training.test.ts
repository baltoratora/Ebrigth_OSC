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
