import { describe, expect, it } from 'vitest';
import { expandTask, expandTasks, nextOccurrence, occursOn } from '../src/recurrence';
import type { Recurrence, Task } from '../src/types';

const base: Omit<Task, 'id' | 'recurrence'> = {
  name: 'Test task',
  points: 1,
  timing: 'anytime',
};

function task(id: string, recurrence: Task['recurrence']): Task {
  return { ...base, id, recurrence };
}

describe('occursOn', () => {
  it('fires daily tasks every day', () => {
    expect(occursOn({ kind: 'daily' }, '2026-09-07')).toBe(true);
    expect(occursOn({ kind: 'daily' }, '2026-09-08')).toBe(true);
  });

  it('fires weekday tasks only on the listed days', () => {
    const mondaysAndThursdays: Recurrence = { kind: 'weekdays', days: [1, 4] };
    expect(occursOn(mondaysAndThursdays, '2026-09-07')).toBe(true); // Monday
    expect(occursOn(mondaysAndThursdays, '2026-09-10')).toBe(true); // Thursday
    expect(occursOn(mondaysAndThursdays, '2026-09-08')).toBe(false);
  });

  it('counts every-N-days forward from the anchor and never before it', () => {
    const everyThird: Recurrence = {
      kind: 'everyNDays',
      n: 3,
      anchor: '2026-09-07',
    };
    expect(occursOn(everyThird, '2026-09-07')).toBe(true);
    expect(occursOn(everyThird, '2026-09-10')).toBe(true);
    expect(occursOn(everyThird, '2026-09-09')).toBe(false);
    expect(occursOn(everyThird, '2026-09-04')).toBe(false);
  });

  it('keeps both days of a biweekly task inside the same week', () => {
    // Anchored on a Sunday, running Mondays and Thursdays.
    const biweekly: Recurrence = {
      kind: 'biweekly',
      days: [1, 4],
      anchor: '2026-09-06',
    };

    expect(occursOn(biweekly, '2026-09-07')).toBe(true); // Mon, week 0
    expect(occursOn(biweekly, '2026-09-10')).toBe(true); // Thu, same week
    expect(occursOn(biweekly, '2026-09-14')).toBe(false); // Mon, week 1
    expect(occursOn(biweekly, '2026-09-21')).toBe(true); // Mon, week 2
  });

  it('fires a one-off task on exactly one date', () => {
    const once: Recurrence = { kind: 'once', date: '2026-09-09' };
    expect(occursOn(once, '2026-09-09')).toBe(true);
    expect(occursOn(once, '2026-09-10')).toBe(false);
  });
});

describe('expansion', () => {
  it('produces one instance per occurrence, with stable ids', () => {
    const instances = expandTask(
      task('task-a', { kind: 'weekdays', days: [1] }),
      '2026-09-07',
      '2026-09-20',
    );
    expect(instances.map((i) => i.date)).toEqual(['2026-09-07', '2026-09-14']);
    expect(instances[0]?.id).toBe('task-a@2026-09-07');
  });

  it('skips tasks that have been switched off', () => {
    const inactive: Task = {
      ...task('task-off', { kind: 'daily' }),
      active: false,
    };
    expect(expandTask(inactive, '2026-09-07', '2026-09-13')).toHaveLength(0);
  });

  it('orders a mixed set by date, then task, so output is reproducible', () => {
    const instances = expandTasks(
      [
        task('task-z', { kind: 'daily' }),
        task('task-a', { kind: 'daily' }),
      ],
      '2026-09-07',
      '2026-09-08',
    );
    expect(instances.map((i) => i.id)).toEqual([
      'task-a@2026-09-07',
      'task-z@2026-09-07',
      'task-a@2026-09-08',
      'task-z@2026-09-08',
    ]);
  });

  it('finds the next occurrence, or reports there is none', () => {
    expect(
      nextOccurrence({ kind: 'weekdays', days: [6] }, '2026-09-07'),
    ).toBe('2026-09-12');
    expect(
      nextOccurrence({ kind: 'once', date: '2026-01-01' }, '2026-09-07'),
    ).toBeNull();
  });
});
