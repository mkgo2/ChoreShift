/**
 * @choreshift/engine
 *
 * A constraint-aware, effort-balancing chore scheduler. Pure TypeScript with no
 * runtime dependencies, so it runs identically in Node, a browser, and React
 * Native, and can be tested without any of them.
 *
 * The short version:
 *
 * ```ts
 * import { generateSchedule, seedHousehold } from '@choreshift/engine';
 *
 * const result = generateSchedule(seedHousehold(), {
 *   start: '2026-09-07',
 *   end: '2026-09-13',
 * });
 *
 * result.balance;   // points per member
 * result.gap;       // heaviest minus lightest
 * result.unassigned // anything nobody could take, with the reason why
 * ```
 */

export * from './types';
export * from './time';
export * from './availability';
export * from './recurrence';
export * from './rules';
export * from './balance';
export * from './schedule';
export * from './swaps';
export * from './seed';
