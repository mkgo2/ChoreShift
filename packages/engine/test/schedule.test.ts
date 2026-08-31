import { beforeAll, describe, expect, it } from 'vitest';
import { canWork } from '../src/availability';
import { carryOverFrom, indexTasks } from '../src/balance';
import { generateSchedule } from '../src/schedule';
import { seedHousehold } from '../src/seed';
import { parseClock } from '../src/time';
import { DEFAULT_RULES, DEFAULT_TIMING_WINDOWS } from '../src/types';
import type {
  Assignment,
  Household,
  Member,
  ScheduleResult,
  Task,
} from '../src/types';

// A full week: Monday 2026-09-07 through Sunday 2026-09-13.
const WEEK = { start: '2026-09-07', end: '2026-09-13' } as const;
const NEXT_WEEK = { start: '2026-09-14', end: '2026-09-20' } as const;

/** Nobody may hold a task they are not actually free for. The core promise. */
function expectAvailabilityRespected(
  household: Household,
  result: ScheduleResult,
): void {
  const tasksById = indexTasks(household.tasks);
  for (const a of result.assignments) {
    const member = household.members.find((m) => m.id === a.memberId);
    const task = tasksById.get(a.taskId);
    expect(member, `unknown member on ${a.instanceId}`).toBeDefined();
    expect(task, `unknown task on ${a.instanceId}`).toBeDefined();
    if (!member || !task) continue;

    const ok = canWork(
      member,
      task,
      a.date,
      household.rules.timingWindows,
      household.rules.defaultDurationMinutes,
    );
    expect(
      ok,
      `${member.name} was given "${task.name}" (${task.timing}) on ${a.date} ` +
        'but is not free then',
    ).toBe(true);
  }
}

function pointsFor(household: Household, result: ScheduleResult, id: string): number {
  return result.balance.find((b) => b.memberId === id)?.points ?? 0;
}

describe('the example household, over one week', () => {
  const household = seedHousehold();
  let result: ScheduleResult;

  beforeAll(() => {
    result = generateSchedule(household, { ...WEEK, seed: 7 });
  });

  it('places every task instance', () => {
    expect(result.unassigned).toEqual([]);
    // 7 unloads + 7 dish loads + 4 kitchen + 2 garbage + 1 mop.
    expect(result.assignments).toHaveLength(21);
  });

  it('never assigns anyone a task they are not free for', () => {
    expectAvailabilityRespected(household, result);
  });

  it('never gives Bailey a weekday night task', () => {
    // Bailey is out every weekday evening. This is the exact failure mode the
    // app exists to prevent, so it gets its own test.
    const baileysNightWork = result.assignments.filter((a) => {
      if (a.memberId !== 'member-bailey') return false;
      const task = household.tasks.find((t) => t.id === a.taskId);
      return task?.timing === 'night';
    });
    expect(baileysNightWork).toEqual([]);
  });

  it('balances effort to within the household tolerance', () => {
    expect(result.gap).toBeLessThanOrEqual(household.rules.balanceTolerance);
    expect(result.withinTolerance).toBe(true);
  });

  it('balances points rather than task counts', () => {
    // The whole thesis: an even split of *effort* need not be an even split of
    // chores, and the point totals are what have to line up.
    const points = result.balance.map((b) => b.points);
    expect(Math.max(...points) - Math.min(...points)).toBeLessThanOrEqual(3);
  });

  it('honours the task-pair exclusion', () => {
    const perMemberDay = new Map<string, Set<string>>();
    for (const a of result.assignments) {
      const key = `${a.memberId}|${a.date}`;
      const set = perMemberDay.get(key) ?? new Set<string>();
      set.add(a.taskId);
      perMemberDay.set(key, set);
    }
    for (const [key, tasks] of perMemberDay) {
      expect(
        tasks.has('task-kitchen') && tasks.has('task-dishload'),
        `${key} got both kitchen and dishloading on one day`,
      ).toBe(false);
    }
  });

  it('keeps group tasks out of the point totals', () => {
    // The fridge is done together and owned by nobody.
    expect(result.groupInstances.map((i) => i.taskId)).toEqual(['task-fridge']);
    expect(result.assignments.some((a) => a.taskId === 'task-fridge')).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const again = generateSchedule(household, { ...WEEK, seed: 7 });
    expect(again.assignments).toEqual(result.assignments);
    expect(again.gap).toBe(result.gap);
  });

  it('produces a different but equally fair schedule for a different seed', () => {
    const other = generateSchedule(household, { ...WEEK, seed: 99 });
    expectAvailabilityRespected(household, other);
    expect(other.unassigned).toEqual([]);
    expect(other.withinTolerance).toBe(true);
  });
});

