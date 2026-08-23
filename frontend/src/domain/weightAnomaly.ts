import type { DailyLog, LocalDate } from './types'
import { addDays } from './date'

/**
 * Explains a sharp weigh-in jump with a plausible cause from the last few
 * days' logs, rather than leaving a scary number sitting there unexplained.
 *
 * Deliberately a rule, not an AI call: the causes worth naming (sodium,
 * alcohol, a day without logging) are a short, well-understood list, and a
 * rule answers instantly, offline, and the same way every time — a coach call
 * for this would add latency and a network dependency for something that
 * doesn't need judgement. It only ever offers what the logged data actually
 * shows; if nothing in the window explains the jump, it says so rather than
 * inventing a plausible-sounding excuse.
 */

export type AnomalyCause = 'sodium' | 'alcohol' | 'unlogged_gap' | 'small_window'

export interface WeightAnomaly {
  cause: AnomalyCause
  jumpKg: number
  headline: string
  detail: string
}

/** A jump smaller than this is ordinary day-to-day water-weight noise. */
export const JUMP_THRESHOLD_KG = 1.0
/** How far back to look for an explanation. */
const LOOKBACK_DAYS = 3
/** A sodium day this far above the prior average counts as a likely cause. */
const SODIUM_SPIKE_RATIO = 1.6
const ALCOHOL_UNITS_THRESHOLD = 3

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Checks today's weigh-in against the trailing average and, if it jumped
 * more than `JUMP_THRESHOLD_KG`, looks for a plausible cause in the last
 * `LOOKBACK_DAYS`. Returns null when there's nothing to say — no anomaly, or
 * genuinely not enough data to explain one either way.
 */
export function detectWeightAnomaly(
  today: LocalDate,
  index: Map<LocalDate, DailyLog>,
): WeightAnomaly | null {
  const todayLog = index.get(today)
  const todayWeight = todayLog?.weightKg
  if (todayWeight == null) return null

  const priorWeights: number[] = []
  for (let i = 1; i <= 7; i++) {
    const w = index.get(addDays(today, -i))?.weightKg
    if (w != null) priorWeights.push(w)
  }
  if (priorWeights.length < 2) return null // not enough history to call anything a jump

  const priorAvg = average(priorWeights)
  if (priorAvg == null) return null
  const jump = todayWeight - priorAvg
  if (Math.abs(jump) < JUMP_THRESHOLD_KG) return null

  // Look for a cause in the days leading up to today.
  const recentSodium: number[] = []
  const priorSodium: number[] = []
  let hasUnloggedGap = false
  let alcoholDay = false

  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const log = index.get(addDays(today, -i))
    if (log?.sodiumMg != null) recentSodium.push(log.sodiumMg)
    if ((log?.alcoholUnits ?? 0) >= ALCOHOL_UNITS_THRESHOLD) alcoholDay = true
    if (!log || log.calories == null) hasUnloggedGap = true
  }
  for (let i = LOOKBACK_DAYS + 1; i <= 7; i++) {
    const log = index.get(addDays(today, -i))
    if (log?.sodiumMg != null) priorSodium.push(log.sodiumMg)
  }

  const recentSodiumAvg = average(recentSodium)
  const priorSodiumAvg = average(priorSodium)
  const sodiumSpike =
    recentSodiumAvg != null &&
    priorSodiumAvg != null &&
    priorSodiumAvg > 0 &&
    recentSodiumAvg / priorSodiumAvg >= SODIUM_SPIKE_RATIO

  const jumpText = `${jump > 0 ? '+' : ''}${jump.toFixed(1)} kg`

  if (jump > 0 && alcoholDay) {
    return {
      cause: 'alcohol',
      jumpKg: jump,
      headline: `${jumpText} vs. your recent average — likely water weight`,
      detail: 'Alcohol was logged in the last few days, which reliably shows up as a temporary jump on the scale, not fat gained.',
    }
  }

  if (jump > 0 && sodiumSpike) {
    return {
      cause: 'sodium',
      jumpKg: jump,
      headline: `${jumpText} vs. your recent average — likely water weight`,
      detail: 'Sodium intake was well above your recent average in the last few days. That holds water and typically clears within a few days.',
    }
  }

  if (hasUnloggedGap) {
    return {
      cause: 'unlogged_gap',
      jumpKg: jump,
      headline: `${jumpText} vs. your recent average`,
      detail: 'A day in the last few was not fully logged, so this could be a real change or just missing context — keep logging and the trend will clarify it.',
    }
  }

  return {
    cause: 'small_window',
    jumpKg: jump,
    headline: `${jumpText} vs. your recent average`,
    detail: 'Nothing in the last few days’ logs explains it — could be a real change. One data point is not a trend; watch the next couple of weigh-ins.',
  }
}
