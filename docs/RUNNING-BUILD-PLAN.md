# Running module — build plan

Everything needed to build the running feature exactly as specified, in order,
with the decisions already locked. Hand any single step to a fresh agent and it
should be buildable without re-deriving context.

---

## 0. Decisions already made (do not re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Effort input | **RPE 1–10 only** | No watch/HR strap. `avgHr` stays on the type as nullable for later, but the UI does not ask for it. |
| Scope | **Typed runs + pace trends + full running plan** | Prescribed sessions per phase, target paces, progression readouts. |
| Placement | **Workout tab** | It becomes "training" generally — lifting and running side by side, same progression treatment. |
| Compliance vs performance | **Kept separate** | Distance answers "did you do the session" (adherence, feeds the fat-loss engine). Pace answers "are you getting fitter" (performance, its own engine). Never merge them. |
| Target paces | **Derived from the athlete's own easy-pace trend**, not hardcoded | Self-calibrating, no invented numbers, adapts as fitness changes. |

## The one rule that makes or breaks this

> **A deliberately easy run must never be scored as a failure.**

Most runs should be slow. If the app shows a red mark for a well-executed easy
run, it is worse than not tracking pace at all. This is why `type` is a required
field — without intent, pace is uninterpretable.

Corollary, and it is the same lesson the weight engine already encodes:

> **Never compare run to run. Compare like with like, on a trend.**
> Easy vs easy, tempo vs tempo, over rolling multi-week windows.

Daily pace is noisy for exactly the reasons daily bodyweight is — heat, hills,
sleep, fatigue, terrain. The `trend.ts` philosophy applies unchanged.

---

## 1. Existing state the build must respect

- App lives in `frontend/`. Commands are `npm --prefix frontend run <script>`.
- `78` domain tests currently pass. They must still pass at every step.
- `src/domain/types.ts` already defines a `Run` interface and
  `src/db/database.ts` already creates a `runs` table — **both are dead code**.
  Nothing reads or writes them. This build wires them up.
- `DaySchedule` already has `runKm`. It needs `runType` added.
- Compliance already scores a `run` metric off `schedule.runKm * 0.9`.
  **Leave that alone** — it is the adherence half and it is correct.
- Domain layer is pure TS with no IO. Keep it that way; it is why it is testable.

### Invariants (breaking any of these is a bug)

1. `null` = unknown, `0` = a real logged zero. Averages skip nulls.
2. No decision reads a single raw data point — only trends, and only when the
   window has enough readings, else `insufficient_data`.
3. Week-over-week comparisons use **non-overlapping** windows.
4. Rules decide, AI narrates. Nothing auto-applies.
5. Bump `RULES_VERSION` in `src/domain/rules.ts` on any behavioural change — it
   is part of the AI note cache key.
6. UI: one `backdrop-filter` per stacking context. Panels use `.glass`,
   children use `.glass-inset`.
7. Any new chart colours go through the dataviz palette validator before use.

---

## 2. Build order

Each step is independently verifiable. Do not start a step before the previous
one builds and tests green.

### Step 1 — Domain types

`src/domain/types.ts`

```ts
export type RunType = 'recovery' | 'easy' | 'long' | 'tempo' | 'intervals'

export interface Run {
  id: string
  date: LocalDate
  type: RunType
  distanceKm: number | null
  durationMin: number | null
  rpe: number | null          // 1-10, the effort signal
  avgHr: number | null        // reserved; UI does not ask for it
  notes: string | null
  createdAt: Instant
  updatedAt: Instant
}
```

- Add `runType: RunType | null` to `DaySchedule`.
- Add to `Phase`: `weeklyRunKmTarget: number | null`.

### Step 2 — `src/domain/running.ts` (pure, no IO)

