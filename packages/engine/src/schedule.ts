/**
 * The scheduling engine.
 *
 * Two passes:
 *
 *  1. A greedy seed that walks the most-constrained instances first, so the
 *     hard-to-place jobs get the pick of the household before the easy ones
 *     have used everyone up.
 *  2. A local search that keeps moving and swapping assignments while doing so
 *     lowers the cost, until the point gap sits inside the household's
 *     tolerance or no improving move is left.
 *
 * Hard constraints (availability, blackouts, task-pair exclusions, co-location
 * limits) are applied as filters in both passes. They are never traded off
 * against balance, which is what lets the app promise that no assignment ever
 * lands on someone who is not free.
 *
 * When nobody can take an instance, it comes back in `unassigned` with a reason
 * rather than being forced onto someone or dropped silently.
 */

import { canWork, relativeAvailability, windowFor } from './availability';
import {
  activeMembers,
  buildBalance,
  indexTasks,
  pointGap,
  pointTotals,
  pointsOf,
  spread,
} from './balance';
import { expandTasks } from './recurrence';
import {
  bestPreferenceWeight,
  isBlackedOut,
  loadShiftWeight,
  preferenceWeight,
  violatesCoLocation,
  violatesPairExclusion,
} from './rules';
import { formatClock } from './time';
import type { ISODate } from './time';
import type {
  Assignment,
  Household,
  InstanceId,
  Member,
  MemberId,
  Rules,
  ScheduleResult,
  Task,
  TaskId,
  TaskInstance,
  UnassignedInstance,
} from './types';

/**
 * How the four concerns trade off against each other.
 *
 * Balance dominates on purpose: preferences and load-shifting are meant to
 * decide between otherwise-equal options, not to justify letting one person
 * carry the week.
 */
export const COST_WEIGHTS = {
  balance: 1,
  preference: 0.6,
  loadShift: 0.4,
  churn: 0.15,
} as const;

export interface GenerateOptions {
  start: ISODate;
  end: ISODate;
  /** Assignments an admin has pinned. Seeded first and never moved. */
  locked?: Assignment[];
  /** Last run's assignments. Matching them is mildly preferred, to limit churn. */
  previous?: Assignment[];
  /** Starting point offsets, usually from `carryOverFrom` of the last period. */
  carryOver?: Record<MemberId, number>;
  /**
   * Changes which of several equally fair schedules you get. Same seed and same
   * input always produce the same schedule.
   */
  seed?: number;
  maxIterations?: number;
}

const DEFAULT_MAX_ITERATIONS = 500;
const EPSILON = 1e-9;

/**
 * A tiny deterministic value in [0, 1e-6) derived from the seed and the pairing.
 *
 * Too small to outweigh any real cost difference, so it only ever breaks exact
 * ties. That gives "Regenerate" some variety between equally fair schedules
 * while keeping every run reproducible.
 */
function jitter(seed: number, instanceId: string, memberId: string): number {
  let h = seed >>> 0;
  const text = `${instanceId}|${memberId}`;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 2654435761) >>> 0;
  }
  return (h / 0xffffffff) * 1e-6;
}

interface Context {
  rules: Rules;
  tasksById: Map<TaskId, Task>;
  members: Member[];
  membersById: Map<MemberId, Member>;
  instancesById: Map<InstanceId, TaskInstance>;
  /** Static eligibility: availability and blackouts, which never change. */
  eligible: Map<InstanceId, MemberId[]>;
  previousByInstance: Map<InstanceId, MemberId>;
  seed: number;
}

