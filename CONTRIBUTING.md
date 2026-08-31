# Contributing to ChoreShift

Thanks for looking. This is an early project with a clear thesis, so the most useful contributions are the ones that sharpen it rather than broaden it.

## Getting set up

You need Node 20 or newer. Nothing else.

```bash
npm install
npm test
```

If the tests pass, you have a working environment. You do **not** need Xcode, Android Studio, or a phone to work on the scheduler.

To run the app:

```bash
npm run web     # browser
npm start       # then scan the QR code with Expo Go
```

## Where the code lives

| Path | What it is |
| --- | --- |
| `packages/engine/src/types.ts` | The domain model. Read this first — everything else assumes it. |
| `packages/engine/src/schedule.ts` | The scheduler: greedy seed, then local search. |
| `packages/engine/src/availability.ts` | Who is free when. The half other chore apps skip. |
| `packages/engine/src/rules.ts` | Hard rules (filters) and soft rules (costs). |
| `packages/engine/src/balance.ts` | Point accounting and carry-over. |
| `packages/engine/src/seed.ts` | The example household, used by the app and the tests. |
| `apps/mobile/src/store/household-store.tsx` | All app state. The schedule is derived, never stored. |
| `apps/mobile/src/app/*.tsx` | One file per tab. |

## Two conventions that matter

**Hard rules are filters, soft rules are costs.** If you are adding a constraint, decide which it is. A hard rule removes a member from the candidate list, so it can never be traded away for a better balance. A soft rule adds to the cost function, so it only breaks ties. Putting a hard rule in the cost function is the single easiest way to break the app's central promise.

**Dates are `YYYY-MM-DD` strings and times are minutes since midnight.** No `Date` objects cross a module boundary in the engine. A scheduler that shifts by a day depending on which timezone the phone is in is a scheduler nobody can trust, and string dates make that class of bug impossible.

## Tests

The engine's test suite is written as one test per claim the project makes — "never assigns anyone a chore they are not free for", "balances effort to within the household tolerance", "keeps a locked assignment and rebalances everything else around it". If you change behaviour, the test names should still read as true sentences about the product.

```bash
npm test                              # once
npm run test:watch -w @choreshift/engine   # while working
```

CI runs the engine tests and typechecks both workspaces on every push and pull request.

## Good places to start

**Engine, hardest and most valuable.** The rebalance pass is a hill-climb over single moves and pairwise swaps. It is fast and good enough for household-sized problems, but it can settle in a local optimum — there are arrangements it cannot reach because every single step away from them looks worse. Replacing it with a proper constraint solver, or adding restarts or simulated annealing, is the most interesting open problem here.

**Engine, smaller.** Monthly recurrences (`the first Saturday`), chores that need two people at once, and per-chore minimum gaps ("not two days running") are all unmodelled.

**App.** One-off availability exceptions (`Member.exceptions`) now have a UI via the "Called out" section on each member's editor, which also drives a claim → escalate → approve coverage-request flow for whatever they were already scheduled to do that day. What's still missing: an exception for anything short of a full day off (partial-day windows), and a way to propose a swap outside the call-out flow — trading two assignments directly with no availability change involved. Completion tracking is Phase 2 and unstarted.

**Docs.** If something in `docs/` was wrong or confusing when you read it, that is worth a PR on its own.

## Pull requests

- Keep the diff to one idea.
- Add or update a test when you change engine behaviour.
- Match the surrounding style; there is no linter to argue with you, so read the neighbouring code.
- Say what you changed and why in the description. "Why" is the part reviewers cannot reconstruct.

## Reporting a bug

The most useful bug report for a scheduler is a failing case: the members, their windows, the chores, and what the engine did that it should not have. A snippet building a `Household` and calling `generateSchedule` is ideal — that translates straight into a regression test.
