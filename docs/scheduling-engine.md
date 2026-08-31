# The scheduling engine

This is the part of ChoreShift worth reading. Everything else is a way to look at what it produces.

## The problem

Given a household — people with availability windows, chores with point values, timings and recurrences, and a set of rules — produce a week's assignments such that:

1. no assignment lands on someone who isn't free for it,
2. no hard rule is broken,
3. total **points** per person are as even as possible,
4. soft preferences are honoured where they don't cost fairness,
5. and anything impossible is reported, not hidden.

Point 3 is what separates this from rotation. Rotation balances the *count* of chores. If mopping is a 4 and taking the bins out is a 2, then an even rotation hands one person twice the work and calls it fair.

## Vocabulary

- **Task** — a recurring chore: points, timing, recurrence, optional space and duration.
- **Task instance** — one occurrence of a task on one date. `task-mop@2026-09-12`. The unit that gets assigned.
- **Assignment** — an instance given to a member, optionally `locked`.
- **Timing** — `morning`, `night`, or `anytime`, mapped to real clock ranges the household configures. Morning is not hardcoded to 6am.

## Step 1 — Expand

Recurrences become dated instances across the requested range. `daily`, `weekdays`, `everyNDays`, `biweekly` and `once` are supported.

Biweekly parity is measured **week to week**, not day to day, anchored on the Sunday of the anchor's week. A biweekly chore running Monday and Thursday keeps both days in the same week as each other — measuring from the anchor date alone would drift them apart.

Group tasks are split out here. They are assigned to everyone, worth zero points, and excluded from balancing — the fridge clean nobody owns.

## Step 2 — Eligibility

For each instance, compute the set of members who *could* take it:

- not paused,
- not blacked out on that date,
- and holding **one contiguous free block**, inside the timing window on that date, at least as long as the chore takes.

Contiguity matters. Three scattered ten-minute gaps do not add up to a half-hour mop, so overlap is never summed — the longest single stretch is what counts.

A one-off availability exception replaces the weekly pattern for that date entirely, including replacing it with nothing. That is how "I'm away Saturday" is expressed.

## Step 3 — Greedy seed

Instances are sorted **most-constrained-first**: fewest eligible members, then highest points, then id for stability. The hard-to-place jobs pick from the whole household before the easy ones have used everyone up. Assign the other way round and the Sunday-night chore that only two people can do finds both of them already busy.

Each instance goes to whichever eligible member minimises the cost delta — dominated by the balance term, so in practice, whoever is currently lightest.

Pinned assignments are seeded first and consume capacity before any of this runs.

## Step 4 — Local search

While an improving move exists, apply the single best one:

- **Move** — hand one assignment to a different eligible member.
- **Swap** — trade two assignments between two members. This escapes the dead end where no single move helps but an exchange does: two people each holding one chore the other should have.

Both are checked against the hard rules in their post-move state before being considered.

The search stops at a local optimum or an iteration cap. It is a hill-climb, so it can settle somewhere a smarter search would escape — in practice it reaches a 0.5-point spread on the example household, but this is the most interesting thing in the codebase to improve.

## The cost function

```
cost = balance-spread
     + 0.6 × unmet preference weight
     + 0.4 × load-shift penalty
     + 0.15 × churn
```

**Balance** is the sum of squared deviations from the mean, not the raw max-minus-min gap. The plain gap is flat whenever a move helps the middle of the pack without touching either extreme, and the search stalls there. Squared deviation keeps a gradient everywhere.

The reported `gap` is still max-minus-min, because that is the number a person actually wants to see.

**Preference** pays for the preference weight passed up — a nudge toward "keep the morning unload with one person".

**Load shift** favours whoever is most free on flagged days: "push the weekend load onto whoever is home".

**Churn** penalises differing from a previous schedule. Regenerating after adding one chore should not reshuffle a week people have already memorised. It is weighted low on purpose — measured across seeds, passing the previous week in never retains fewer assignments and often several more, while the point gap stays identical. Stability never costs fairness.

Hard constraints appear **nowhere** in this function. They are filters applied before a candidate is ever scored. That is the structural reason the app can promise no assignment violates availability: there is no exchange rate at which the scheduler would accept one.

## Determinism and the Regenerate button

Tie-breaks add a value under `1e-6`, hashed from the seed and the (instance, member) pair. It is far too small to outweigh any real cost difference, so it only separates exactly-equal options.

Consequences: the same input and seed always produce the same schedule, and changing the seed produces a *different but equally fair* one. That is what **Regenerate** does — reshuffle among equally good answers, not roll dice on quality.

## Failure is reported, never forced

`generateSchedule` always returns a result. It never throws, and it never assigns an instance to someone ineligible. Anything unplaceable comes back in `unassigned` with a reason:

- `no-member-available` — nobody is free in that window, or everyone free is blacked out. The detail names the actual clock range.
- `blocked-by-rules` — people are free, but a pair exclusion or co-location limit rules all of them out.
- `no-active-members` — everyone is paused.

A partial schedule with honest gaps is more useful than a complete one built on an assignment somebody cannot keep.

## Carry-over

`carryOverFrom` turns a finished period's balance into starting offsets for the next: whoever ran heavy begins the next week already ahead, so the scheduler hands them less. The offsets sum to zero.

The app applies this at half strength and regenerates the previous week rather than storing it, keeping both weeks consistent with the rules as they stand now.

## Complexity

Household-sized by design. With `n` instances and `k` members, the greedy pass is `O(n·k)` and each search iteration is `O(n²)` over swap candidates with `O(1)` cost deltas. For 21 instances and 3 members that is microseconds — small enough to recompute on every keystroke, which is exactly what the app does.

A household of 6 with 60 weekly chores is still trivially fast. This design does not need to scale further, and trading its clarity for headroom nobody needs would be a bad deal.