/** Per-assignment soft cost. Additive, so moves can be scored incrementally. */
function softCost(ctx: Context, instance: TaskInstance, memberId: MemberId): number {
  const { rules, tasksById, members } = ctx;
  const task = tasksById.get(instance.taskId);
  if (!task) return 0;

  const member = ctx.membersById.get(memberId);
  let cost = 0;

  // Preference: pay for the preference weight we passed up.
  const best = bestPreferenceWeight(rules.preferences, task.id);
  if (best > 0) {
    const mine = preferenceWeight(rules.preferences, task.id, memberId);
    cost += COST_WEIGHTS.preference * (best - mine);
  }

  // Load shifting: on flagged days, favour whoever is most free.
  const shift = loadShiftWeight(rules, instance.date);
  if (shift > 0 && member) {
    const free = relativeAvailability(member, instance.date, members);
    cost += COST_WEIGHTS.loadShift * shift * (1 - free);
  }

  // Churn: regenerating should not reshuffle a week people already memorised.
  const before = ctx.previousByInstance.get(instance.id);
  if (before !== undefined && before !== memberId) {
    cost += COST_WEIGHTS.churn;
  }

  return cost + jitter(ctx.seed, instance.id, memberId);
}

/** Do the dynamic hard rules allow this member to take this instance? */
function hardRulesAllow(
  ctx: Context,
  assignments: readonly Assignment[],
  memberId: MemberId,
  instance: TaskInstance,
  ignoreInstanceId?: InstanceId,
): boolean {
  const { rules, tasksById } = ctx;
  if (
    violatesPairExclusion(
      rules,
      assignments,
      memberId,
      instance.taskId,
      instance.date,
      ignoreInstanceId,
    )
  ) {
    return false;
  }
  return !violatesCoLocation(
    rules,
    tasksById,
    assignments,
    memberId,
    instance.taskId,
    instance.date,
    ignoreInstanceId,
  );
}

/**
 * Change in balance cost from moving `points` off `from` and onto `to`.
 *
 * The mean is unchanged by a move (the total is constant), so only the two
 * affected terms of the sum-of-squares need recomputing.
 */
function balanceDelta(
  totals: Map<MemberId, number>,
  mean: number,
  from: MemberId | null,
  to: MemberId | null,
  points: number,
): number {
  let delta = 0;
  if (from !== null) {
    const v = totals.get(from) ?? 0;
    delta += (v - points - mean) ** 2 - (v - mean) ** 2;
  }
  if (to !== null) {
    const v = totals.get(to) ?? 0;
    delta += (v + points - mean) ** 2 - (v - mean) ** 2;
  }
  return COST_WEIGHTS.balance * delta;
}

function meanOf(totals: Map<MemberId, number>, members: Member[]): number {
  if (members.length === 0) return 0;
  let sum = 0;
  for (const m of members) sum += totals.get(m.id) ?? 0;
  return sum / members.length;
}

function unassignedFor(
  ctx: Context,
  instance: TaskInstance,
  reason: UnassignedInstance['reason'],
): UnassignedInstance {
  const task = ctx.tasksById.get(instance.taskId);
  const name = task?.name ?? instance.taskId;

  let detail: string;
  if (reason === 'no-active-members') {
    detail = 'No active members — everyone is paused.';
  } else if (reason === 'no-member-available') {
    const range = task
      ? windowFor(task.timing, ctx.rules.timingWindows)
      : { start: 0, end: 0 };
    detail =
      `Nobody is free for ${formatClock(range.start)}–${formatClock(range.end)} ` +
      `on ${instance.date}, or everyone free then is blacked out.`;
  } else {
    detail =
      'Everyone available is blocked by a household rule ' +
      '(a task-pair exclusion or a co-location limit).';
  }

  return { instance, taskName: name, reason, detail };
}

/**
 * Build a schedule for a date range.
 *
 * Always returns a result. An impossible instance is reported in `unassigned`
 * with an explanation rather than throwing or being quietly mis-assigned.
 */
