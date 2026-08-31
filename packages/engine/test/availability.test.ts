import { describe, expect, it } from 'vitest';
import {
  availableMinutesOn,
  canWork,
  longestFreeBlock,
  relativeAvailability,
  windowsOn,
} from '../src/availability';
import { parseClock } from '../src/time';
import { DEFAULT_TIMING_WINDOWS } from '../src/types';
import type { Member, Task } from '../src/types';

// 2026-09-07 is a Monday, 2026-09-12 a Saturday.
const MONDAY = '2026-09-07';
const SATURDAY = '2026-09-12';

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    name: 'Test',
    role: 'member',
    windows: [{ weekday: 1, start: parseClock('09:00'), end: parseClock('17:00') }],
    exceptions: [],
    paused: false,
    ...overrides,
  };
}

const nightTask: Task = {
  id: 'task-night',
  name: 'Night task',
  points: 3,
  timing: 'night',
  recurrence: { kind: 'daily' },
  durationMinutes: 20,
};

describe('windowsOn', () => {
  it('returns the weekly pattern for that weekday', () => {
    expect(windowsOn(member(), MONDAY)).toHaveLength(1);
    expect(windowsOn(member(), SATURDAY)).toHaveLength(0);
  });

  it('lets a one-off exception replace the weekly pattern entirely', () => {
    const m = member({
      exceptions: [
        {
          date: MONDAY,
          windows: [{ weekday: 1, start: parseClock('20:00'), end: parseClock('22:00') }],
        },
      ],
    });
    expect(windowsOn(m, MONDAY)).toEqual([
      { weekday: 1, start: 1200, end: 1320 },
    ]);
  });

  it('treats an empty exception as away all day', () => {
    const m = member({ exceptions: [{ date: MONDAY, windows: [], note: 'Travelling' }] });
    expect(windowsOn(m, MONDAY)).toHaveLength(0);
    expect(availableMinutesOn(m, MONDAY)).toBe(0);
  });
});

describe('longestFreeBlock', () => {
  it('measures the longest single stretch, never the sum of scraps', () => {
    const m = member({
      windows: [
        { weekday: 1, start: parseClock('18:00'), end: parseClock('18:10') },
        { weekday: 1, start: parseClock('19:00'), end: parseClock('19:10') },
        { weekday: 1, start: parseClock('20:00'), end: parseClock('20:10') },
      ],
    });
    // Half an hour of free time in total, but never more than ten minutes at once.
    expect(availableMinutesOn(m, MONDAY, DEFAULT_TIMING_WINDOWS.night)).toBe(30);
    expect(longestFreeBlock(m, MONDAY, DEFAULT_TIMING_WINDOWS.night)).toBe(10);
    expect(canWork(m, nightTask, MONDAY, DEFAULT_TIMING_WINDOWS, 15)).toBe(false);
  });
});

describe('canWork', () => {
  it('refuses a night task to someone who is gone by five', () => {
    // The headline case: rotation apps hand this out anyway.
    const gone = member({
      windows: [{ weekday: 1, start: parseClock('07:00'), end: parseClock('17:00') }],
    });
    expect(canWork(gone, nightTask, MONDAY, DEFAULT_TIMING_WINDOWS, 15)).toBe(false);
  });

  it('allows it to someone whose evening is free', () => {
    const home = member({
      windows: [{ weekday: 1, start: parseClock('16:00'), end: parseClock('23:00') }],
    });
    expect(canWork(home, nightTask, MONDAY, DEFAULT_TIMING_WINDOWS, 15)).toBe(true);
  });

  it('refuses everything to a paused member', () => {
    const paused = member({
      paused: true,
      windows: [{ weekday: 1, start: parseClock('06:00'), end: parseClock('23:00') }],
    });
    expect(canWork(paused, nightTask, MONDAY, DEFAULT_TIMING_WINDOWS, 15)).toBe(false);
  });

  it('refuses a task longer than the free block, even inside the window', () => {
    const brief = member({
      windows: [{ weekday: 1, start: parseClock('20:00'), end: parseClock('20:15') }],
    });
    expect(canWork(brief, nightTask, MONDAY, DEFAULT_TIMING_WINDOWS, 15)).toBe(false);
  });
});

describe('relativeAvailability', () => {
  it('scores members against whoever is most free that day', () => {
    const busy = member({
      id: 'busy',
      windows: [{ weekday: 1, start: parseClock('18:00'), end: parseClock('20:00') }],
    });
    const free = member({
      id: 'free',
      windows: [{ weekday: 1, start: parseClock('12:00'), end: parseClock('20:00') }],
    });
    const roster = [busy, free];
    expect(relativeAvailability(free, MONDAY, roster)).toBe(1);
    expect(relativeAvailability(busy, MONDAY, roster)).toBeCloseTo(0.25);
  });

  it('scores zero when nobody is free', () => {
    const m = member({ windows: [] });
    expect(relativeAvailability(m, MONDAY, [m])).toBe(0);
  });
});
