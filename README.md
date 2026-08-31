# ChoreShift

**v0.1.0** — a household chore scheduler that splits work fairly: by the effort each chore actually takes, and around the hours each person is genuinely free.

Most chore apps get two things wrong.

They are **availability-blind** — they rotate chores without knowing that one housemate is out every weekday evening, so a 9pm dish load lands on someone who isn't home. And they treat **rotation as fairness**, when rotation only balances the *number* of chores. Mopping and taking the bins out are not the same job, and counting them as one each is how the same person quietly ends up doing all the heavy work.

ChoreShift fixes both. Every chore carries a point value for how much work it is. Every member has real availability windows. The scheduler only offers a chore to someone actually free for it, and balances **total points**, not chore counts.

---

## Status — updated 30 August 2026

**Phase 1 (local MVP) is complete and runs.** The scheduling engine is finished, with 56 passing tests, and the app is a working five-tab Expo build that runs on a phone or in a browser. Everything is on-device: no accounts, no server, no sign-up.

On the bundled example household — three roommates with genuinely incompatible schedules, ~21 chores a week, 55 points of effort — the scheduler places every chore and lands on a **0.5-point spread across three people**, while never once handing a night chore to the housemate who is out every evening.

The balance screen shows the thesis working: Alex does **6** chores, Bailey and Casey do **7** each, and all three land within half a point of one another. Chore counts differ; effort doesn't.

**Next up — Phase 2:** accounts, sync across devices, completion tracking, and the swap-approval flow. The engine-side swap logic is already written and tested; what it needs is multi-device plumbing.

## Roadmap

- [x] **Phase 1 — Local MVP.** Members with availability windows, chore CRUD with point values, the scheduling engine with hard rules and soft preferences, manual override with pinning, and a live balance view. No backend.
- [ ] **Phase 2 — Multiplayer.** Accounts, household sync across devices, completion tracking, full swap-request approval flow.
- [ ] **Phase 3 — Reminders & polish.** Push notifications, overdue nudges, streaks and leaderboard, one-off availability exceptions in the UI.
- [ ] **Phase 4 — Extensions.** Bill splitting, shared shopping lists, household templates.

## Recent changes

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