export function generateSchedule(
  household: Household,
  options: GenerateOptions,
): ScheduleResult {
  const { start, end } = options;
  const rules = household.rules;
  const carryOver = options.carryOver ?? {};
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const tasksById = indexTasks(household.tasks);
  const members = activeMembers(household.members);
  const allInstances = expandTasks(household.tasks, start, end);

  const groupInstances = allInstances.filter(
    (i) => tasksById.get(i.taskId)?.groupTask === true,
  );
  const workInstances = allInstances.filter(
    (i) => tasksById.get(i.taskId)?.groupTask !== true,
  );

  const ctx: Context = {
    rules,
    tasksById,
    members,
    membersById: new Map(members.map((m) => [m.id, m])),
    instancesById: new Map(allInstances.map((i) => [i.id, i])),
    eligible: new Map(),
    previousByInstance: new Map(
      (options.previous ?? []).map((a) => [a.instanceId, a.memberId]),
    ),
    seed: options.seed ?? 1,
  };

  const unassigned: UnassignedInstance[] = [];

  // Nobody home: report every instance rather than pretending to schedule.
  if (members.length === 0) {
    return {
      start,
      end,
      assignments: [],
      groupInstances,
      unassigned: workInstances.map((i) =>
        unassignedFor(ctx, i, 'no-active-members'),
      ),
      balance: buildBalance([], tasksById, household.members, carryOver),
      gap: 0,
      withinTolerance: true,
      iterations: 0,
    };
  }

  // --- Static eligibility ---------------------------------------------------
  for (const instance of workInstances) {
    const task = tasksById.get(instance.taskId);
    if (!task) continue;
    const ids = members
      .filter(
        (m) =>
          canWork(
            m,
            task,
            instance.date,
            rules.timingWindows,
            rules.defaultDurationMinutes,
          ) && !isBlackedOut(rules.blackouts, m.id, instance.date),
      )
      .map((m) => m.id);
    ctx.eligible.set(instance.id, ids);
  }

  // --- Seed with locked assignments ----------------------------------------
  const inRange = new Set(workInstances.map((i) => i.id));
  const locked = (options.locked ?? []).filter((a) => inRange.has(a.instanceId));
  const lockedIds = new Set(locked.map((a) => a.instanceId));
  const assignments: Assignment[] = locked.map((a) => ({ ...a, locked: true }));

  const totals = pointTotals(assignments, tasksById, members, carryOver);

  // --- Greedy pass: most-constrained instance first --------------------------
  const queue = workInstances
    .filter((i) => !lockedIds.has(i.id))
    .sort((a, b) => {
      const ea = ctx.eligible.get(a.id)?.length ?? 0;
      const eb = ctx.eligible.get(b.id)?.length ?? 0;
      if (ea !== eb) return ea - eb;
      const pa = pointsOf(tasksById.get(a.taskId));
      const pb = pointsOf(tasksById.get(b.taskId));
      if (pa !== pb) return pb - pa;
      return a.id.localeCompare(b.id);
    });

  for (const instance of queue) {
    const candidates = ctx.eligible.get(instance.id) ?? [];
    if (candidates.length === 0) {
      unassigned.push(unassignedFor(ctx, instance, 'no-member-available'));
      continue;
    }

    const points = pointsOf(tasksById.get(instance.taskId));
    const mean = meanOf(totals, members);

    let bestMember: MemberId | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const memberId of candidates) {
      if (!hardRulesAllow(ctx, assignments, memberId, instance)) continue;
      const cost =
        balanceDelta(totals, mean, null, memberId, points) +
        softCost(ctx, instance, memberId);
      if (cost < bestCost - EPSILON) {
        bestCost = cost;
        bestMember = memberId;
      }
    }

    if (bestMember === null) {
      unassigned.push(unassignedFor(ctx, instance, 'blocked-by-rules'));
      continue;
    }

    assignments.push({
      instanceId: instance.id,
      taskId: instance.taskId,
      date: instance.date,
      memberId: bestMember,
      locked: false,
    });
    totals.set(bestMember, (totals.get(bestMember) ?? 0) + points);
  }

  // --- Local search: moves and swaps ---------------------------------------
  const iterations = rebalance(ctx, assignments, totals, maxIterations);

  const balance = buildBalance(
    assignments,
    tasksById,
    household.members,
    carryOver,
  );
  const gap = pointGap(
    pointTotals(assignments, tasksById, household.members, carryOver),
    household.members,
  );

  assignments.sort(
    (a, b) => a.date.localeCompare(b.date) || a.taskId.localeCompare(b.taskId),
  );

  return {
    start,
    end,
    assignments,
    groupInstances,
    unassigned,
    balance,
    gap,
    withinTolerance: gap <= rules.balanceTolerance,
    iterations,
  };
}

