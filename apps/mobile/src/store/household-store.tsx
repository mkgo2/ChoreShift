/**
 * The single source of truth for the app.
 *
 * Everything the user edits lives here; the schedule itself is never stored,
 * only derived. Calling the engine is a few microseconds for a household-sized
 * problem, so recomputing on every change is simpler and always correct — there
 * is no cached schedule that can drift out of sync with the rules that made it.
 *
 * Persistence is AsyncStorage, which is backed by localStorage on web, so the
 * same code covers phone and browser.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDays,
  carryOverFrom,
  evaluateSwap,
  generateSchedule,
  isSwapExpired,
  proposeSwap,
  seedHousehold,
  startOfWeek,
} from '@choreshift/engine';
import type {
  Assignment,
  Household,
  ISODate,
  Member,
  MemberId,
  Rules,
  ScheduleResult,
  SwapEvaluation,
  SwapRequest,
  Task,
  TaskId,
} from '@choreshift/engine';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'choreshift.state.v1';

/** Weeks run Monday to Sunday. */
export function mondayOf(date: ISODate): ISODate {
  const sunday = startOfWeek(date); // the Sunday on or before `date`
  // A Sunday closes a Monday-based week rather than opening one.
  return sunday === date ? addDays(date, -6) : addDays(sunday, 1);
}

function todayISO(): ISODate {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface AppState {
  household: Household;
  /** Monday of the week on screen. */
  weekStart: ISODate;
  /** Assignments an admin has pinned. The scheduler works around these. */
  locked: Assignment[];
  /** Bumping this reshuffles between equally fair schedules. */
  seed: number;
  /**
   * Chores somebody called out of. Each one starts open to the whole
   * household; if nobody claims it in time it gets narrowed to a specific
   * person who still has to accept it. See `callOut` below.
   */
  openRequests: SwapRequest[];
  hydrated: boolean;
}

function initialState(): AppState {
  return {
    household: seedHousehold(),
    weekStart: mondayOf(todayISO()),
    locked: [],
    seed: 1,
    openRequests: [],
    hydrated: false,
  };
}

type Action =
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'setWeekStart'; weekStart: ISODate }
  | { type: 'shiftWeek'; days: number }
  | { type: 'regenerate' }
  | { type: 'upsertMember'; member: Member }
  | { type: 'removeMember'; memberId: MemberId }
  | { type: 'upsertTask'; task: Task }
  | { type: 'removeTask'; taskId: TaskId }
  | { type: 'updateRules'; rules: Partial<Rules> }
  | { type: 'pin'; assignment: Assignment }
  | { type: 'unpin'; instanceId: string }
  | { type: 'clearPins' }
  | { type: 'addException'; memberId: MemberId; date: ISODate; note?: string }
  | { type: 'removeException'; memberId: MemberId; date: ISODate }
  | { type: 'addOpenRequest'; request: SwapRequest }
  | { type: 'updateOpenRequest'; request: SwapRequest }
  | { type: 'removeOpenRequest'; requestId: string }
  | { type: 'reset' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state, hydrated: true };

    case 'setWeekStart':
      return { ...state, weekStart: action.weekStart };

    case 'shiftWeek':
      return { ...state, weekStart: addDays(state.weekStart, action.days) };

    case 'regenerate':
      return { ...state, seed: state.seed + 1 };

    case 'upsertMember': {
      const exists = state.household.members.some((m) => m.id === action.member.id);
      const members = exists
        ? state.household.members.map((m) =>
            m.id === action.member.id ? action.member : m,
          )
        : [...state.household.members, action.member];
      return { ...state, household: { ...state.household, members } };
    }

    case 'removeMember': {
      const members = state.household.members.filter(
        (m) => m.id !== action.memberId,
      );
      // Pins belonging to a departed member are meaningless; drop them.
      const locked = state.locked.filter((a) => a.memberId !== action.memberId);
      const openRequests = state.openRequests.filter(
        (r) =>
          r.fromMemberId !== action.memberId && r.toMemberId !== action.memberId,
      );
      const rules: Rules = {
        ...state.household.rules,
        blackouts: state.household.rules.blackouts.filter(
          (b) => b.memberId !== action.memberId,
        ),
        preferences: state.household.rules.preferences.filter(
          (p) => p.memberId !== action.memberId,
        ),
      };
      return {
        ...state,
        locked,
        openRequests,
        household: { ...state.household, members, rules },
      };
    }

    case 'upsertTask': {
      const exists = state.household.tasks.some((t) => t.id === action.task.id);
      const tasks = exists
        ? state.household.tasks.map((t) =>
            t.id === action.task.id ? action.task : t,
          )
        : [...state.household.tasks, action.task];
      return { ...state, household: { ...state.household, tasks } };
    }

    case 'removeTask': {
      const tasks = state.household.tasks.filter((t) => t.id !== action.taskId);
      const locked = state.locked.filter((a) => a.taskId !== action.taskId);
      const openRequests = state.openRequests.filter(
        (r) => !r.instanceId.startsWith(`${action.taskId}@`),
      );
      const rules: Rules = {
        ...state.household.rules,
        taskPairExclusions: state.household.rules.taskPairExclusions.filter(
          ([a, b]) => a !== action.taskId && b !== action.taskId,
        ),
        preferences: state.household.rules.preferences.filter(
          (p) => p.taskId !== action.taskId,
        ),
      };
      return {
        ...state,
        locked,
        openRequests,
        household: { ...state.household, tasks, rules },
      };
    }

    case 'updateRules':
      return {
        ...state,
        household: {
          ...state.household,
          rules: { ...state.household.rules, ...action.rules },
        },
      };

    case 'pin': {
      const locked = [
        ...state.locked.filter((a) => a.instanceId !== action.assignment.instanceId),
        { ...action.assignment, locked: true },
      ];
      return { ...state, locked };
    }

    case 'unpin':
      return {
        ...state,
        locked: state.locked.filter((a) => a.instanceId !== action.instanceId),
      };

    case 'clearPins':
      return { ...state, locked: [] };

    case 'addException': {
      const members = state.household.members.map((m) => {
        if (m.id !== action.memberId) return m;
        const exceptions = [
          ...m.exceptions.filter((e) => e.date !== action.date),
          { date: action.date, windows: [], ...(action.note ? { note: action.note } : {}) },
        ];
        return { ...m, exceptions };
      });
      return { ...state, household: { ...state.household, members } };
    }

    case 'removeException': {
      const members = state.household.members.map((m) =>
        m.id !== action.memberId
          ? m
          : { ...m, exceptions: m.exceptions.filter((e) => e.date !== action.date) },
      );
      return { ...state, household: { ...state.household, members } };
    }

    case 'addOpenRequest':
      return { ...state, openRequests: [...state.openRequests, action.request] };

    case 'updateOpenRequest':
      return {
        ...state,
        openRequests: state.openRequests.map((r) =>
          r.id === action.request.id ? action.request : r,
        ),
      };

    case 'removeOpenRequest':
      return {
        ...state,
        openRequests: state.openRequests.filter((r) => r.id !== action.requestId),
      };

    case 'reset':
      return { ...initialState(), hydrated: true };

    default:
      return state;
  }
}

