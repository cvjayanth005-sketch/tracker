import { dayOfWeek, windowEndingOn } from './date'
import type { LogIndex } from './trend'
import type { DailyLog, DaySchedule, LocalDate, Phase } from './types'

/**
 * Compliance, with the denominator stated out loud.
 *
 * Every metric splits its window into four disjoint buckets:
 *
 *   notScheduled — the metric did not apply that day (rest day, no run planned)
 *   unknown      — it applied but was never logged
 *   hit          — logged and met target
 *   missed       — logged and did not meet target
 *
 * `eligible = unknown + hit + missed`. Two separate percentages come out, and
 * conflating them is exactly the bug this design prevents:
 *
 *   hitRatePct  = hit / (hit + missed)   — of the days you measured, how many landed
 *   coveragePct = (hit + missed) / eligible — how much of the window you measured at all
 *
 * A 100% hit rate off two logged days out of seven is not a good week, and the
 * recommendation engine must not treat it as one. See `adherence()`.
 */

export type MetricKey =
  | 'calories'
  | 'protein'
  | 'steps'
  | 'sleep'
  | 'meals'
  | 'gym'
  | 'run'

/**
 * Tolerances, kept as named constants so a rule change is one auditable edit.
 * Calories use a band: overshooting breaks the deficit, but badly undershooting
 * is its own failure and must not be scored as compliance.
 */
export const TOLERANCE = {
  caloriesUpper: 1.05,
  caloriesLower: 0.85,
  protein: 0.95,
  steps: 0.9,
  sleepHoursGrace: 0.5,
  runDistance: 0.9,
} as const

export interface MetricCompliance {
  metric: MetricKey
  eligibleDays: number
  knownDays: number
  hitDays: number
  missedDays: number
  unknownDays: number
  notScheduledDays: number
  /** hit / known. Null when nothing in the window was logged. */
  hitRatePct: number | null
  /** known / eligible. 100 when nothing was eligible. */
  coveragePct: number
}

export interface ComplianceReport {
  from: LocalDate
  to: LocalDate
  metrics: Record<MetricKey, MetricCompliance>
  /** Unweighted mean of the metrics that have a hit rate. Null if none do. */
  overallHitRatePct: number | null
  /** Unweighted mean of coverage across metrics with eligible days. */
  overallCoveragePct: number
}

type Outcome = 'hit' | 'missed' | 'unknown' | 'notScheduled'

function scheduleFor(phase: Phase, date: LocalDate): DaySchedule | undefined {
  const dow = dayOfWeek(date)
  return phase.schedule.find((s) => s.dow === dow)
}

/** Classify one metric on one day. The only place target logic lives. */
export function outcomeFor(
  metric: MetricKey,
  log: DailyLog | undefined,
  phase: Phase,
  date: LocalDate,
): Outcome {
  const schedule = scheduleFor(phase, date)

  switch (metric) {
    case 'calories': {
      const v = log?.calories ?? null
      if (v === null) return 'unknown'
      const upper = phase.calories * TOLERANCE.caloriesUpper
      const lower = phase.calories * TOLERANCE.caloriesLower
      return v <= upper && v >= lower ? 'hit' : 'missed'
    }
    case 'protein': {
      const v = log?.proteinG ?? null
      if (v === null) return 'unknown'
      return v >= phase.proteinG * TOLERANCE.protein ? 'hit' : 'missed'
    }
    case 'steps': {
      const v = log?.steps ?? null
      if (v === null) return 'unknown'
      return v >= phase.steps * TOLERANCE.steps ? 'hit' : 'missed'
    }
    case 'sleep': {
      const v = log?.sleepHours ?? null
      if (v === null) return 'unknown'
      return v >= phase.sleepHours - TOLERANCE.sleepHoursGrace ? 'hit' : 'missed'
    }
    case 'meals': {
      const v = log?.mealsOnPlan ?? null
      if (v === null) return 'unknown'
      return v >= phase.mealsPerDay ? 'hit' : 'missed'
    }
    case 'gym': {
      // A missed gym day only counts against you if the day was scheduled.
      if (!schedule?.gym) return 'notScheduled'
      const v = log?.gymDone ?? null
      if (v === null) return 'unknown'
      return v ? 'hit' : 'missed'
    }
    case 'run': {
      const planned = schedule?.runKm ?? null
      if (planned === null || planned <= 0) return 'notScheduled'
      const v = log?.runKm ?? null
      if (v === null) return 'unknown'
      return v >= planned * TOLERANCE.runDistance ? 'hit' : 'missed'
    }
  }
}

const ALL_METRICS: MetricKey[] = [
  'calories',
  'protein',
  'steps',
  'sleep',
  'meals',
  'gym',
  'run',
]

export function complianceFor(
  index: LogIndex,
  endDate: LocalDate,
  phase: Phase,
  windowDays = 7,
): ComplianceReport {
  const dates = windowEndingOn(endDate, windowDays)
  const metrics = {} as Record<MetricKey, MetricCompliance>

  for (const metric of ALL_METRICS) {
    let hit = 0
    let missed = 0
    let unknown = 0
    let notScheduled = 0

    for (const date of dates) {
      switch (outcomeFor(metric, index.get(date), phase, date)) {
        case 'hit':
          hit++
          break
        case 'missed':
          missed++
          break
        case 'unknown':
          unknown++
          break
        case 'notScheduled':
          notScheduled++
          break
      }
    }

    const known = hit + missed
    const eligible = known + unknown
    metrics[metric] = {
      metric,
      eligibleDays: eligible,
      knownDays: known,
      hitDays: hit,
      missedDays: missed,
      unknownDays: unknown,
      notScheduledDays: notScheduled,
      hitRatePct: known === 0 ? null : (hit / known) * 100,
      coveragePct: eligible === 0 ? 100 : (known / eligible) * 100,
    }
  }

  const rated = ALL_METRICS.map((m) => metrics[m]).filter(
    (m) => m.hitRatePct !== null,
  )
  const withEligible = ALL_METRICS.map((m) => metrics[m]).filter(
    (m) => m.eligibleDays > 0,
  )

  return {
    from: dates[0] as LocalDate,
    to: endDate,
    metrics,
    overallHitRatePct:
      rated.length === 0
        ? null
        : rated.reduce((s, m) => s + (m.hitRatePct as number), 0) / rated.length,
    overallCoveragePct:
      withEligible.length === 0
        ? 100
        : withEligible.reduce((s, m) => s + m.coveragePct, 0) / withEligible.length,
  }
}

export type AdherenceVerdict = 'good' | 'poor' | 'unknown'

/**
 * The gate the recommendation engine consults before touching calories.
 *
 * Returns `unknown` — not `poor`, and never `good` — when the window is too
 * sparsely logged to judge. Guessing here is how you end up cutting calories
 * on someone who was actually just not logging.
 */
export function adherence(
  report: ComplianceReport,
  goodCompliancePct: number,
  minCoveragePct = 60,
): AdherenceVerdict {
  if (report.overallHitRatePct === null) return 'unknown'
  if (report.overallCoveragePct < minCoveragePct) return 'unknown'
  return report.overallHitRatePct >= goodCompliancePct ? 'good' : 'poor'
}

/** Metrics dragging the week down, worst first. Used for the "next focus" cue. */
export function weakestMetrics(
  report: ComplianceReport,
  limit = 2,
): MetricCompliance[] {
  return ALL_METRICS.map((m) => report.metrics[m])
    .filter((m) => m.hitRatePct !== null && m.knownDays > 0)
    .sort((a, b) => (a.hitRatePct as number) - (b.hitRatePct as number))
    .slice(0, limit)
}
