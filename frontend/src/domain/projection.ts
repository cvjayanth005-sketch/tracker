import { addDays, daysBetween } from '@/domain/date'
import type { LocalDate } from '@/domain/types'
import type { TrendPoint } from '@/domain/trend'

/**
 * Where the current trend arrives, and when.
 *
 * The chart already shows where someone has been. The question they actually
 * open it to answer is when they get there — so this extrapolates the trend
 * line forward to the goal and dates the arrival.
 *
 * A projection is a claim about the future, so it is deliberately conservative:
 * it refuses to answer at all rather than guessing from thin data, it will not
 * project further than the trend can support, and it reports the confidence
 * band it is working within instead of a single reassuring number.
 */

export type ProjectionStatus =
  | 'ok'
  | 'insufficient_data'
  /** Moving away from the goal, so an arrival date would be nonsense. */
  | 'wrong_direction'
  /** Flat enough that a date would be arbitrary. */
  | 'stalled'
  | 'already_reached'

export interface Projection {
  status: ProjectionStatus
  /** Date the trend reaches the goal. Null unless status is 'ok'. */
  arrivalDate: LocalDate | null
  /** Days from today to arrival. Null unless status is 'ok'. */
  daysRemaining: number | null
  /** kg/week the projection is built on. Negative = losing. */
  ratePerWeek: number | null
  /**
   * How far the honest range spans, in days either side of `arrivalDate`.
   * A trend that wobbles produces a wider band, and the UI should show it.
   */
  uncertaintyDays: number | null
  /** Plain-language reason, always populated. */
  detail: string
}

/** Below this weekly change, a date is arbitrary rather than predicted. */
const STALL_THRESHOLD_KG_WEEK = 0.05
/** Trend points required before extrapolating at all. */
const MIN_POINTS = 10
/** Never project beyond this; further out is fantasy, not forecast. */
const MAX_HORIZON_DAYS = 365

function fail(status: ProjectionStatus, detail: string): Projection {
  return {
    status,
    arrivalDate: null,
    daysRemaining: null,
    ratePerWeek: null,
    uncertaintyDays: null,
    detail,
  }
}

/** Least-squares slope in kg/day over the trend points. */
function slope(points: Array<{ x: number; y: number }>): number {
  const n = points.length
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

/** Root-mean-square residual around the fitted line, in kg. */
function residualSpread(points: Array<{ x: number; y: number }>, m: number, b: number): number {
  const sq = points.reduce((s, p) => s + (p.y - (m * p.x + b)) ** 2, 0)
  return Math.sqrt(sq / points.length)
}

export function projectArrival(
  series: TrendPoint[],
  today: LocalDate,
  goalWeightKg: number | null,
): Projection {
  if (goalWeightKg === null) {
    return fail('insufficient_data', 'Set a goal weight to see a projected date.')
  }

  // Only the smoothed trend is extrapolated. Raw readings carry water-weight
  // noise that would swing the slope by days on a single salty dinner.
  const points = series
    .filter((p): p is TrendPoint & { trendKg: number } => p.trendKg !== null)
    .map((p) => ({ x: daysBetween(series[0]!.date, p.date), y: p.trendKg, date: p.date }))

  if (points.length < MIN_POINTS) {
    return fail(
      'insufficient_data',
      `${MIN_POINTS - points.length} more days of weigh-ins before a date means anything.`,
    )
  }

  const current = points[points.length - 1]!.y
  const distance = current - goalWeightKg

  if (Math.abs(distance) < 0.1) {
    return fail('already_reached', 'You are at your goal weight.')
  }

  const kgPerDay = slope(points)
  const ratePerWeek = kgPerDay * 7

  if (Math.abs(ratePerWeek) < STALL_THRESHOLD_KG_WEEK) {
    return {
      ...fail('stalled', 'The trend is flat, so there is no date to project yet.'),
      ratePerWeek,
    }
  }

  // Losing when the goal is below, gaining when above. Any other combination is
  // movement away from the target, and dating that would be actively misleading.
  const movingToward = distance > 0 ? kgPerDay < 0 : kgPerDay > 0
  if (!movingToward) {
    return {
      ...fail('wrong_direction', 'The trend is moving away from your goal right now.'),
      ratePerWeek,
    }
  }

  const daysRemaining = Math.round(distance / -kgPerDay)
  if (daysRemaining > MAX_HORIZON_DAYS) {
    return {
      ...fail('insufficient_data', 'At this rate the goal is more than a year out.'),
      ratePerWeek,
    }
  }

  /*
   * Uncertainty from how tightly the trend actually fits its own line. A steady
   * decline projects a narrow window; a wobbling one projects a wide one, and
   * showing a single date for both would imply a precision that is not there.
   */
  const intercept = points[0]!.y
  const spread = residualSpread(points, kgPerDay, intercept)
  const uncertaintyDays = Math.min(
    MAX_HORIZON_DAYS,
    Math.round(Math.abs(spread / kgPerDay)) || 0,
  )

  return {
    status: 'ok',
    arrivalDate: addDays(today, daysRemaining),
    daysRemaining,
    ratePerWeek,
    uncertaintyDays,
    detail: `About ${daysRemaining} days at ${Math.abs(ratePerWeek).toFixed(2)} kg/week.`,
  }
}