| Function | Contract |
|---|---|
| `paceMinPerKm(distanceKm, durationMin)` | `null` unless both present and distance > 0 |
| `effortBand(type, rpe)` | `'easy' \| 'moderate' \| 'hard' \| 'unknown'`. Type is primary; RPE overrides when it clearly contradicts (an "easy" run at RPE 9 is not easy). |
| `easyPaceTrend(runs, endDate, windowDays = 21, minRuns = 3)` | Mean pace of easy-band runs in the window. Returns `insufficient_data` below `minRuns`. |
| `paceProgression(runs, endDate, settings)` | Current 21-day easy-pace window vs the **previous, non-overlapping** 21 days. Improvement requires ≥ **3 s/km** change — anything smaller is noise. Returns `improving \| holding \| slowing \| insufficient_data`. |
| `weeklyRunVolume(runs, endDate)` | Total km in the 7 days ending `endDate`. |
| `volumeRamp(runs, endDate, capPct = 10)` | This week vs mean of the previous 3 weeks. Flags `ramp_too_fast` above the cap, `detraining` on a drop > 30%. Needs ≥ 2 prior weeks of data or returns `insufficient_data`. |
| `longRunProgression(runs, endDate)` | Longest single run per week, trended over 4 weeks. |
| `derivedTargetPaces(easyPaceTrend)` | From the athlete's own easy pace: `long ≈ easy + 10 s/km`, `tempo ≈ easy − 45 s/km`, `intervals ≈ easy − 90 s/km`. Returns `null` when the easy trend is `insufficient_data` — **never invent targets from nothing.** |

Guards that must be in the code, not just intended:

- Never compare across effort bands.
- A run with no duration contributes to volume but **not** to any pace trend.
- Volume ramp is a warning only. It never changes a plan by itself.

### Step 3 — Tests: `src/domain/running.test.ts`

Mirror the style of `trend.test.ts`. Cover at minimum:

- pace maths, including zero/null distance and null duration
- easy-pace trend skips tempo/interval runs entirely
- an "easy" run logged at RPE 9 is excluded from the easy band
- `insufficient_data` below `minRuns`, and the exact boundary at `minRuns`
- non-overlapping progression windows (days 1–21 vs 22–42)
- a 2 s/km change reads as `holding`, 5 s/km as `improving`
- volume ramp: 10% is fine, 25% flags, and it stays quiet with < 2 prior weeks
- `derivedTargetPaces` returns null on an insufficient easy trend
- **the headline case: a slow easy run and a fast tempo run in the same week
  must not make each other look like regressions**

### Step 4 — Seed

`src/domain/seed.ts` — add `runType` to every `DaySchedule` entry and a
`weeklyRunKmTarget` per phase. Current schedule is Sun long, Mon/Tue/Thu/Fri
short runs alongside lifting, Wed/Sat short. Map: Sunday `'long'`, the rest
`'easy'`. Phases 3–5 may introduce one `'tempo'` day.

### Step 5 — Repository

`src/db/repo.ts` — the dead table gets wired:
`addRun`, `updateRun`, `deleteRun`, `runsBetween(from, to)`,
`recentRuns(limit)`. All call `markDirty()` like every other writer.

**Also**: logging a run must upsert `dailyLogs.runKm` for that date to the sum
of the day's runs, so the existing compliance metric keeps working. Runs are the
detail record; `runKm` stays the adherence roll-up.

### Step 6 — Read path

`src/hooks/useDashboard.ts` — expose `runs`, `easyPace`, `paceProgression`,
`weeklyRunVolume`, `volumeRamp`. Every screen reads from here; no screen
computes its own running maths.

### Step 7 — UI: run logging

Workout tab. A run card alongside the lifting session:

- type picker (5 chips), distance, duration, RPE 1–10, notes
- **live-computed pace** shown as you type — never a field the user fills in
- same commit semantics as everything else: debounce on change + commit on blur,
  empty commits `null`
- prefill type from the day's `DaySchedule.runType`

### Step 8 — UI: run progression card

- easy-pace trend with its `insufficient_data` state stated plainly
- weekly volume + the ramp warning when it fires
- long-run progression
- derived target paces per type, or an honest "needs 3 easy runs first"
- desktop: sits in the sticky right column next to the session summary

### Step 9 — Today integration

The Today checklist keeps scoring the run on distance. Add the logged pace and
type as secondary text on the run row. Do not change the tick/cross logic.

### Step 10 — Verify

```
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix frontend run lint
```

Then look at it in a browser at **375px and 1280px**. Screenshots, not
assumptions. Confirm specifically that a slow easy run renders as neutral,
not as a failure.

---

## 3. Things that will be tempting and are wrong

- **Showing a pace PR banner.** Encourages racing every easy run, which is how
  the base never gets built and the knees give out.
- **Scoring pace in compliance.** Breaks the adherence/performance separation
  and makes a good easy week look bad.
- **Comparing this run to the last run.** The entire app exists to not do this.
- **Hardcoded target paces.** They will be wrong for this athlete on day one.
- **Auto-adjusting the running plan.** Same rule as calories: propose, never
  apply.
- **Adding HR fields to the UI.** Explicitly out of scope; RPE only.
