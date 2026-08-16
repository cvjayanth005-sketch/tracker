import { TOLERANCE, outcomeFor, type MetricKey } from '@/domain/compliance'
import type { DailyLog, LocalDate, Phase } from '@/domain/types'

/*
 * Derived from the function rather than imported: `Outcome` is not exported
 * from the domain, and inferring it here keeps this in step automatically
 * without editing a shared file other workstreams are also touching.
 */
type Outcome = ReturnType<typeof outcomeFor>

/**
 * Target presentation for the Today screen.
 *
 * The ranges shown here are not invented: they are the bands `outcomeFor`
 * already uses to decide hit from missed, read from the same `TOLERANCE`
 * constant. Someone eating 1,750 against a 2,000 target is currently marked as
 * on-plan while the screen shows them under it — surfacing the band closes that
 * gap, and because both read one constant the numbers cannot disagree.
 *
 * Only calories has a genuine two-sided band. Protein, steps and sleep are
 * floors, and are described as such rather than given an invented ceiling.
 */

export type TargetBand =
  /** Both ends meaningful, e.g. 1,700-2,100 kcal. */
  | { kind: 'range'; min: number; max: number }
  /** Anything at or above the value counts, e.g. 171g+. */
  | { kind: 'floor'; min: number }
  /** The domain gives one number and no tolerance. */
  | { kind: 'exact'; value: number }

export interface TodayTarget {
  metric: MetricKey
  label: string
  /** Logged value, or null when nothing has been recorded. */
  actual: number | null
  band: TargetBand
  outcome: Outcome
  unit: string
  /** Fraction of the way to the target, or null when unknown. Capped at 1. */
  progress: number | null
  /** One short, practical next step. Null when there is nothing to suggest. */
  hint: string | null
}

/** Metrics that appear as targets, in the order they are shown. */
const TARGET_METRICS: MetricKey[] = ['calories', 'protein', 'steps', 'sleep']

const LABEL: Record<MetricKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  steps: 'Steps',
  sleep: 'Sleep',
  meals: 'Meals on plan',
  gym: 'Gym',
  run: 'Run',
}

const UNIT: Record<MetricKey, string> = {
  calories: 'kcal',
  protein: 'g',
  steps: '',
  sleep: 'h',
  meals: '',
  gym: '',
  run: 'km',
}

/** Average stride covers roughly this many steps per minute at a walking pace. */
const STEPS_PER_WALKING_MINUTE = 110

