# Fat Loss Ledger

Local-first PWA for phone and laptop. React 19 + Vite + TypeScript + Tailwind v4,
IndexedDB (Dexie) as the working source of truth, and a pure-TypeScript rules
engine that makes every decision the app shows you.

```bash
cd frontend && npm run dev
```

```bash
cd frontend && npm test
```

```bash
cd frontend && npm run build
```

The repo is split `frontend/` (this app) and `backend/` (FastAPI + SQLite).

## The one idea

**Rules decide, AI narrates.** Everything on screen — trend weight, compliance,
whether to change calories, whether a phase is done — comes from pure functions in
`src/domain/`. The AI endpoint is optional commentary; with it unreachable the app
loses nothing but a paragraph of prose.

Nothing changes your plan on its own. The engine only ever *proposes*; applying a
calorie change is a tap on the Plan screen.

## Layout

```
frontend/src/
  domain/         pure TS, no IO — the whole decision engine, fully unit-tested
  types.ts        nullability contract: null = unknown, 0 = a real logged zero
  date.ts         local calendar dates; never UTC arithmetic
  trend.ts        trailing averages, non-overlapping week comparison, plateaus
  compliance.ts   four disjoint buckets + separate hit-rate and coverage
  rules.ts        the guard chain and phase review
  progression.ts  double progression
  seed.ts         default phases/settings/exercises (editable, not constants)
  db/             Dexie schema + repository (upsert-by-date, phase resolution)
  sync/           whole-document blob sync interface + backup/restore
  ai/             coach note cache, keyed on state + prompt + rules version
  hooks/          useDashboard — the single read path every screen derives from
  lib/            vendored liquid-glass.js (refraction optics, third-party)
  components/     glass primitives, rings, chart, fields
  screens/        Today, Workout, Progress, Plan
```

## Design system

Dark only, glassmorphism with real refraction.

- **Aurora** (`.aurora`) — metabolic night sky: ink void, training-horizon glow,
  vitality / recovery / ember blooms, ribbon, faint orbital rings, dust and grain.
  CSS-transform motion only; pauses when the tab is hidden and stops under
  `prefers-reduced-motion`. It lives at `z-index:-1`, which is why `body` must
  stay `background: transparent` — an opaque body background paints over
  negative-z children and the aurora vanishes.
- **Glass** (`.glass`, `.glass-strong`) — tint, specular top highlight and 1px
  edge, per the liquid-glass recipe. **One backdrop-blur per stacking context**:
  panels blur, their children use `.glass-inset` (a flat translucent fill).
  Nested `backdrop-filter` is both a mobile perf cost and visually muddy.
- **Refraction** (`useLiquidGlass`) — real edge bending, opt-in per element.
  Each call builds a canvas displacement map plus a GPU filter, so it is
  reserved for a few long-lived panels (tab bar, chart card). Chromium only;
  Safari and Firefox get the frosted fallback, so it never carries meaning.
- **Layout** — sidebar rail from `lg`, floating glass tab bar below it. Today,
  Progress, Workout and Plan each go multi-column on a laptop.
- **Rings** — weekly compliance as three arcs (hit / missed / unlogged), colours
  validated for colour-vision separation and always directly labelled.

## Invariants worth not breaking

1. **`null` is unknown, `0` is zero.** Every average skips nulls. A day you did
   not log is never counted as a zero-calorie day.
2. **Nothing reads a raw daily weight to make a decision.** Only the 7-day
   trailing average, and only when it has ≥ `minReadingsPerWindow` readings —
   otherwise it reports `insufficient_data` and callers must handle that.
3. **Week-over-week uses non-overlapping windows** (days 1–7 vs 8–14).
4. **Compliance is two numbers, not one.** Hit rate is over logged days;
   coverage is how much of the week was logged. A 100% hit rate on 2 of 7 days
   is `adherence: 'unknown'`, never `'good'`.
5. **The guard chain order is load-bearing:** data → coverage → adherence →
   recovery → loss-rate. Adherence is checked before arithmetic so a plan that
   was never followed is not "fixed" by cutting calories.
6. **The loss-rate branch partitions the whole real line**, including the
   0.3–0.5 kg/week gap, with an explicit final case.
7. **Phases never advance automatically.** Trend weight must hold at or below
   target for `phaseHoldDays` consecutive days, and even then it only offers a
   review.
8. **Bump `RULES_VERSION`** on any behavioural change — it is part of the AI
   note cache key, so stale notes cannot outlive a rule edit.

## Local services

Start the backend in a second terminal:

```bash
cd backend && uvicorn app.main:app --reload
```

Development connects to `http://127.0.0.1:8000` automatically. Production stays
local-only unless `VITE_API_BASE` is configured at build time. The client syncs
the complete IndexedDB document with optimistic conflict detection; JSON backup
downloads have their own independent watermark and never claim a server sync.

Plan → Import history reads the original `.xlsx` tracker directly in the
browser. Only dated rows are merged, numeric facts stay numeric, and blank
checkboxes remain unknown.

The TypeScript engine is the only authority for decisions shown in the app.
FastAPI stores/syncs data, asks Groq to narrate the already-decided summary, and
optionally turns the note into speech through Fish Audio. Both services fall
back cleanly when their keys are absent.
