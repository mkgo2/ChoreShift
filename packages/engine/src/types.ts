/** The ChoreShift domain model. */

import type { ISODate, Minutes, Weekday } from './time';

export type MemberId = string;
export type TaskId = string;

/** Identifies one occurrence of a task: `"task-mop@2026-09-02"`. */
export type InstanceId = string;

// ---------------------------------------------------------------------------
// People and when they are actually free
// ---------------------------------------------------------------------------

/** A recurring weekly slot in which a member can do chores. */
export interface AvailabilityWindow {
  weekday: Weekday;
  start: Minutes;
  end: Minutes;
}

/**
 * A one-off override for a single date. An empty `windows` array means
 * "unavailable all day" — the way you record being out of town.
 *
 * `weekday` on the windows is ignored here; the date decides the day.
 */
export interface AvailabilityException {
  date: ISODate;
  windows: AvailabilityWindow[];
  note?: string;
}

export type MemberRole = 'admin' | 'member';

export interface Member {
  id: MemberId;
  name: string;
  role: MemberRole;
  /** Recurring weekly availability. A member with none can never be assigned. */
  windows: AvailabilityWindow[];
  exceptions: AvailabilityException[];
  /** Paused members are skipped entirely — travel, illness, a heavy work week. */
  paused: boolean;
  color?: string;
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

/** When during the day a task has to happen. */
export type Timing = 'morning' | 'night' | 'anytime';

export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'everyNDays'; n: number; anchor: ISODate }
  | { kind: 'biweekly'; days: Weekday[]; anchor: ISODate }
  | { kind: 'once'; date: ISODate };

export interface Task {
  id: TaskId;
  name: string;
  /**
   * Effort, not duration. Mopping is a 4 and taking the garbage out is a 2
   * because that is how they feel, and fairness is measured in these.
   */
  points: number;
  timing: Timing;
  recurrence: Recurrence;
  /** Physical space, used by co-location limits. e.g. `"kitchen"`. */
  space?: string;
  /**
   * A task the whole household does together. Assigned to everyone, worth zero
   * points, and left out of balancing.
   */
  groupTask?: boolean;
  /** Contiguous free minutes a member needs to take this on. Default 15. */
  durationMinutes?: number;
  active?: boolean;
  notes?: string;
}

/** One occurrence of a task on one date — the unit the scheduler assigns. */
export interface TaskInstance {
  id: InstanceId;
  taskId: TaskId;
  date: ISODate;
}

/** A task instance handed to a member. The atomic unit of the schedule. */
export interface Assignment {
  instanceId: InstanceId;
  taskId: TaskId;
  date: ISODate;
  memberId: MemberId;
  /** Locked assignments are never moved by the scheduler. */
  locked: boolean;
}

// ---------------------------------------------------------------------------
// Household rules
// ---------------------------------------------------------------------------

export interface ClockRange {
  start: Minutes;
  end: Minutes;
}

/** What "morning" and "night" mean in this household. Not hardcoded. */
export interface TimingWindows {
  morning: ClockRange;
  night: ClockRange;
  anytime: ClockRange;
}

/** Hard: this member takes nothing on these weekdays or dates. */
export interface Blackout {
  memberId: MemberId;
  weekdays?: Weekday[];
  dates?: ISODate[];
}

/** Hard: at most `maxConcurrent` people working in `space` at the same time. */
export interface CoLocationLimit {
  space: string;
  maxConcurrent: number;
}

/** Soft: nudges this task toward this member. Higher weight, stronger nudge. */
export interface Preference {
  taskId: TaskId;
  memberId: MemberId;
  weight: number;
}

/**
 * Soft: on these weekdays, favour whoever is most available.
 * This is "push the weekend load onto whoever is actually home".
 */
export interface LoadShiftRule {
  weekdays: Weekday[];
  weight: number;
}

export interface Rules {
  timingWindows: TimingWindows;
  blackouts: Blackout[];
  /** Hard: neither task in a pair may land on one member on one day. */
  taskPairExclusions: Array<[TaskId, TaskId]>;
  coLocationLimits: CoLocationLimit[];
  preferences: Preference[];
  loadShifting: LoadShiftRule[];
  /** How large a point gap between members is acceptable before we stop optimizing. */
  balanceTolerance: number;
  /** Roll last period's surplus/deficit into this period's starting totals. */
  carryOverPreviousImbalance: boolean;
  /** Fallback for tasks with no `durationMinutes`. */
  defaultDurationMinutes: number;
  /**
   * How long an open coverage request (someone called out) stays open to
   * anyone before it must be escalated to a specific person who accepts it.
   */
  openCoverageWindowMinutes: number;
}

export interface Household {
  id: string;
  name: string;
  members: Member[];
  tasks: Task[];
  rules: Rules;
}

// ---------------------------------------------------------------------------
// Scheduler output
// ---------------------------------------------------------------------------

/** Why nobody could take an instance. Surfaced, never silently dropped. */
export type UnassignedReason =
  | 'no-member-available'
  | 'blocked-by-rules'
  | 'no-active-members';

export interface UnassignedInstance {
  instance: TaskInstance;
  taskName: string;
  reason: UnassignedReason;
  /** Human-readable explanation, safe to show in the UI as-is. */
  detail: string;
}

export interface MemberBalance {
  memberId: MemberId;
  name: string;
  points: number;
  taskCount: number;
  /** Carry-over applied to this member's starting total, if any. */
  carriedOver: number;
}

export interface ScheduleResult {
  start: ISODate;
  end: ISODate;
  assignments: Assignment[];
  /** Group tasks: everyone does them, nobody scores them. */
  groupInstances: TaskInstance[];
  unassigned: UnassignedInstance[];
  balance: MemberBalance[];
  /** Highest minus lowest point total across active members. */
  gap: number;
  /** True when `gap` is within the household's tolerance. */
  withinTolerance: boolean;
  iterations: number;
}

export const DEFAULT_TIMING_WINDOWS: TimingWindows = {
  morning: { start: 6 * 60, end: 11 * 60 },
  night: { start: 18 * 60, end: 23 * 60 },
  anytime: { start: 6 * 60, end: 23 * 60 },
};

export const DEFAULT_RULES: Rules = {
  timingWindows: DEFAULT_TIMING_WINDOWS,
  blackouts: [],
  taskPairExclusions: [],
  coLocationLimits: [],
  preferences: [],
  loadShifting: [],
  balanceTolerance: 2,
  carryOverPreviousImbalance: false,
  defaultDurationMinutes: 15,
  openCoverageWindowMinutes: 120,
};