function bandFor(metric: MetricKey, phase: Phase): TargetBand {
  switch (metric) {
    case 'calories':
      return {
        kind: 'range',
        min: Math.round(phase.calories * TOLERANCE.caloriesLower),
        max: Math.round(phase.calories * TOLERANCE.caloriesUpper),
      }
    case 'protein':
      return { kind: 'floor', min: Math.round(phase.proteinG * TOLERANCE.protein) }
    case 'steps':
      return { kind: 'floor', min: Math.round(phase.steps * TOLERANCE.steps) }
    case 'sleep':
      return { kind: 'floor', min: round1(phase.sleepHours - TOLERANCE.sleepHoursGrace) }
    // No tolerance is defined for these, so no band is implied.
    case 'meals':
      return { kind: 'exact', value: phase.mealsPerDay }
    default:
      return { kind: 'exact', value: 0 }
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function loggedValue(metric: MetricKey, log: DailyLog | undefined): number | null {
  switch (metric) {
    case 'calories':
      return log?.calories ?? null
    case 'protein':
      return log?.proteinG ?? null
    case 'steps':
      return log?.steps ?? null
    case 'sleep':
      return log?.sleepHours ?? null
    case 'meals':
      return log?.mealsOnPlan ?? null
    default:
      return null
  }
}

/** Lower edge of whatever the band is, for progress and remaining-to-go maths. */
export function bandFloor(band: TargetBand): number {
  return band.kind === 'exact' ? band.value : band.min
}

function hintFor(metric: MetricKey, actual: number | null, band: TargetBand, outcome: Outcome): string | null {
  if (outcome === 'hit') return null
  const floor = bandFloor(band)

  if (metric === 'steps') {
    // The one target where a concrete, immediately actionable suggestion is
    // possible: distance-to-go converts directly into minutes of walking.
    if (actual === null) return `${floor.toLocaleString()} steps to reach today's target.`
    const remaining = floor - actual
    if (remaining <= 0) return null
    const minutes = Math.max(1, Math.round(remaining / STEPS_PER_WALKING_MINUTE))
    return `${remaining.toLocaleString()} to go — about a ${minutes}-minute walk.`
  }

  if (actual === null) return null

  if (metric === 'calories' && band.kind === 'range') {
    if (actual > band.max) return `${Math.round(actual - band.max).toLocaleString()} kcal over the range.`
    const remaining = Math.round(band.min - actual)
    if (remaining > 0) return `${remaining.toLocaleString()} kcal left before the range.`
    return null
  }

  const remaining = floor - actual
  if (remaining <= 0) return null
  if (metric === 'protein') return `${Math.round(remaining)}g of protein still to go.`
  if (metric === 'sleep') return `${round1(remaining)}h short of the target.`
  return null
}

export function buildTodayTargets(
  phase: Phase,
  log: DailyLog | undefined,
  date: LocalDate,
): TodayTarget[] {
  return TARGET_METRICS.map((metric) => {
    const band = bandFor(metric, phase)
    const actual = loggedValue(metric, log)
    const outcome = outcomeFor(metric, log, phase, date)
    const floor = bandFloor(band)
    return {
      metric,
      label: LABEL[metric],
      actual,
      band,
      outcome,
      unit: UNIT[metric],
      // Null, never zero: an unlogged metric and a genuine zero are different.
      progress: actual === null || floor <= 0 ? null : Math.min(1, actual / floor),
      hint: hintFor(metric, actual, band, outcome),
    }
  })
}

/**
 * Human-readable band, e.g. "1,700-2,100" or "171+".
 *
 * Returns an em dash for a missing target rather than "0", which would read as
 * a real instruction to eat nothing.
 */
export function formatBand(band: TargetBand): string {
  if (band.kind === 'range') {
    if (!Number.isFinite(band.min) || !Number.isFinite(band.max)) return '—'
    return `${band.min.toLocaleString()}–${band.max.toLocaleString()}`
  }
  if (band.kind === 'floor') {
    return Number.isFinite(band.min) ? `${band.min.toLocaleString()}+` : '—'
  }
  return Number.isFinite(band.value) ? band.value.toLocaleString() : '—'
}

/** Logged value for display. Em dash when unknown — never 0, never NaN. */
export function formatActual(value: number | null, metric: MetricKey): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (metric === 'sleep') return round1(value).toLocaleString()
  return Math.round(value).toLocaleString()
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export type InsightVerdict = 'good' | 'steady' | 'needs_attention' | 'insufficient'

export interface Insight {
  verdict: InsightVerdict
  /** Plain language, no jargon and no bare averages. */
  summary: string
}

export const INSIGHT_LABEL: Record<InsightVerdict, string> = {
  good: 'Good',
  steady: 'Steady',
  needs_attention: 'Needs attention',
  insufficient: 'Insufficient data',
}

/**
 * Turns adherence into a sentence instead of a percentage.
 *
 * A bare "68%" tells someone nothing about whether to change anything, and the
 * raw averages it came from are already visible in the logger. The thresholds
 * mirror `Settings.goodCompliancePct` so this cannot contradict the rest of the
 * app's idea of good adherence.
 */
export function buildInsight(
  hitRatePct: number | null,
  coveragePct: number | null,
  goodCompliancePct: number,
): Insight {
  // Without enough logged days a rate is arithmetic, not evidence.
  if (hitRatePct === null || coveragePct === null || coveragePct < 50) {
    return {
      verdict: 'insufficient',
      summary: 'Not enough logged days yet to read a trend. Keep logging and this fills in.',
    }
  }
  if (hitRatePct >= goodCompliancePct) {
    return {
      verdict: 'good',
      summary: 'You are hitting most of your targets. Nothing needs changing this week.',
    }
  }
  if (hitRatePct >= goodCompliancePct * 0.7) {
    return {
      verdict: 'steady',
      summary: 'Most days land close to plan, with a few gaps. Worth tightening one target.',
    }
  }
  return {
    verdict: 'needs_attention',
    summary: 'Targets are being missed more often than met. Pick one to focus on today.',
  }
}