describe('manual override', () => {
  const household = seedHousehold();

  it('keeps a locked assignment and rebalances everything else around it', () => {
    const first = generateSchedule(household, { ...WEEK, seed: 3 });

    // Pin the Saturday mop on someone the scheduler did not choose.
    const mop = first.assignments.find((a) => a.taskId === 'task-mop');
    expect(mop).toBeDefined();
    if (!mop) return;

    const other = ['member-alex', 'member-bailey', 'member-casey'].find(
      (id) => id !== mop.memberId,
    );
    expect(other).toBeDefined();
    if (!other) return;

    const locked: Assignment[] = [{ ...mop, memberId: other, locked: true }];
    const second = generateSchedule(household, { ...WEEK, seed: 3, locked });

    const pinned = second.assignments.find((a) => a.taskId === 'task-mop');
    expect(pinned?.memberId).toBe(other);
    expect(pinned?.locked).toBe(true);

    // The rest of the week still has to work.
    expectAvailabilityRespected(household, second);
    expect(second.unassigned).toEqual([]);
    expect(second.withinTolerance).toBe(true);
  });

  it('limits churn when the household changes under an existing schedule', () => {
    // Adding a task should not reshuffle a week people have already memorised.
    // Passing the old schedule as `previous` is what holds it steady — but only
    // as a soft preference, so fairness still wins where the two disagree.
    const withExtraTask = (): Household => {
      const next = seedHousehold();
      next.tasks.push({
        id: 'task-vacuum',
        name: 'Vacuum the hall',
        points: 3,
        timing: 'anytime',
        recurrence: { kind: 'weekdays', days: [3] },
        durationMinutes: 20,
      });
      return next;
    };

    for (const seed of [3, 4, 5, 6, 7]) {
      const before = generateSchedule(household, { ...WEEK, seed });
      const changed = withExtraTask();

      const blind = generateSchedule(changed, { ...WEEK, seed });
      const aware = generateSchedule(changed, {
        ...WEEK,
        seed,
        previous: before.assignments,
      });

      const retained = (result: ScheduleResult): number =>
        result.assignments.filter((a) =>
          before.assignments.some(
            (b) => b.instanceId === a.instanceId && b.memberId === a.memberId,
          ),
        ).length;

      expect(
        retained(aware),
        `seed ${seed}: knowing the previous week should not make it worse`,
      ).toBeGreaterThanOrEqual(retained(blind));

      // Stability must never cost fairness.
      expect(aware.withinTolerance).toBe(true);
      expect(aware.gap).toBeLessThanOrEqual(blind.gap);
    }
  });
});

describe('paused members', () => {
  it('gets nothing while paused, and the rest still balances', () => {
    const household = seedHousehold();
    const bailey = household.members.find((m) => m.id === 'member-bailey');
    expect(bailey).toBeDefined();
    if (bailey) bailey.paused = true;

    const result = generateSchedule(household, { ...WEEK, seed: 11 });

    expect(
      result.assignments.some((a) => a.memberId === 'member-bailey'),
    ).toBe(false);
    expect(pointsFor(household, result, 'member-bailey')).toBe(0);
    expectAvailabilityRespected(household, result);
  });
});

