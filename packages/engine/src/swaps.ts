/**
 * Swap requests.
 *
 * A member offers an assignment up; someone takes it; points move with it. The
 * check that matters is the one on approval: a swap is only applied if the
 * result still satisfies every hard rule, so trading chores can never quietly
 * put a night task on someone who is asleep.
 *
 * The engine-side pieces are pure and complete. The multi-device approval flow
 * that uses them is Phase 2 — see docs/scope.md.
 */

import { canWork } from './availability';
import { buildBalance, indexTasks } from './balance';
import { isBlackedOut, violatesCoLocation, violatesPairExclusion } from './rules';
import type {
  Assignment,
  Household,
  InstanceId,
  MemberBalance,
  MemberId,
} from './types';

export type SwapStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface SwapRequest {
  id: string;
  instanceId: InstanceId;
  fromMemberId: MemberId;
  /** `null` means "open to anyone" — the first taker claims it. */
  toMemberId: MemberId | null;
  status: SwapStatus;
  createdAt: string;
  note?: string;
}

export interface SwapEvaluation {
  ok: boolean;
  /** Human-readable blockers, safe to show directly in the UI. */
  problems: string[];
}

export interface SwapOutcome {
  applied: boolean;
  assignments: Assignment[];
  balance: MemberBalance[];
  request: SwapRequest;
  problems: string[];
}

export function proposeSwap(
  assignments: readonly Assignment[],
  input: {
    id: string;
    instanceId: InstanceId;
    fromMemberId: MemberId;
    toMemberId?: MemberId | null;
    note?: string;
    createdAt?: string;
  },
): SwapRequest {
  const owned = assignments.find(
    (a) => a.instanceId === input.instanceId && a.memberId === input.fromMemberId,
  );
  if (!owned) {
    throw new Error(
      `${input.fromMemberId} does not hold assignment ${input.instanceId}`,
    );
  }
  return {
    id: input.id,
    instanceId: input.instanceId,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId ?? null,
    status: 'pending',
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.note ? { note: input.note } : {}),
  };
}

/**
 * Would handing this assignment to `toMemberId` break anything?
 *
 * Runs the same hard checks the scheduler uses, so an approved swap is exactly
 * as valid as a generated assignment.
 */
export function evaluateSwap(
  household: Household,
  assignments: readonly Assignment[],
  instanceId: InstanceId,
  toMemberId: MemberId,
): SwapEvaluation {
  const problems: string[] = [];
  const tasksById = indexTasks(household.tasks);
  const assignment = assignments.find((a) => a.instanceId === instanceId);

  if (!assignment) {
    return { ok: false, problems: ['That assignment no longer exists.'] };
  }

  const member = household.members.find((m) => m.id === toMemberId);
  if (!member) {
    return { ok: false, problems: ['That member is not in this household.'] };
  }

  const task = tasksById.get(assignment.taskId);
  if (!task) {
    return { ok: false, problems: ['That task no longer exists.'] };
  }

  if (member.paused) {
    problems.push(`${member.name} is paused.`);
  }

  const rules = household.rules;

  if (
    !canWork(
      member,
      task,
      assignment.date,
      rules.timingWindows,
      rules.defaultDurationMinutes,
    )
  ) {
    problems.push(
      `${member.name} is not free for a ${task.timing} task on ${assignment.date}.`,
    );
  }

  if (isBlackedOut(rules.blackouts, member.id, assignment.date)) {
    problems.push(`${member.name} is blacked out on ${assignment.date}.`);
  }

  if (
    violatesPairExclusion(
      rules,
      assignments,
      member.id,
      task.id,
      assignment.date,
      instanceId,
    )
  ) {
    problems.push(
      `That would give ${member.name} two tasks that cannot share a day.`,
    );
  }

  if (
    violatesCoLocation(
      rules,
      tasksById,
      assignments,
      member.id,
      task.id,
      assignment.date,
      instanceId,
    )
  ) {
    problems.push(
      `That would put too many people in the ${task.space} at the same time.`,
    );
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Approve a swap: move the assignment and recalculate both totals.
 *
 * Returns `applied: false` with the reasons when the swap would break a hard
 * rule, leaving the schedule untouched.
 */
export function approveSwap(
  household: Household,
  assignments: readonly Assignment[],
  request: SwapRequest,
  claimantId?: MemberId,
): SwapOutcome {
  const toMemberId = request.toMemberId ?? claimantId;

  if (!toMemberId) {
    return {
      applied: false,
      assignments: [...assignments],
      balance: buildBalance(assignments, indexTasks(household.tasks), household.members),
      request,
      problems: ['This swap is open to anyone; nobody has claimed it yet.'],
    };
  }

  const evaluation = evaluateSwap(
    household,
    assignments,
    request.instanceId,
    toMemberId,
  );

  if (!evaluation.ok) {
    return {
      applied: false,
      assignments: [...assignments],
      balance: buildBalance(assignments, indexTasks(household.tasks), household.members),
      request,
      problems: evaluation.problems,
    };
  }

  const next = assignments.map((a) =>
    a.instanceId === request.instanceId ? { ...a, memberId: toMemberId } : a,
  );

  return {
    applied: true,
    assignments: next,
    balance: buildBalance(next, indexTasks(household.tasks), household.members),
    request: { ...request, status: 'approved', toMemberId },
    problems: [],
  };
}

export function declineSwap(request: SwapRequest): SwapRequest {
  return { ...request, status: 'declined' };
}

/**
 * Reassign directly, bypassing the request flow.
 *
 * This is the admin override the scope calls for. It still refuses to break a
 * hard rule, but it needs no counterparty approval.
 */
export function reassign(
  household: Household,
  assignments: readonly Assignment[],
  instanceId: InstanceId,
  toMemberId: MemberId,
  options: { lock?: boolean } = {},
): SwapOutcome {
  const evaluation = evaluateSwap(household, assignments, instanceId, toMemberId);
  const tasksById = indexTasks(household.tasks);

  if (!evaluation.ok) {
    return {
      applied: false,
      assignments: [...assignments],
      balance: buildBalance(assignments, tasksById, household.members),
      request: {
        id: `reassign:${instanceId}`,
        instanceId,
        fromMemberId: '',
        toMemberId,
        status: 'declined',
        createdAt: new Date().toISOString(),
      },
      problems: evaluation.problems,
    };
  }

  const next = assignments.map((a) =>
    a.instanceId === instanceId
      ? { ...a, memberId: toMemberId, locked: options.lock ?? a.locked }
      : a,
  );

  return {
    applied: true,
    assignments: next,
    balance: buildBalance(next, tasksById, household.members),
    request: {
      id: `reassign:${instanceId}`,
      instanceId,
      fromMemberId: '',
      toMemberId,
      status: 'approved',
      createdAt: new Date().toISOString(),
    },
    problems: [],
  };
}
