/**
 * Turning recurring tasks into dated instances.
 *
 * The scheduler never reasons about "the mop task" — it reasons about "the mop
 * task on Tuesday the 2nd". This module is the bridge.
 */

import { addDays, datesInRange, daysBetween, startOfWeek, weekdayOf } from './time';
import type { ISODate } from './time';
import type { Recurrence, Task, TaskInstance } from './types';

/** Does this recurrence produce an occurrence on this date? */
export function occursOn(recurrence: Recurrence, date: ISODate): boolean {
  switch (recurrence.kind) {
    case 'daily':
      return true;

    case 'weekdays':
      return recurrence.days.includes(weekdayOf(date));

    case 'everyNDays': {
      if (recurrence.n <= 0) return false;
      const elapsed = daysBetween(recurrence.anchor, date);
      return elapsed >= 0 && elapsed % recurrence.n === 0;
    }

    case 'biweekly': {
      if (!recurrence.days.includes(weekdayOf(date))) return false;
      // Parity is measured week-to-week, not day-to-day, so a biweekly task
      // that runs Mon+Thu keeps both days in the same week as each other.
      const weeks = Math.floor(
        daysBetween(startOfWeek(recurrence.anchor), date) / 7,
      );
      return weeks >= 0 && weeks % 2 === 0;
    }

    case 'once':
      return recurrence.date === date;

    default:
      return false;
  }
}

export function instanceId(taskId: string, date: ISODate): string {
  return `${taskId}@${date}`;
}

/** Every occurrence of one task between two dates, inclusive. */
export function expandTask(
  task: Task,
  start: ISODate,
  end: ISODate,
): TaskInstance[] {
  if (task.active === false) return [];
  return datesInRange(start, end)
    .filter((date) => occursOn(task.recurrence, date))
    .map((date) => ({ id: instanceId(task.id, date), taskId: task.id, date }));
}

/**
 * Every occurrence of every task in the period, ordered by date and then by
 * task id so the output is stable across runs.
 */
export function expandTasks(
  tasks: Task[],
  start: ISODate,
  end: ISODate,
): TaskInstance[] {
  const instances = tasks.flatMap((task) => expandTask(task, start, end));
  return instances.sort(
    (a, b) => a.date.localeCompare(b.date) || a.taskId.localeCompare(b.taskId),
  );
}

/** The next date on or after `from` on which this recurrence fires. */
export function nextOccurrence(
  recurrence: Recurrence,
  from: ISODate,
  horizonDays = 366,
): ISODate | null {
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addDays(from, i);
    if (occursOn(recurrence, date)) return date;
  }
  return null;
}
