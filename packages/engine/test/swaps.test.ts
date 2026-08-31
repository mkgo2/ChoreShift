import { describe, expect, it } from 'vitest';
import { generateSchedule } from '../src/schedule';
import { seedHousehold } from '../src/seed';
import { approveSwap, declineSwap, evaluateSwap, proposeSwap, reassign } from '../src/swaps';
import type { Assignment, Household } from '../src/types';

const WEEK = { start: '2026-09-07', end: '2026-09-13' } as const;

function weekOf(household: Household): Assignment[] {
  return generateSchedule(household, { ...WEEK, seed: 7 }).assignments;
}

/** A weekday night assignment — the ones Bailey can never take. */
function weekdayNightAssignment(assignments: Assignment[]): Assignment {
  const found = assignments.find(
    (a) => a.taskId === 'task-dishload' && a.date === '2026-09-08',
  );
  if (!found) throw new Error('expected a Tuesday dish load in the schedule');
  return found;
}

describe('proposeSwap', () => {
  it('creates a pending request for an assignment the member holds', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const mine = assignments[0];
    if (!mine) throw new Error('empty schedule');

    const request = proposeSwap(assignments, {
      id: 'swap-1',
      instanceId: mine.instanceId,
      fromMemberId: mine.memberId,
      createdAt: '2026-09-07T09:00:00.000Z',
    });

    expect(request.status).toBe('pending');
    expect(request.toMemberId).toBeNull();
  });

  it('refuses to offer up an assignment somebody else holds', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const mine = assignments[0];
    if (!mine) throw new Error('empty schedule');
    const notMine =
      mine.memberId === 'member-alex' ? 'member-casey' : 'member-alex';

    expect(() =>
      proposeSwap(assignments, {
        id: 'swap-bad',
        instanceId: mine.instanceId,
        fromMemberId: notMine,
      }),
    ).toThrow();
  });
});

describe('evaluateSwap', () => {
  it('blocks a night task moving to someone who is out that evening', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const night = weekdayNightAssignment(assignments);

    const check = evaluateSwap(
      household,
      assignments,
      night.instanceId,
      'member-bailey',
    );

    expect(check.ok).toBe(false);
    expect(check.problems.join(' ')).toContain('Bailey');
    expect(check.problems.join(' ')).toContain('not free');
  });

  it('blocks a swap onto a paused member', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const casey = household.members.find((m) => m.id === 'member-casey');
    if (casey) casey.paused = true;

    const target = assignments.find((a) => a.memberId !== 'member-casey');
    if (!target) throw new Error('expected an assignment held by someone else');

    const check = evaluateSwap(
      household,
      assignments,
      target.instanceId,
      'member-casey',
    );
    expect(check.ok).toBe(false);
    expect(check.problems.join(' ')).toContain('paused');
  });

  it('blocks a swap that would break a task-pair exclusion', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);

    // Kitchen and dishloading may not land on one person on one day.
    const kitchen = assignments.find(
      (a) => a.taskId === 'task-kitchen' && a.date === '2026-09-09',
    );
    const dishload = assignments.find(
      (a) => a.taskId === 'task-dishload' && a.date === '2026-09-09',
    );
    if (!kitchen || !dishload) throw new Error('expected both Wednesday tasks');
    expect(kitchen.memberId).not.toBe(dishload.memberId);

    const check = evaluateSwap(
      household,
      assignments,
      kitchen.instanceId,
      dishload.memberId,
    );
    expect(check.ok).toBe(false);
    expect(check.problems.join(' ')).toContain('cannot share a day');
  });
});

describe('approveSwap', () => {
  it('moves the assignment and the points with it', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);

    // A Saturday mop can go to anyone — everybody is home.
    const mop = assignments.find((a) => a.taskId === 'task-mop');
    if (!mop) throw new Error('expected a mop assignment');
    const taker =
      mop.memberId === 'member-bailey' ? 'member-casey' : 'member-bailey';

    const request = proposeSwap(assignments, {
      id: 'swap-mop',
      instanceId: mop.instanceId,
      fromMemberId: mop.memberId,
      toMemberId: taker,
    });

    const before = new Map(
      generateSchedule(household, { ...WEEK, seed: 7 }).balance.map((b) => [
        b.memberId,
        b.points,
      ]),
    );

    const outcome = approveSwap(household, assignments, request);

    expect(outcome.applied).toBe(true);
    expect(outcome.request.status).toBe('approved');

    const after = new Map(outcome.balance.map((b) => [b.memberId, b.points]));
    // The mop is worth four points, and they follow the chore.
    expect((after.get(taker) ?? 0) - (before.get(taker) ?? 0)).toBe(4);
    expect(
      (before.get(mop.memberId) ?? 0) - (after.get(mop.memberId) ?? 0),
    ).toBe(4);
  });

  it('leaves the schedule untouched when the swap breaks a hard rule', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const night = weekdayNightAssignment(assignments);

    const request = proposeSwap(assignments, {
      id: 'swap-night',
      instanceId: night.instanceId,
      fromMemberId: night.memberId,
      toMemberId: 'member-bailey',
    });

    const outcome = approveSwap(household, assignments, request);

    expect(outcome.applied).toBe(false);
    expect(outcome.problems.length).toBeGreaterThan(0);
    expect(outcome.assignments).toEqual(assignments);
  });

  it('waits for a claimant on an open offer', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const mop = assignments.find((a) => a.taskId === 'task-mop');
    if (!mop) throw new Error('expected a mop assignment');

    const request = proposeSwap(assignments, {
      id: 'swap-open',
      instanceId: mop.instanceId,
      fromMemberId: mop.memberId,
    });

    expect(approveSwap(household, assignments, request).applied).toBe(false);

    const taker =
      mop.memberId === 'member-bailey' ? 'member-casey' : 'member-bailey';
    const claimed = approveSwap(household, assignments, request, taker);
    expect(claimed.applied).toBe(true);
    expect(claimed.request.toMemberId).toBe(taker);
  });

  it('marks a declined request without touching the schedule', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const mop = assignments.find((a) => a.taskId === 'task-mop');
    if (!mop) throw new Error('expected a mop assignment');

    const request = proposeSwap(assignments, {
      id: 'swap-declined',
      instanceId: mop.instanceId,
      fromMemberId: mop.memberId,
    });
    expect(declineSwap(request).status).toBe('declined');
  });
});

describe('reassign', () => {
  it('lets an admin move and lock an assignment directly', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const mop = assignments.find((a) => a.taskId === 'task-mop');
    if (!mop) throw new Error('expected a mop assignment');
    const taker =
      mop.memberId === 'member-bailey' ? 'member-casey' : 'member-bailey';

    const outcome = reassign(household, assignments, mop.instanceId, taker, {
      lock: true,
    });

    expect(outcome.applied).toBe(true);
    const moved = outcome.assignments.find(
      (a) => a.instanceId === mop.instanceId,
    );
    expect(moved?.memberId).toBe(taker);
    expect(moved?.locked).toBe(true);
  });

  it('still refuses to break a hard rule, even for an admin', () => {
    const household = seedHousehold();
    const assignments = weekOf(household);
    const night = weekdayNightAssignment(assignments);

    const outcome = reassign(
      household,
      assignments,
      night.instanceId,
      'member-bailey',
    );

    expect(outcome.applied).toBe(false);
    expect(outcome.assignments).toEqual(assignments);
  });
});
