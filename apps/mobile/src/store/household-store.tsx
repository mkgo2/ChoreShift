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
  generateSchedule,
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
  hydrated: boolean;
}

function initialState(): AppState {
  return {
    household: seedHousehold(),
    weekStart: mondayOf(todayISO()),
    locked: [],
    seed: 1,
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
      const rules: Rules = {
        ...state.household.rules,
        blackouts: state.household.rules.blackouts.filter(
          (b) => b.memberId !== action.memberId,
        ),
        preferences: state.household.rules.preferences.filter(
          (p) => p.memberId !== action.memberId,
        ),
      };
      return { ...state, locked, household: { ...state.household, members, rules } };
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
      const rules: Rules = {
        ...state.household.rules,
        taskPairExclusions: state.household.rules.taskPairExclusions.filter(
          ([a, b]) => a !== action.taskId && b !== action.taskId,
        ),
        preferences: state.household.rules.preferences.filter(
          (p) => p.taskId !== action.taskId,
        ),
      };
      return { ...state, locked, household: { ...state.household, tasks, rules } };
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

  const value = useMemo<StoreValue>(
    () => ({ ...state, schedule, weekEnd, dispatch, assignTo, isPinned }),
    [state, schedule, weekEnd, assignTo, isPinned],
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