describe('impossible work is reported, never forced', () => {
  it('explains a night task nobody can take', () => {
    const daytimeOnly: Member = {
      id: 'm-day',
      name: 'Dayshift',
      role: 'admin',
      windows: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday: weekday as 1 | 2 | 3 | 4 | 5,
        start: parseClock('08:00'),
        end: parseClock('16:00'),
      })),
      exceptions: [],
      paused: false,
    };
    const nightTask: Task = {
      id: 'task-late',
      name: 'Late lockup',
      points: 3,
      timing: 'night',
      recurrence: { kind: 'weekdays', days: [1] },
    };

    const household: Household = {
      id: 'h',
      name: 'Impossible',
      members: [daytimeOnly],
      tasks: [nightTask],
      rules: { ...DEFAULT_RULES },
    };

    const result = generateSchedule(household, { ...WEEK });

    expect(result.assignments).toHaveLength(0);
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.reason).toBe('no-member-available');
    expect(result.unassigned[0]?.taskName).toBe('Late lockup');
    expect(result.unassigned[0]?.detail).toContain('18:00');
  });

  it('reports everything when the whole household is paused', () => {
    const household = seedHousehold();
    for (const m of household.members) m.paused = true;

    const result = generateSchedule(household, { ...WEEK });

    expect(result.assignments).toHaveLength(0);
    expect(result.unassigned.length).toBeGreaterThan(0);
    expect(
      result.unassigned.every((u) => u.reason === 'no-active-members'),
    ).toBe(true);
  });
});

describe('co-location limits', () => {
  it('never puts more people in a room than the limit allows', () => {
    const alwaysFree = (id: string, name: string): Member => ({
      id,
      name,
      role: 'member',
      windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday: weekday as 0,
        start: parseClock('06:00'),
        end: parseClock('23:00'),
      })),
      exceptions: [],
      paused: false,
    });

    const kitchenTask = (id: string, points: number): Task => ({
      id,
      name: id,
      points,
      timing: 'anytime',
      recurrence: { kind: 'once', date: '2026-09-07' },
      space: 'kitchen',
      durationMinutes: 20,
    });

    const household: Household = {
      id: 'h',
      name: 'Small kitchen',
      members: [
        alwaysFree('a', 'A'),
        alwaysFree('b', 'B'),
        alwaysFree('c', 'C'),
      ],
      tasks: [kitchenTask('t1', 2), kitchenTask('t2', 2), kitchenTask('t3', 2)],
      rules: {
        ...DEFAULT_RULES,
        timingWindows: DEFAULT_TIMING_WINDOWS,
        coLocationLimits: [{ space: 'kitchen', maxConcurrent: 1 }],
        balanceTolerance: 6,
      },
    };

    const result = generateSchedule(household, { ...WEEK, seed: 2 });

    // One person at a time means one person does all three.
    const occupants = new Set(result.assignments.map((a) => a.memberId));
    expect(occupants.size).toBeLessThanOrEqual(1);
    expect(result.assignments).toHaveLength(3);
  });
});

describe('history-aware balancing', () => {
  it('hands less work to whoever ran heavy last period', () => {
    const household = seedHousehold();

    const withoutHistory = generateSchedule(household, { ...NEXT_WEEK, seed: 4 });
    const alexBaseline = pointsFor(household, withoutHistory, 'member-alex');

    // Alex finished last week twelve points ahead of the pack.
    const carryOver = carryOverFrom([
      { memberId: 'member-alex', name: 'Alex', points: 12, taskCount: 0, carriedOver: 0 },
      { memberId: 'member-bailey', name: 'Bailey', points: 0, taskCount: 0, carriedOver: 0 },
      { memberId: 'member-casey', name: 'Casey', points: 0, taskCount: 0, carriedOver: 0 },
    ]);

    const withHistory = generateSchedule(household, {
      ...NEXT_WEEK,
      seed: 4,
      carryOver,
    });

    const alexCarried =
      withHistory.balance.find((b) => b.memberId === 'member-alex')?.carriedOver ?? 0;
    const alexEarned =
      pointsFor(household, withHistory, 'member-alex') - alexCarried;

    expect(alexCarried).toBeGreaterThan(0);
    expect(alexEarned).toBeLessThan(alexBaseline);
    expectAvailabilityRespected(household, withHistory);
  });

  it('turns a finished balance into offsets that sum to zero', () => {
    const offsets = carryOverFrom([
      { memberId: 'a', name: 'A', points: 10, taskCount: 0, carriedOver: 0 },
      { memberId: 'b', name: 'B', points: 20, taskCount: 0, carriedOver: 0 },
    ]);
    expect(offsets.a).toBe(-5);
    expect(offsets.b).toBe(5);
  });
});
