/**
 * The example household from the scope document.
 *
 * Three roommates with genuinely incompatible schedules and the exact task
 * points the scope names. It exists so the app opens with something meaningful
 * instead of an empty list, and so the tests argue about a realistic household
 * rather than a contrived one.
 */

import { parseClock } from './time';
import type { Weekday } from './time';
import type { AvailabilityWindow, Household, Member, Rules, Task } from './types';
import { DEFAULT_TIMING_WINDOWS } from './types';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

function windows(
  days: Weekday[],
  ranges: Array<[string, string]>,
): AvailabilityWindow[] {
  return days.flatMap((weekday) =>
    ranges.map(([from, to]) => ({
      weekday,
      start: parseClock(from),
      end: parseClock(to),
    })),
  );
}

export const SEED_MEMBERS: Member[] = [
  {
    id: 'member-alex',
    name: 'Alex',
    role: 'admin',
    // Office hours: early mornings and evenings on weekdays, most of the weekend.
    windows: [
      ...windows(WEEKDAYS, [
        ['06:00', '08:00'],
        ['18:00', '23:00'],
      ]),
      ...windows([6, 0], [['09:00', '22:00']]),
    ],
    exceptions: [],
    paused: false,
    color: '#4F7CFF',
  },
  {
    id: 'member-bailey',
    name: 'Bailey',
    role: 'member',
    // Out every weekday evening. This is the case rotation apps get wrong:
    // Bailey must never be handed a night task on a weekday.
    windows: [
      ...windows(WEEKDAYS, [['07:00', '17:00']]),
      ...windows([6], [['07:00', '12:00']]),
    ],
    exceptions: [],
    paused: false,
    color: '#F2994A',
  },
  {
    id: 'member-casey',
    name: 'Casey',
    role: 'member',
    // Afternoons and nights, never a weekday morning.
    windows: [
      ...windows(WEEKDAYS, [['16:00', '23:00']]),
      ...windows([6, 0], [['10:00', '23:00']]),
    ],
    exceptions: [],
    paused: false,
    color: '#27AE60',
  },
];

/** Any Sunday works as the parity anchor for biweekly and every-N-day tasks. */
export const SEED_ANCHOR = '2026-01-04';

export const SEED_TASKS: Task[] = [
  {
    id: 'task-mop',
    name: 'Mop the floors',
    points: 4,
    timing: 'anytime',
    recurrence: { kind: 'weekdays', days: [6] },
    space: 'floors',
    durationMinutes: 45,
  },
  {
    id: 'task-dishload',
    name: 'Load the dishwasher',
    points: 3,
    timing: 'night',
    recurrence: { kind: 'daily' },
    space: 'kitchen',
    durationMinutes: 20,
  },
  {
    id: 'task-kitchen',
    name: 'Kitchen counter + sweep',
    points: 4,
    timing: 'anytime',
    recurrence: { kind: 'everyNDays', n: 2, anchor: SEED_ANCHOR },
    space: 'kitchen',
    durationMinutes: 30,
  },
  {
    id: 'task-unload',
    name: 'Unload the dishwasher',
    points: 2,
    timing: 'morning',
    recurrence: { kind: 'daily' },
    space: 'kitchen',
    durationMinutes: 15,
  },
  {
    id: 'task-garbage',
    name: 'Take out the garbage',
    points: 2,
    timing: 'night',
    recurrence: { kind: 'weekdays', days: [1, 4] },
    durationMinutes: 10,
  },
  {
    id: 'task-fridge',
    name: 'Clean out the fridge',
    points: 0,
    timing: 'anytime',
    recurrence: { kind: 'biweekly', days: [0], anchor: SEED_ANCHOR },
    space: 'kitchen',
    groupTask: true,
    durationMinutes: 30,
    notes: 'Everyone together. No points — nobody owns it.',
  },
];

export const SEED_RULES: Rules = {
  timingWindows: DEFAULT_TIMING_WINDOWS,
  blackouts: [],
  // Loading the dishwasher and doing the counters on the same day is one long
  // kitchen shift for one person. Split them.
  taskPairExclusions: [['task-kitchen', 'task-dishload']],
  coLocationLimits: [{ space: 'kitchen', maxConcurrent: 2 }],
  // Soft: mornings run smoother when the unload stays with one person.
  preferences: [{ taskId: 'task-unload', memberId: 'member-bailey', weight: 2 }],
  // Soft: weekend load leans toward whoever is actually home.
  loadShifting: [{ weekdays: [0, 6], weight: 1 }],
  balanceTolerance: 3,
  carryOverPreviousImbalance: true,
  defaultDurationMinutes: 15,
};

export function seedHousehold(): Household {
  return {
    id: 'household-demo',
    name: 'Our place',
    members: SEED_MEMBERS.map((m) => ({ ...m })),
    tasks: SEED_TASKS.map((t) => ({ ...t })),
    rules: {
      ...SEED_RULES,
      blackouts: [...SEED_RULES.blackouts],
      taskPairExclusions: SEED_RULES.taskPairExclusions.map(
        (pair) => [...pair] as [string, string],
      ),
      coLocationLimits: SEED_RULES.coLocationLimits.map((l) => ({ ...l })),
      preferences: SEED_RULES.preferences.map((p) => ({ ...p })),
      loadShifting: SEED_RULES.loadShifting.map((r) => ({ ...r })),
    },
  };
}
