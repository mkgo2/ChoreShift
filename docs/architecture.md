# Architecture

## The shape of it

```
┌─────────────────────────────────────────────┐
│  apps/mobile        Expo Router, 5 tabs     │
│                                             │
│  household-store.tsx                        │
│    state:   household, weekStart, pins, seed│
│    derived: schedule  ← recomputed, never   │
│                          stored             │
└──────────────────────┬──────────────────────┘
                       │ generateSchedule()
┌──────────────────────▼──────────────────────┐
│  packages/engine    pure TypeScript         │
│                     zero runtime deps       │
│                                             │
│  types → recurrence → availability → rules  │
│        → schedule → balance → swaps         │
└─────────────────────────────────────────────┘
```

Two workspaces, one rule between them: **the engine never imports React Native.** That is enforced by the split — the engine is its own npm workspace with no dependencies at all, so an accidental UI import fails immediately rather than quietly making the scheduler untestable in Node.

## Why the schedule is derived, not stored

The app stores what the user edits — people, chores, rules, pinned assignments, the week on screen — and recomputes the schedule from that on every change. It never persists a schedule.

For a household-sized problem (a handful of people, a few dozen weekly chore instances) a full regeneration is microseconds, so there is no performance reason to cache. There is a strong correctness reason not to: a stored schedule can drift out of sync with the rules that produced it. Edit someone's availability and a cached schedule silently keeps an assignment that is now impossible. Deriving it means the screen can never show a schedule the current rules would not produce.

The one thing that *is* stored is **pins**. When an admin reassigns a chore by hand, that becomes a locked assignment which the engine treats as fixed and rebalances around. Pins are user intent, so they persist; everything else is a consequence.

**Open coverage requests** are the second stored thing, added alongside pins for the call-out flow. Marking a date unavailable (`callOut` in `household-store.tsx`) does two things at once: it adds an `AvailabilityException` for that member, and it pins that day's affected assignments to them rather than letting the scheduler quietly hand the work to someone else the moment the exception lands. A `SwapRequest` (from `packages/engine/src/swaps.ts`) tracks the rest — open to anyone, then narrowed to a specific person past the household's coverage window. Claiming or approving one just calls `evaluateSwap` for the hard-rule check and then re-pins, the same mechanism the Week screen's manual reassignment already uses. Nothing here bypasses the filters-not-costs rule: a claim or an approval that would break a hard rule is refused with the same reasons `evaluateSwap` gives anywhere else.

## Determinism

`generateSchedule` is a pure function. The same household, date range, pins and seed always produce the same schedule.

Tie-breaks use a tiny deterministic value derived from the seed and the (instance, member) pair — small enough that it can never outweigh a real cost difference, so it only separates genuinely equal options. Bumping the seed is what the **Regenerate** button does: it produces a different but equally fair schedule, rather than a random one.

## Persistence

`AsyncStorage`, which is `localStorage` on web and native storage on a device — one API for both targets. Writes are best-effort: if storage fails or the stored blob is unreadable, the app falls back to the seeded example household rather than showing a blank screen.

State is versioned by key (`choreshift.state.v1`). A breaking change to the shape of `AppState` means a new key, not a migration guess.

## Monorepo mechanics

npm workspaces. The engine is consumed as `@choreshift/engine` and resolves to its TypeScript source, not a build artifact — there is no build step to run or forget.

Metro needs two things to make that work across workspace boundaries, both set in `apps/mobile/metro.config.js`: `watchFolders` pointing at the repo root, so edits to the engine trigger a reload; and `nodeModulesPaths` including the root, so hoisted dependencies resolve. Without them the app either fails to start or silently stops hot-reloading engine changes.

## What is deliberately absent

No backend, no accounts, no network. Everything through Phase 1 — availability, scheduling, balancing, manual override — runs entirely on-device.

That is not a shortcut; it is where the line genuinely falls. Reminders and cross-device sync are the only features that actually require a server, which is why they are Phase 2 and 3. An offline MVP that does the hard part well is more useful than a thin client waiting on infrastructure.

## Phase 2 and beyond

Swap logic (`packages/engine/src/swaps.ts`) is already written and tested, including the check that an approved swap must still satisfy every hard rule. What it lacks is the multi-device flow: a second person has to see the request and approve it, which needs accounts and sync.

When that arrives, the natural split is to keep the engine on-device — it is fast, offline-capable, and deterministic — and use the server for identity, sync, and the scheduled jobs that fire reminders. The scheduler itself has no reason to move.
