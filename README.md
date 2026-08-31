# ChoreShift

**v0.1.0** — a household chore scheduler that splits work fairly: by the effort each chore actually takes, and around the hours each person is genuinely free.

Most chore apps get two things wrong.

They are **availability-blind** — they rotate chores without knowing that one housemate is out every weekday evening, so a 9pm dish load lands on someone who isn't home. And they treat **rotation as fairness**, when rotation only balances the *number* of chores. Mopping and taking the bins out are not the same job, and counting them as one each is how the same person quietly ends up doing all the heavy work.

ChoreShift fixes both. Every chore carries a point value for how much work it is. Every member has real availability windows. The scheduler only offers a chore to someone actually free for it, and balances **total points**, not chore counts.

---

## Status — updated 31 August 2026

**Phase 1 (local MVP) is complete and runs**, now with a call-out and coverage-request flow on top. The scheduling engine has 60 passing tests, and the app is a working five-tab Expo build that runs on a phone or in a browser. Everything is still on-device: no accounts, no server, no sign-up.

On the bundled example household — three roommates with genuinely incompatible schedules, ~21 chores a week, 55 points of effort — the scheduler places every chore and lands on a **0.5-point spread across three people**, while never once handing a night chore to the housemate who is out every evening.

The balance screen shows the thesis working: Alex does **6** chores, Bailey and Casey do **7** each, and all three land within half a point of one another. Chore counts differ; effort doesn't.

Marking yourself unavailable for a date ("I'm out Saturday") now does something: anything you're already scheduled for that day goes up for grabs to the rest of the household, first-come first-served. If nobody claims it inside the household's coverage window (2 hours by default, configurable in Rules), you name a specific person instead — and it still doesn't move until they accept. Every step is checked against the same hard rules the scheduler itself never breaks, so a claim or an approval can't quietly hand someone a chore they aren't free for.

**Next up — Phase 2:** accounts and sync across devices, so a call-out on one person's phone actually reaches everyone else's — today this all lives in one local app instance. Completion tracking is also unstarted.

## Roadmap

- [x] **Phase 1 — Local MVP.** Members with availability windows, chore CRUD with point values, the scheduling engine with hard rules and soft preferences, manual override with pinning, a live balance view, and a call-out → claim → escalate → approve coverage flow. No backend.
- [ ] **Phase 2 — Multiplayer.** Accounts, household sync across devices — the missing piece the coverage flow needs to work across separate phones — plus completion tracking.
- [ ] **Phase 3 — Reminders & polish.** Push notifications (so a call-out actually alerts people instead of waiting for them to open the app), overdue nudges, streaks and leaderboard.
- [ ] **Phase 4 — Extensions.** Bill splitting, shared shopping lists, household templates.

## Recent changes

- **2026-08-31 — Call-out and coverage requests.** "I'm out on this date" is now a real control on each member's availability editor. It marks the day unavailable and puts anything already on the schedule that day up for grabs: open to the whole household first, escalating to a specific person (who still has to accept) only if nobody claims it inside the household's coverage window. New engine primitive: `isSwapExpired`, plus a configurable `openCoverageWindowMinutes` rule. No backend involved — this runs entirely within the existing local app state, which is also its current limit: it only works within one app instance, not yet across each person's own phone. See [docs/architecture.md](docs/architecture.md) for how it fits alongside pins.
- **2026-08-30 — v0.1.0.** Initial build: monorepo scaffold, the complete scheduling engine (`packages/engine`, 56 tests), the Expo app (`apps/mobile`) with all five screens, and CI on every push and PR.

---

## Quickstart

```bash
npm install
```

Run the tests — the fastest way to see what the engine actually promises:

```bash
npm test
```

Run the app in a browser:

```bash
npm run web
```

Run it on your phone with `npm start`, then scan the QR code with [Expo Go](https://expo.dev/go). The app opens seeded with the example household, so there is something real to look at immediately.

## How the scheduler works

Two passes. A **greedy seed** walks the most-constrained chores first, so the hard-to-place jobs get the pick of the household before the easy ones have used everyone up. Then a **local search** moves and swaps assignments for as long as doing so lowers the cost, until the point gap sits inside the household's tolerance.

The critical design decision: **hard rules are filters, soft rules are costs.**

- **Hard** — availability, blackout days, chore-pair exclusions, co-location limits. These remove a member from consideration entirely. No amount of balancing pressure can talk the scheduler into breaking one.
- **Soft** — keeping a chore with one person, shifting weekend load onto whoever is home, and minimising churn between regenerations. These only break ties between members who are already allowed.

When nobody can take a chore, it comes back as *unassigned* with a plain-English reason. It is never forced onto someone who isn't free, and never silently dropped.

Full write-up: [docs/scheduling-engine.md](docs/scheduling-engine.md).

## Project layout

```
packages/engine/   The scheduler. Pure TypeScript, zero runtime dependencies.
                   Runs the same in Node, a browser, and React Native — and is
                   tested without any of them.
apps/mobile/       Expo Router app. Five tabs: Week, Balance, Tasks, People, Rules.
docs/              Scope, architecture, and the engine spec.
```

The engine is deliberately separate from the app and cannot import React Native. To work on scheduling you never need a mobile toolchain — `npm test` is the entire loop.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), which lists where the interesting work is. In short: the engine has the meatiest open problem (the local search is a hill-climb and can settle in a local optimum; a real constraint solver would beat it), and the UI has the most surface area.

## Docs

- [docs/scope.md](docs/scope.md) — the original project scope
- [docs/architecture.md](docs/architecture.md) — how the pieces fit together
- [docs/scheduling-engine.md](docs/scheduling-engine.md) — the algorithm in detail