interface StoreValue extends AppState {
  /** The current week, recomputed from state on every change. */
  schedule: ScheduleResult;
  weekEnd: ISODate;
  dispatch: React.Dispatch<Action>;
  /** Reassign one instance and pin it, so regenerating cannot undo the choice. */
  assignTo: (
    instanceId: string,
    taskId: TaskId,
    date: ISODate,
    memberId: MemberId,
  ) => void;
  isPinned: (instanceId: string) => boolean;
  /**
   * "I'm out on this date." Marks the day unavailable and puts every chore the
   * member currently holds that day up for grabs — open to the household
   * first, escalating to a specific person only if nobody claims it.
   */
  callOut: (memberId: MemberId, date: ISODate, note?: string) => void;
  /** Anyone eligible may claim an open request; the first to do so gets it. */
  claimRequest: (requestId: string, claimantId: MemberId) => SwapEvaluation;
  /** Past the coverage window, the caller-out proposes a specific person. */
  escalateRequest: (requestId: string, toMemberId: MemberId) => void;
  /** The proposed person accepts or declines; nothing moves without this. */
  respondToEscalation: (requestId: string, approve: boolean) => SwapEvaluation;
  /** Give up on finding coverage and let the scheduler decide instead. */
  cancelRequest: (requestId: string) => void;
  /** Has this request sat open past the household's coverage window? */
  isRequestExpired: (request: SwapRequest) => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Load once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          dispatch({ type: 'hydrate', state: {} });
          return;
        }
        const saved = JSON.parse(raw) as Partial<AppState>;
        dispatch({ type: 'hydrate', state: saved });
      })
      .catch(() => {
        // A corrupt or unreadable store should not brick the app; fall back to
        // the seed household rather than showing a blank screen.
        dispatch({ type: 'hydrate', state: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save on every change, once the initial load has finished.
  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _ignored, ...persisted } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {
      // Persistence is best-effort; the session still works without it.
    });
  }, [state]);

  const weekEnd = useMemo(() => addDays(state.weekStart, 6), [state.weekStart]);

  const schedule = useMemo(() => {
    const { household, weekStart, locked, seed } = state;

    // History-aware balancing: whoever ran heavy last week starts this week
    // ahead, so the scheduler hands them less. Last week is regenerated rather
    // than stored, which keeps the two weeks consistent with current rules.
    let carryOver: Record<MemberId, number> | undefined;
    if (household.rules.carryOverPreviousImbalance) {
      const previousStart = addDays(weekStart, -7);
      const previous = generateSchedule(household, {
        start: previousStart,
        end: addDays(previousStart, 6),
        seed,
      });
      carryOver = carryOverFrom(previous.balance, 0.5);
    }

    return generateSchedule(household, {
      start: weekStart,
      end: addDays(weekStart, 6),
      locked,
      seed,
      ...(carryOver ? { carryOver } : {}),
    });
  }, [state]);

  const assignTo = useCallback(
    (instanceId: string, taskId: TaskId, date: ISODate, memberId: MemberId) => {
      dispatch({
        type: 'pin',
        assignment: { instanceId, taskId, date, memberId, locked: true },
      });
    },
    [],
  );

  const isPinned = useCallback(
    (instanceId: string) => state.locked.some((a) => a.instanceId === instanceId),
    [state.locked],
  );

  const callOut = useCallback(
    (memberId: MemberId, date: ISODate, note?: string) => {
      dispatch({ type: 'addException', memberId, date, note });

      // Keep today's affected chores pinned to the caller-out for now — the
      // moment the exception lands the scheduler would otherwise be free to
      // hand them to someone else on its own, silently. The whole point of
      // this flow is to ask the household first.
      const affected = schedule.assignments.filter(
        (a) => a.memberId === memberId && a.date === date,
      );
      for (const assignment of affected) {
        dispatch({ type: 'pin', assignment: { ...assignment, locked: true } });
        const request = proposeSwap(schedule.assignments, {
          id: `cover:${assignment.instanceId}:${Date.now()}`,
          instanceId: assignment.instanceId,
          fromMemberId: memberId,
        });
        dispatch({ type: 'addOpenRequest', request });
      }
    },
    [schedule.assignments],
  );

  const claimRequest = useCallback(
    (requestId: string, claimantId: MemberId): SwapEvaluation => {
      const request = state.openRequests.find((r) => r.id === requestId);
      if (!request) return { ok: false, problems: ['That request no longer exists.'] };

      const evaluation = evaluateSwap(
        state.household,
        schedule.assignments,
        request.instanceId,
        claimantId,
      );
      if (!evaluation.ok) return evaluation;

      const assignment = schedule.assignments.find(
        (a) => a.instanceId === request.instanceId,
      );
      if (assignment) {
        dispatch({
          type: 'pin',
          assignment: { ...assignment, memberId: claimantId, locked: true },
        });
      }
      dispatch({ type: 'removeOpenRequest', requestId });
      return evaluation;
    },
    [state.openRequests, state.household, schedule.assignments],
  );

  const escalateRequest = useCallback(
    (requestId: string, toMemberId: MemberId) => {
      const request = state.openRequests.find((r) => r.id === requestId);
      if (!request) return;
      dispatch({ type: 'updateOpenRequest', request: { ...request, toMemberId } });
    },
    [state.openRequests],
  );

  const respondToEscalation = useCallback(
    (requestId: string, approve: boolean): SwapEvaluation => {
      const request = state.openRequests.find((r) => r.id === requestId);
      if (!request || !request.toMemberId) {
        return { ok: false, problems: ['Nothing is waiting on an answer.'] };
      }

      if (!approve) {
        // Back into the open pool — the caller-out can propose someone else.
        dispatch({
          type: 'updateOpenRequest',
          request: { ...request, toMemberId: null },
        });
        return { ok: true, problems: [] };
      }

      const evaluation = evaluateSwap(
        state.household,
        schedule.assignments,
        request.instanceId,
        request.toMemberId,
      );
      if (!evaluation.ok) return evaluation;

      const assignment = schedule.assignments.find(
        (a) => a.instanceId === request.instanceId,
      );
      if (assignment) {
        dispatch({
          type: 'pin',
          assignment: { ...assignment, memberId: request.toMemberId, locked: true },
        });
      }
      dispatch({ type: 'removeOpenRequest', requestId });
      return evaluation;
    },
    [state.openRequests, state.household, schedule.assignments],
  );

  const cancelRequest = useCallback(
    (requestId: string) => {
      const request = state.openRequests.find((r) => r.id === requestId);
      dispatch({ type: 'removeOpenRequest', requestId });
      // Let the scheduler decide again rather than leaving it stuck on
      // someone who already said they can't do it.
      if (request) dispatch({ type: 'unpin', instanceId: request.instanceId });
    },
    [state.openRequests],
  );

  const isRequestExpired = useCallback(
    (request: SwapRequest) =>
      isSwapExpired(request, state.household.rules.openCoverageWindowMinutes),
    [state.household.rules.openCoverageWindowMinutes],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      schedule,
      weekEnd,
      dispatch,
      assignTo,
      isPinned,
      callOut,
      claimRequest,
      escalateRequest,
      respondToEscalation,
      cancelRequest,
      isRequestExpired,
    }),
    [
      state,
      schedule,
      weekEnd,
      assignTo,
      isPinned,
      callOut,
      claimRequest,
      escalateRequest,
      respondToEscalation,
      cancelRequest,
      isRequestExpired,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useHousehold(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error('useHousehold must be used inside a HouseholdProvider');
  }
  return value;
}

/** Look up a member by id, tolerating ids that no longer exist. */
export function useMemberLookup(): (id: MemberId) => Member | undefined {
  const { household } = useHousehold();
  return useCallback(
    (id: MemberId) => household.members.find((m) => m.id === id),
    [household.members],
  );
}
