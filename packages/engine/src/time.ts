/**
 * Calendar and clock-time helpers.
 *
 * Two deliberate choices keep the engine testable:
 *  - Dates are `YYYY-MM-DD` strings, never `Date` objects. A `Date` carries a
 *    timezone, and a scheduler that shifts by a day depending on where the
 *    phone is standing is a scheduler nobody can trust.
 *  - Clock times are minutes since midnight (`420` === 07:00), so window
 *    overlap is plain integer arithmetic.
 */

/** A calendar date in `YYYY-MM-DD` form. */
export type ISODate = string;

/** Minutes since local midnight. `0` = 00:00, `1440` = end of day. */
export type Minutes = number;

/** 0 = Sunday ... 6 = Saturday, matching `Date.getUTCDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MINUTES_PER_DAY = 1440;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): value is ISODate {
  return ISO_DATE.test(value) && !Number.isNaN(toEpochDay(value));
}

function assertISODate(date: ISODate): void {
  if (!ISO_DATE.test(date)) {
    throw new TypeError(`Expected a YYYY-MM-DD date, received "${date}"`);
  }
}

/**
 * Days since the Unix epoch. Everything date-related is built on this, and it
 * runs entirely in UTC so no local timezone can shift a result.
 */
export function toEpochDay(date: ISODate): number {
  assertISODate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function fromEpochDay(epochDay: number): ISODate {
  const d = new Date(epochDay * 86_400_000);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: ISODate, to: ISODate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function weekdayOf(date: ISODate): Weekday {
  // 1970-01-01 was a Thursday (weekday 4).
  const dow = (((toEpochDay(date) + 4) % 7) + 7) % 7;
  return dow as Weekday;
}

/** The Sunday on or before `date` — the anchor for week-parity arithmetic. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, -weekdayOf(date));
}

/** Every date from `start` to `end`, inclusive. */
export function datesInRange(start: ISODate, end: ISODate): ISODate[] {
  const span = daysBetween(start, end);
  if (span < 0) return [];
  const out: ISODate[] = [];
  for (let i = 0; i <= span; i += 1) out.push(addDays(start, i));
  return out;
}

/** `"07:30"` -> `450`. */
export function parseClock(hhmm: string): Minutes {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new TypeError(`Expected a HH:MM time, received "${hhmm}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) {
    throw new RangeError(`"${hhmm}" is not a valid time of day`);
  }
  return hours * 60 + minutes;
}

/** `450` -> `"07:30"`. */
export function formatClock(minutes: Minutes): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function weekdayName(weekday: Weekday): string {
  return WEEKDAY_NAMES[weekday] ?? 'Unknown';
}

/** Minutes shared by two half-open intervals. Zero when they do not overlap. */
export function overlapMinutes(
  aStart: Minutes,
  aEnd: Minutes,
  bStart: Minutes,
  bEnd: Minutes,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}
