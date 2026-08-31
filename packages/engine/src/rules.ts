/**
 * Household rules.
 *
 * The important distinction in this file: hard rules are filters, soft rules
 * are costs. A hard rule removes a member from consideration entirely, so no
 * amount of balancing pressure can talk the scheduler into breaking one. Soft
 * rules only tilt the choice between members who are all already allowed.
 */

import { weekdayOf } from './time';
import type { ISODate } from './time';
import type {
  Assignment,
  Blackout,
  MemberId,
  Preference,
  Rules,
  Task,
  TaskId,
} from './types';

// ---------------------------------------------------------------------------
// Hard rules
// ---------------------------------------------------------------------------

/** Is this member blacked out on this date? */
export function isBlackedOut(
  blackouts: Blackout[],
  memberId: MemberId,
  date: ISODate,
): boolean {
  const weekday = weekdayOf(date);
  return blackouts.some((b) => {
    if (b.memberId !== memberId) return false;
    if (b.dates?.includes(date)) return true;
    if (b.weekdays?.includes(weekday)) return true;
    return false;
  });
}

/** The tasks that may not share a day with `taskId` for one member. */
export function excludedPartners(
  exclusions: Array<[TaskId, TaskId]>,
  taskId: TaskId,
): TaskId[] {
  const partners: TaskId[] = [];
  for (const [a, b] of exclusions) {
    if (a === taskId) partners.push(b);
    else if (b === taskId) partners.push(a);
  }
  return partners;
}

/**
 * Would giving `taskId` on `date` to `memberId` put two mutually-excluded tasks
 * on the same person on the same day? (Nobody gets kitchen and dishloading
 * together.)
 */
export function violatesPairExclusion(
  rules: Rules,
  assignments: readonly Assignment[],
  memberId: MemberId,
  taskId: TaskId,
  date: ISODate,
  ignoreInstanceId?: string,
): boolean {
  const partners = excludedPartners(rules.taskPairExclusions, taskId);
  if (partners.length === 0) return false;
  return assignments.some(
    (a) =>
      a.memberId === memberId &&
      a.date === date &&
      a.instanceId !== ignoreInstanceId &&
      partners.includes(a.taskId),
  );
}

/**
 * Would this assignment put too many people in one room at once?
 *
 * At once means the same space, same date, same timing block: two people
 * scrubbing the kitchen at 8am collide, one at 8am and one at 8pm do not.
 */
export function violatesCoLocation(
  rules: Rules,
  tasksById: ReadonlyMap<TaskId, Task>,
  assignments: readonly Assignment[],
  memberId: MemberId,
  taskId: TaskId,
  date: ISODate,
  ignoreInstanceId?: string,
): boolean {
  const task = tasksById.get(taskId);
  if (!task?.space) return false;

  const limit = rules.coLocationLimits.find((l) => l.space === task.space);
  if (!limit) return false;

  const occupants = new Set<MemberId>([memberId]);
  for (const a of assignments) {
    if (a.date !== date) continue;
    if (a.instanceId === ignoreInstanceId) continue;
    const other = tasksById.get(a.taskId);
    if (!other || other.space !== task.space) continue;
    if (other.timing !== task.timing) continue;
    occupants.add(a.memberId);
  }
  return occupants.size > limit.maxConcurrent;
}

// ---------------------------------------------------------------------------
// Soft rules
// ---------------------------------------------------------------------------

/** Total weight of preferences naming this member for this task. */
export function preferenceWeight(
  preferences: Preference[],
  taskId: TaskId,
  memberId: MemberId,
): number {
  return preferences.reduce(
    (sum, p) =>
      p.taskId === taskId && p.memberId === memberId ? sum + p.weight : sum,
    0,
  );
}

/** The best preference weight any member has for this task, for normalising. */
export function bestPreferenceWeight(
  preferences: Preference[],
  taskId: TaskId,
): number {
  return preferences.reduce(
    (best, p) => (p.taskId === taskId ? Math.max(best, p.weight) : best),
    0,
  );
}

/** The load-shifting weight in effect on this date, if any. */
export function loadShiftWeight(rules: Rules, date: ISODate): number {
  const weekday = weekdayOf(date);
  return rules.loadShifting.reduce(
    (sum, r) => (r.weekdays.includes(weekday) ? sum + r.weight : sum),
    0,
  );
}
