# ChoreShift — Project Scope

*(working title)*

## One-line summary

A household chore-management app that generates a **fair** chore schedule from each person's real availability and the **effort each task actually takes**, then keeps it fair over time through swap requests, completion tracking, and reminders.

## The problem

Every household eventually needs a chore split, and it almost always breaks down for the same reasons: the schedule ignores who's actually free when, it treats all tasks as equal when mopping is plainly harder than taking out the garbage, and the same person quietly ends up doing the heavy work. Existing apps (Sweepy, Flatastic, Besties, Chap, and similar) handle reminders and simple rotation well, but they share two blind spots. They are **availability-blind** — they rotate tasks without knowing that one person can't take Monday mornings or that a night task can't go to someone who's out by 5pm. And they treat rotation as fairness, when true fairness is about **balancing total effort**, not counting tasks.

ChoreShift is built around those two ideas: schedule against real availability windows, and balance by weighted effort rather than task count.

## What makes it different

1. **Effort-weighted tasks.** Every task carries a point value representing how much work it is (e.g. mop = 4, dishloading = 3, kitchen counter+sweep = 4, dish-unloading = 2, garbage = 2). Fairness is measured by total points per person, not number of chores.
2. **Constraint-aware scheduling.** Each member has availability windows (the hours/days they can actually do chores). The scheduler only assigns a task to someone who is free during the window that task requires — a night task never lands on someone who's gone by evening.
3. **Rule-based fairness, not just rotation.** The engine enforces household-specific rules: even point distribution, no one doing conflicting tasks on the same day, limits on how many people share a space at once, and preferences like "keep morning unloads with one person where possible" or "shift weekend load onto whoever's home."
4. **Swap requests with approval.** Members can propose swaps; the counterparty (or an admin) approves, and points automatically recalculate so a swap can't quietly unbalance the week.

## Target users

Adult households and roommate groups (2–6 people) who want a fair, visible split without one person acting as permanent manager. Not focused on kids-with-rewards; the design assumes adults with jobs, classes, and genuinely different schedules.

## Core concepts (domain model)

- **Household** — a group of members sharing a task list and schedule.
- **Member** — a person, with one or more **availability windows** (day-of-week + start/end time) describing when they can do chores.
- **Task** — a chore with a **point value** (effort), a **timing** (morning / night / anytime), a **recurrence** (daily, specific weekdays, every N days, biweekly, etc.), and optional flags (e.g. "group task, no points" for things everyone does together like fridge cleaning).
- **Assignment** — a specific task on a specific date given to a specific member; the atomic unit of the schedule.
- **Swap request** — a proposed reassignment between two members, pending approval.
- **Completion record** — a log of who did what, when, for history and accountability.

## Feature scope

### Household & member management
Create a household, invite members (link or code), set each member's role (admin / member), and define each member's availability windows. Members can be paused (e.g. traveling) so the scheduler skips them.

### Task management
Full create / edit / delete on tasks. Set the point value, timing, recurrence, and any flags. Support one-off tasks as well as recurring ones. Support combined tasks (e.g. "kitchen counter + sweep" as a single 4-point unit) and group tasks done together with no individual points.

### Availability & shift tracking
Define recurring weekly availability per member, plus one-off exceptions (out this Saturday, extra-free this week). The schedule is always generated against current availability.

### Scheduling engine (the core)
Auto-generate a schedule for a given period (a week by default) that:
- assigns each task instance only to members free in the required window,
- balances total points across members as evenly as possible,
- respects a configurable set of fairness/co-location rules (see below),
- and leaves manual override always available — an admin can hand-edit any assignment and the engine re-balances around the locked cell.

**Configurable rules the engine understands:**
- Per-member blackouts ("no tasks for this person on these days").
- Task-pair exclusions ("no one gets kitchen and dishloading on the same day").
- Co-location limits ("at most 2 people in the kitchen at once").
- Assignment preferences ("keep morning unloads with one person where possible" — a soft preference, not a hard rule).
- Load-shifting rules ("push weekend tasks onto members who are home on weekends").
- Balance tolerance (how large a point gap between members is acceptable before the engine keeps optimizing).

### Manual assignment & overrides
Drag/reassign any task, lock specific assignments, and regenerate the rest around them.

### Swap requests
A member proposes swapping one of their assignments with another member (or offers it up for anyone to take). The counterparty or an admin approves or declines. On approval the assignment moves and both members' point totals update automatically.

### Points, balance & leaderboard
Live per-member point totals for the current period, running history over time, and an optional leaderboard/streak view for households that like a bit of friendly competition. The primary view is the **balance view** — how evenly effort is currently distributed.

### Completion tracking
Mark tasks done; see who completed what and when; surface overdue tasks. History feeds both accountability and future balancing (e.g. carrying a slight imbalance into next week to even out).

### Reminders & notifications
Per-assignment reminders ("your night dishloading is due"), overdue nudges, swap-request alerts, and approval notifications. Requires push infrastructure.

## Technical architecture (proposed)

- **Client:** cross-platform mobile app (React Native or Flutter) with a shared household view. Optionally a lightweight web view for setup.
- **Backend:** a server for accounts, household sync, swap approval flow, and — critically — **scheduled jobs** that fire reminders/notifications. A managed backend (e.g. Firebase) covers auth, real-time sync, and Cloud Messaging for push in one stack; a custom backend (Node/Postgres + a job scheduler + FCM/APNs) gives more control.
- **Scheduler:** a constraint-satisfaction + load-balancing routine. For household-sized problems (a handful of people, a few dozen weekly task instances) this is small enough to run client-side or as a serverless function. It can start as a greedy assign-then-rebalance heuristic and graduate to a proper constraint solver if needed.
- **Notifications:** push via FCM/APNs, driven by server-side scheduled jobs keyed off assignment times and reminder offsets.

Layers up through swaps and balancing can run entirely on-device; only reminders/push genuinely require the backend, so an offline-capable MVP is realistic.

## Phased roadmap

**Phase 1 — MVP (local, no server).** Household + members with availability, task CRUD with points, the scheduling engine with the core rules, manual override, and a live balance view. Everything on-device. This is the part with the most unique value and can ship without backend infrastructure.

**Phase 2 — Multiplayer.** Accounts, household sync across devices, completion tracking, and the full swap-request approval flow with automatic point recalculation.

**Phase 3 — Reminders & polish.** Push notifications, overdue nudges, streaks/leaderboard, availability exceptions, and history-aware balancing (carry-over of small imbalances).

**Phase 4 — Optional extensions.** Bill/expense splitting, shared shopping lists, photo-to-task capture, and templated household presets — the adjacent features that turn it from a chore app into a full shared-living tool.

## Out of scope (for now)

Kid-reward/allowance mechanics, in-app payments, and anything requiring integrations beyond notifications. These can be revisited in Phase 4.

## Success criteria

- A new household can go from zero to a fair, availability-respecting weekly schedule in a few minutes.
- The generated schedule keeps every member within a small, configurable point gap of each other.
- No assignment ever violates a member's availability or a hard household rule.
- Swaps keep the week balanced without manual bookkeeping.
- The same person stops silently absorbing the heavy tasks — which is the entire reason the app exists.