/**
 * Hill-climb on cost: repeatedly apply the single best improving move or swap.
 *
 * Stops early once the gap is inside tolerance and no move improves things, so
 * a household that is already fair costs almost nothing to reschedule.
 */
function rebalance(
  ctx: Context,
  assignments: Assignment[],
  totals: Map<MemberId, number>,
  maxIterations: number,
): number {
  const { tasksById, members } = ctx;
  const movable = () => assignments.filter((a) => !a.locked);

  let iterations = 0;

  while (iterations < maxIterations) {
    const mean = meanOf(totals, members);
    const pool = movable();

    let bestDelta = -EPSILON;
    let apply: (() => void) | null = null;

    // Single moves: hand one assignment to a different eligible member.
    for (const a of pool) {
      const instance = ctx.instancesById.get(a.instanceId);
      if (!instance) continue;
      const points = pointsOf(tasksById.get(a.taskId));
      const currentSoft = softCost(ctx, instance, a.memberId);

      for (const candidate of ctx.eligible.get(a.instanceId) ?? []) {
        if (candidate === a.memberId) continue;

        const trial = assignments.map((x) =>
          x.instanceId === a.instanceId ? { ...x, memberId: candidate } : x,
        );
        if (!hardRulesAllow(ctx, trial, candidate, instance, a.instanceId)) {
          continue;
        }

        const delta =
          balanceDelta(totals, mean, a.memberId, candidate, points) +
          softCost(ctx, instance, candidate) -
          currentSoft;

        if (delta < bestDelta) {
          bestDelta = delta;
          const from = a.memberId;
          apply = () => {
            a.memberId = candidate;
            totals.set(from, (totals.get(from) ?? 0) - points);
            totals.set(candidate, (totals.get(candidate) ?? 0) + points);
          };
        }
      }
    }

    // Pairwise swaps: trade two assignments between two members. This escapes
    // the dead end where no single move helps but an exchange does.
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const a = pool[i];
        const b = pool[j];
        if (!a || !b || a.memberId === b.memberId) continue;

        const ia = ctx.instancesById.get(a.instanceId);
        const ib = ctx.instancesById.get(b.instanceId);
        if (!ia || !ib) continue;

        const aEligible = ctx.eligible.get(a.instanceId) ?? [];
        const bEligible = ctx.eligible.get(b.instanceId) ?? [];
        if (!aEligible.includes(b.memberId) || !bEligible.includes(a.memberId)) {
          continue;
        }

        const trial = assignments.map((x) => {
          if (x.instanceId === a.instanceId) return { ...x, memberId: b.memberId };
          if (x.instanceId === b.instanceId) return { ...x, memberId: a.memberId };
          return x;
        });
        if (
          !hardRulesAllow(ctx, trial, b.memberId, ia, a.instanceId) ||
          !hardRulesAllow(ctx, trial, a.memberId, ib, b.instanceId)
        ) {
          continue;
        }

        const pa = pointsOf(tasksById.get(a.taskId));
        const pb = pointsOf(tasksById.get(b.taskId));
        const net = pb - pa; // what member A ends up gaining

        const delta =
          balanceDelta(totals, mean, null, a.memberId, net) +
          balanceDelta(totals, mean, null, b.memberId, -net) +
          softCost(ctx, ia, b.memberId) +
          softCost(ctx, ib, a.memberId) -
          softCost(ctx, ia, a.memberId) -
          softCost(ctx, ib, b.memberId);

        if (delta < bestDelta) {
          bestDelta = delta;
          const memberA = a.memberId;
          const memberB = b.memberId;
          apply = () => {
            a.memberId = memberB;
            b.memberId = memberA;
            totals.set(memberA, (totals.get(memberA) ?? 0) + net);
            totals.set(memberB, (totals.get(memberB) ?? 0) - net);
          };
        }
      }
    }

    if (!apply) break;
    apply();
    iterations += 1;
  }

  return iterations;
}

/** Current spread, exposed for callers that want to score a hand-edited week. */
export function scheduleSpread(
  assignments: readonly Assignment[],
  tasks: Task[],
  members: Member[],
): number {
  const tasksById = indexTasks(tasks);
  return spread(pointTotals(assignments, tasksById, members), members);
}
