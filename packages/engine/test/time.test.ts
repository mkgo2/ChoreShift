import { describe, expect, it } from 'vitest';
import {
  addDays,
  datesInRange,
  daysBetween,
  formatClock,
  overlapMinutes,
  parseClock,
  startOfWeek,
  weekdayOf,
} from '../src/time';

describe('date arithmetic', () => {
  it('reads weekdays without letting the local timezone shift them', () => {
    // 2026-01-04 is a Sunday; the seed data leans on that.
    expect(weekdayOf('2026-01-04')).toBe(0);
    expect(weekdayOf('2026-01-05')).toBe(1);
    expect(weekdayOf('2026-01-10')).toBe(6);
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('counts days in both directions', () => {
    expect(daysBetween('2026-09-07', '2026-09-13')).toBe(6);
    expect(daysBetween('2026-09-13', '2026-09-07')).toBe(-6);
  });

  it('walks a range inclusively', () => {
    expect(datesInRange('2026-09-07', '2026-09-09')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
    expect(datesInRange('2026-09-09', '2026-09-07')).toEqual([]);
  });

  it('snaps to the Sunday that starts the week', () => {
    expect(startOfWeek('2026-09-09')).toBe('2026-09-06');
    expect(startOfWeek('2026-09-06')).toBe('2026-09-06');
  });
});

describe('clock times', () => {
  it('round-trips HH:MM', () => {
    expect(parseClock('07:30')).toBe(450);
    expect(formatClock(450)).toBe('07:30');
    expect(formatClock(parseClock('23:00'))).toBe('23:00');
  });

  it('rejects nonsense times', () => {
    expect(() => parseClock('25:00')).toThrow();
    expect(() => parseClock('7pm')).toThrow();
  });

  it('measures interval overlap, and reports none when they miss', () => {
    expect(overlapMinutes(360, 480, 420, 600)).toBe(60);
    expect(overlapMinutes(360, 480, 480, 600)).toBe(0);
    expect(overlapMinutes(360, 480, 900, 1000)).toBe(0);
  });
});
