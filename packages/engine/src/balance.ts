/**
 * Fairness accounting.
 *
 * Everything here counts points, never tasks. Someone who mopped once has done
 * more than someone who took the garbage out twice, and the whole app exists to
 * make that difference visible.
 */

import type {
  Assignment,
  Member,
  MemberBalance,
  MemberId,
  Task,
  TaskId,
} from './types';

export function indexTasks(tasks: Task[]): Map<TaskId, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

/** Points a task contributes to a member's total. Group tasks are worth zero. */
export function pointsOf(task: Task | undefined): number {
  if (!task || task.groupTask) return 0;
  return task.points;
}

/** Members the scheduler will actually consider. */
export function activeMembers(members: Member[]): Member[] {
  return members.filter((m) => !m.paused);
}

/** Point total per member, including any carry-over already applied. */
export function pointTotals(
  assignments: readonly Assignment[],
  tasksById: ReadonlyMap<TaskId, Task>,
  members: Member[],
  carryOver: Readonly<Record<MemberId, number>> = {},
): Map<MemberId, number> {
  const totals = new Map<MemberId, number>();
  for (const m of members) totals.set(m.id, carryOver[m.id] ?? 0);
  for (const a of assignments) {
    const current = totals.get(a.memberId);
    if (current === undefined) continue;
    totals.set(a.memberId, current + pointsOf(tasksById.get(a.taskId)));
  }
  return totals;
}

export function buildBalance(
  assignments: readonly Assignment[],
  tasksById: ReadonlyMap<TaskId, Task>,
  members: Member[],
  carryOver: Readonly<Record<MemberId, number>> = {},
): MemberBalance[] {
  const totals = pointTotals(assignments, tasksById, members, carryOver);
  const counts = new Map<MemberId, number>();
  for (const a of assignments) {
    const task = tasksById.get(a.taskId);
    if (task?.groupTask) continue;
    counts.set(a.memberId, (counts.get(a.memberId) ?? 0) + 1);
  }
  return members.map((m) => ({
    memberId: m.id,
    name: m.name,
    points: totals.get(m.id) ?? 0,
    taskCount: counts.get(m.id) ?? 0,
    carriedOver: carryOver[m.id] ?? 0,
  }));
}

/** Highest minus lowest total across active members. The headline number. */
export function pointGap(
  totals: ReadonlyMap<MemberId, number>,
  members: Member[],
): number {
  const values = activeMembers(members).map((m) => totals.get(m.id) ?? 0);
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * Sum of squared deviations from the mean.
 *
 * The local search optimises this rather than the raw max-minus-min gap,
 * because it keeps improving when a move helps the middle of the pack without
 * touching either extreme. The plain gap is flat there and the search stalls.
 */
export function spread(
  totals: ReadonlyMap<MemberId, number>,
  members: Member[],
): number {
  const values = activeMembers(members).map((m) => totals.get(m.id) ?? 0);
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0);
}

/**
 * Convert one period's finished balance into starting offsets for the next.
 *
 * Whoever ran heavy starts the next period already ahead, so the scheduler
 * hands them less. This is what stops a small imbalance from accumulating in
 * the same direction week after week.
 */
export function carryOverFrom(
  balance: MemberBalance[],
  factor = 1,
): Record<MemberId, number> {
  if (balance.length === 0) return {};
  const mean = balance.reduce((s, b) => s + b.points, 0) / balance.length;
  const out: Record<MemberId, number> = {};
  for (const b of balance) out[b.memberId] = (b.points - mean) * factor;
  return out;
}
