import { addDays } from './date'
import type { ComplianceReport } from './compliance'
import type { LocalDate } from './types'

/**
 * The context handed to the coach for a weekly summary, and the guard that
 * decides whether asking is even worth it.
 *
 * A week with almost nothing logged would get a summary that is mostly
 * padding around "not much data" — worse than just saying that outright, and
 * a wasted AI call. `MIN_LOGGED_DAYS` is deliberately low (2) rather than
 * requiring a full week: someone three days into using the app still
 * benefits from a first summary, it just won't have much to say yet.
 */

export const MIN_LOGGED_DAYS_FOR_NARRATIVE = 2

export interface WeeklyNarrativeContext {
  weekStart: LocalDate
  weekEnd: LocalDate
  loggedDays: number
  calorieHitRatePct: number | null
  proteinHitRatePct: number | null
  stepsHitRatePct: number | null
  gymHitRatePct: number | null
  sleepHitRatePct: number | null
  trendWeightChangeKg: number | null
}

export function buildWeeklyNarrativeContext(
  today: LocalDate,
  compliance: ComplianceReport,
  loggedDays: number,
  trendWeightChangeKg: number | null,
): WeeklyNarrativeContext {
  return {
    weekStart: addDays(today, -6),
    weekEnd: today,
    loggedDays,
    calorieHitRatePct: compliance.metrics.calories.hitRatePct,
    proteinHitRatePct: compliance.metrics.protein.hitRatePct,
    stepsHitRatePct: compliance.metrics.steps.hitRatePct,
    gymHitRatePct: compliance.metrics.gym.hitRatePct,
    sleepHitRatePct: compliance.metrics.sleep.hitRatePct,
    trendWeightChangeKg,
  }
}

/** The fixed prompt sent to the coach for this feature. */
export function weeklyNarrativePrompt(): string {
  return (
    'Summarize this week in one short paragraph (3-4 sentences), in a plain, ' +
    'encouraging but honest voice. Lead with the single most important thing ' +
    '— the weakest signal or the best win, whichever is more useful to know. ' +
    'Use only the numbers given in context; do not estimate or invent ' +
    'anything not present there. No headers, no bullet points, one paragraph.'
  )
}

export function hasEnoughDataForNarrative(loggedDays: number): boolean {
  return loggedDays >= MIN_LOGGED_DAYS_FOR_NARRATIVE
}
