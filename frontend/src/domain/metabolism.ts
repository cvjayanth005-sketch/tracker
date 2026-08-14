import { addDays, compareDates } from '@/domain/date'
import type { DailyLog, LocalDate } from '@/domain/types'

/**
 * Adaptive TDEE (Total Daily Energy Expenditure) from the two things the app
 * already logs: calorie intake and the weight trend.
 *
 *   TDEE ≈ average intake − (weight slope in kg/day × 7700 kcal/kg)
 *
 * This is the honest, measured maintenance number — but only when there is
 * enough clean data. It reads weight solely to derive the slope; it never
 * writes weight and never changes targets. Everything here is pure and tested.
 */

/** Energy density of body-mass change. An approximation — see module notes. */
const KCAL_PER_KG = 7700

export type TdeeConfidence = 'low' | 'medium' | 'high'

export interface TdeeEstimate {
  tdeeKcal: number
  /** Plausible band around the estimate, widening as data thins. */
  lowKcal: number
  highKcal: number
  confidence: TdeeConfidence
  windowDays: number
  /** Days in the window with a calorie entry / with a weigh-in. */
  calorieDays: number
  weightDays: number
  avgIntakeKcal: number
  /** Trend weight change over the window, kg per week (negative = losing). */
  weightChangePerWeekKg: number
}

export type TdeeResult =
  | { status: 'ok'; estimate: TdeeEstimate }
  | { status: 'insufficient'; calorieDays: number; weightDays: number; needDays: number }

/** Least-squares slope of y over x, or null when fewer than two points. */
function slope(points: Array<{ x: number; y: number }>): number | null {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  return den === 0 ? null : num / den
}

const MIN_DAYS = 6
const MIN_SPAN = 10

/**
 * Estimate maintenance calories over a trailing window ending on `today`.
 * Returns `insufficient` until there are enough weigh-ins and calorie days —
 * a deliberately conservative gate, because a thin window produces a confident
 * but wrong number.
 */
export function estimateTdee(today: LocalDate, logs: DailyLog[], windowDays = 14): TdeeResult {
  const start = addDays(today, -(windowDays - 1))
  const inWindow = logs.filter(
    (log) => compareDates(log.date, start) >= 0 && compareDates(log.date, today) <= 0,
  )

  const calorieVals = inWindow.flatMap((log) => (log.calories === null ? [] : [log.calories]))
  const weightPoints = inWindow.flatMap((log) =>
    log.weightKg === null ? [] : [{ x: dayIndex(start, log.date), y: log.weightKg }],
  )
  const calorieDays = calorieVals.length
  const weightDays = weightPoints.length

  const span = weightPoints.length > 0 ? weightPoints[weightPoints.length - 1]!.x - weightPoints[0]!.x : 0
  if (calorieDays < MIN_DAYS || weightDays < MIN_DAYS || span < MIN_SPAN) {
    return { status: 'insufficient', calorieDays, weightDays, needDays: MIN_DAYS }
  }

  const kgPerDay = slope(weightPoints)
  if (kgPerDay === null) return { status: 'insufficient', calorieDays, weightDays, needDays: MIN_DAYS }

  const avgIntake = Math.round(calorieVals.reduce((s, v) => s + v, 0) / calorieDays)
  const tdee = Math.round(avgIntake - kgPerDay * KCAL_PER_KG)

  // Confidence grows with coverage; an implausibly fast slope (mostly water) or
  // a nonsensical result is capped down rather than shown as trustworthy.
  const coverage = Math.min(calorieDays, weightDays)
  const fastSwing = Math.abs(kgPerDay) > 0.15 // >~1 kg/week is likely water, not fat
  let confidence: TdeeConfidence =
    coverage >= 12 && !fastSwing ? 'high' : coverage >= 9 && !fastSwing ? 'medium' : 'low'
  if (tdee < 800 || tdee > 6000) confidence = 'low'

  // Band widens as confidence falls, so nobody reads false precision.
  const bandPct = confidence === 'high' ? 0.06 : confidence === 'medium' ? 0.1 : 0.16
  const band = Math.round(tdee * bandPct)

  return {
    status: 'ok',
    estimate: {
      tdeeKcal: tdee,
      lowKcal: tdee - band,
      highKcal: tdee + band,
      confidence,
      windowDays,
      calorieDays,
      weightDays,
      avgIntakeKcal: avgIntake,
      weightChangePerWeekKg: Math.round(kgPerDay * 7 * 100) / 100,
    },
  }
}

/** Whole-day offset of `date` from `start` (0-based). */
function dayIndex(start: LocalDate, date: LocalDate): number {
  return Math.round((Date.parse(date) - Date.parse(start)) / 86_400_000)
}

/**
 * What a calorie target implies against measured maintenance: the daily gap and
 * the weekly weight change it should produce. Lets the Food page say "2000
 * against your ~2450 maintenance is about 0.4 kg/week of loss" without changing
 * anything.
 */
export function targetVsMaintenance(
  targetKcal: number,
  tdeeKcal: number,
): { dailyDeltaKcal: number; weeklyChangeKg: number } {
  const dailyDeltaKcal = targetKcal - tdeeKcal
  return {
    dailyDeltaKcal,
    weeklyChangeKg: Math.round(((dailyDeltaKcal * 7) / KCAL_PER_KG) * 100) / 100,
  }
}
