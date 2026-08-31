/**
 * Who is actually free, and when.
 *
 * This is the half of ChoreShift that ordinary rotation apps skip. A task with
 * a `night` timing is only offered to members whose availability covers the
 * household's night window on that specific date — so a 9pm dish load never
 * lands on the person who is out by five.
 */

import { overlapMinutes, weekdayOf } from './time';
import type { ISODate, Minutes } from './time';
import type {
  AvailabilityWindow,
  ClockRange,
  Member,
  Task,
  Timing,
  TimingWindows,
} from './types';

/**
 * The windows that apply to a member on one date.
 *
 * A one-off exception replaces the weekly pattern for that date completely,
 * including replacing it with nothing — that is how "I'm away Saturday" is
 * expressed.
 */
export function windowsOn(member: Member, date: ISODate): AvailabilityWindow[] {
  const exception = member.exceptions.find((e) => e.date === date);
  if (exception) return exception.windows;
  const weekday = weekdayOf(date);
  return member.windows.filter((w) => w.weekday === weekday);
}

/** Total free minutes a member has on a date, within an optional range. */
export function availableMinutesOn(
  member: Member,
  date: ISODate,
  range?: ClockRange,
): number {
  const start = range?.start ?? 0;
  const end = range?.end ?? 24 * 60;
  return windowsOn(member, date).reduce(
    (total, w) => total + overlapMinutes(w.start, w.end, start, end),
    0,
  );
}

/**
 * The longest *contiguous* stretch a member has inside `range` on `date`.
 *
 * Contiguity is the point: three scattered ten-minute gaps do not add up to a
 * half-hour mop, so we never sum them.
 */
export function longestFreeBlock(
  member: Member,
  date: ISODate,
  range: ClockRange,
): number {
  let longest = 0;
  for (const w of windowsOn(member, date)) {
    const shared = overlapMinutes(w.start, w.end, range.start, range.end);
    if (shared > longest) longest = shared;
  }
  return longest;
}

export function windowFor(timing: Timing, windows: TimingWindows): ClockRange {
  return windows[timing];
}

/** How long a member needs to be free to take this task on. */
export function requiredMinutes(task: Task, fallback: Minutes): number {
  return task.durationMinutes ?? fallback;
}

/**
 * Can this member do this task on this date?
 *
 * Paused members are out. Everyone else needs one uninterrupted block inside
 * the task's timing window that is at least as long as the task takes.
 */
export function canWork(
  member: Member,
  task: Task,
  date: ISODate,
  timingWindows: TimingWindows,
  defaultDuration: Minutes,
): boolean {
  if (member.paused) return false;
  const range = windowFor(task.timing, timingWindows);
  const needed = requiredMinutes(task, defaultDuration);
  return longestFreeBlock(member, date, range) >= needed;
}

/**
 * A 0..1 measure of how free a member is on a date, relative to the most
 * available member that day. Used by load-shifting rules to favour whoever is
 * genuinely home.
 */
export function relativeAvailability(
  member: Member,
  date: ISODate,
  members: Member[],
): number {
  const mine = availableMinutesOn(member, date);
  let best = 0;
  for (const other of members) {
    if (other.paused) continue;
    const theirs = availableMinutesOn(other, date);
    if (theirs > best) best = theirs;
  }
  return best === 0 ? 0 : mine / best;
}
