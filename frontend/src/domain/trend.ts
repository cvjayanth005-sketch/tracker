import { addDays, compareDates, windowEndingOn } from './date'
import type { DailyLog, LocalDate } from './types'

/**
 * Weight trend maths.
 *
 * Three rules this module exists to enforce, because every one of them is a
 * source of silently-wrong recommendations:
 *
 *  1. Daily scale weight is noise (±1.5 kg on water alone). Nothing outside
 *     this file may read a raw daily weight to make a decision.
 *  2. A window with too few readings is NOT a small-sample average, it is
 *     `insufficient_data`. Callers must handle that state explicitly.
 *  3. Week-over-week comparisons use NON-OVERLAPPING windows (days 1-7 vs
 *     8-14). Overlapping windows share readings and damp real change.
 */

export type TrendStatus = 'ok' | 'insufficient_data'

export interface TrendWeight {
  status: TrendStatus
  /** Last day of the window (inclusive). */
  endDate: LocalDate
  /** Mean of non-null readings in the window; null when insufficient. */
  averageKg: number | null
  readings: number
  required: number
}

export interface WeeklyChange {
  status: TrendStatus
  current: TrendWeight
  previous: TrendWeight
  /** Positive = losing. kg/week. Null when either window is insufficient. */
  lossKgPerWeek: number | null
}

export const WINDOW_DAYS = 7

/** Index logs by date once; callers loop over many windows. */
export function indexLogs(logs: DailyLog[]): Map<LocalDate, DailyLog> {
  return new Map(logs.map((l) => [l.date, l]))
}

export type LogIndex = Map<LocalDate, DailyLog>

/**
 * Mean weight over the `WINDOW_DAYS` window ending on `endDate`.
 * Missing days and null weights are skipped, never treated as zero.
 */
export function trailingAverageWeight(
  index: LogIndex,
  endDate: LocalDate,
  minReadings: number,
  windowDays: number = WINDOW_DAYS,
): TrendWeight {
  let sum = 0
  let readings = 0
  for (const date of windowEndingOn(endDate, windowDays)) {
    const weight = index.get(date)?.weightKg
    if (weight === null || weight === undefined) continue
    sum += weight
    readings += 1
  }
  if (readings < minReadings) {
    return {
      status: 'insufficient_data',
      endDate,
      averageKg: null,
      readings,
      required: minReadings,
    }
  }
  return {
    status: 'ok',
    endDate,
    averageKg: sum / readings,
    readings,
    required: minReadings,
  }
}

/**
 * Change between the window ending on `endDate` (days 1-7) and the window
 * immediately before it (days 8-14). The two windows never overlap.
 */
export function weeklyChange(
  index: LogIndex,
  endDate: LocalDate,
  minReadings: number,
): WeeklyChange {
  const current = trailingAverageWeight(index, endDate, minReadings)
  const previous = trailingAverageWeight(
    index,
    addDays(endDate, -WINDOW_DAYS),
    minReadings,
  )
  if (
    current.status !== 'ok' ||
    previous.status !== 'ok' ||
    current.averageKg === null ||
    previous.averageKg === null
  ) {
    return { status: 'insufficient_data', current, previous, lossKgPerWeek: null }
  }
  return {
    status: 'ok',
    current,
    previous,
    // Positive means the average came down.
    lossKgPerWeek: previous.averageKg - current.averageKg,
  }
}

/**
 * Consecutive weeks (walking backwards in non-overlapping 7-day steps) whose
 * loss rate sat below `plateauThreshold`.
 *
 * Counting stops at the first week that either cleared the threshold or lacked
 * data — an unmeasured week is not evidence of a plateau.
 */
export function consecutivePlateauWeeks(
  index: LogIndex,
  endDate: LocalDate,
  minReadings: number,
  plateauThreshold: number,
  maxLookbackWeeks = 8,
): number {
  let weeks = 0
  for (let i = 0; i < maxLookbackWeeks; i++) {
    const change = weeklyChange(index, addDays(endDate, -i * WINDOW_DAYS), minReadings)
    if (change.status !== 'ok' || change.lossKgPerWeek === null) break
    if (change.lossKgPerWeek >= plateauThreshold) break
    weeks += 1
  }
  return weeks
}

/**
 * Consecutive days, counting back from `endDate`, on which trend weight stayed
 * at or below `thresholdKg`. Used for phase-review hysteresis: a single dry
 * morning under target must not advance the phase.
 *
 * A day whose window is insufficient breaks the streak — we cannot claim the
 * threshold held on a day we cannot measure.
 */
export function daysHeldBelow(
  index: LogIndex,
  endDate: LocalDate,
  thresholdKg: number,
  minReadings: number,
  maxLookbackDays = 30,
): number {
  let days = 0
  for (let i = 0; i < maxLookbackDays; i++) {
    const trend = trailingAverageWeight(index, addDays(endDate, -i), minReadings)
    if (trend.status !== 'ok' || trend.averageKg === null) break
    if (trend.averageKg > thresholdKg) break
    days += 1
  }
  return days
}

export interface TrendPoint {
  date: LocalDate
  /** Raw scale reading, if any. */
  rawKg: number | null
  /** Trailing average on that date, null while insufficient. */
  trendKg: number | null
}

/**
 * Per-day series for charting: raw dots plus the trend line. Covers every day
 * in the range, including days with no log, so gaps render as gaps.
 */
export function trendSeries(
  index: LogIndex,
  from: LocalDate,
  to: LocalDate,
  minReadings: number,
): TrendPoint[] {
  const out: TrendPoint[] = []
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
    const trend = trailingAverageWeight(index, d, minReadings)
    out.push({
      date: d,
      rawKg: index.get(d)?.weightKg ?? null,
      trendKg: trend.averageKg,
    })
  }
  return out
}

/** Mean of the non-null values of one numeric metric over a window. */
export function windowAverage(
  index: LogIndex,
  endDate: LocalDate,
  pick: (log: DailyLog) => number | null,
  windowDays: number = WINDOW_DAYS,
): { average: number | null; readings: number } {
  let sum = 0
  let readings = 0
  for (const date of windowEndingOn(endDate, windowDays)) {
    const log = index.get(date)
    if (!log) continue
    const value = pick(log)
    if (value === null) continue
    sum += value
    readings += 1
  }
  return { average: readings === 0 ? null : sum / readings, readings }
}

/** Sum of the non-null values of one metric over a window (e.g. running km). */
export function windowTotal(
  index: LogIndex,
  endDate: LocalDate,
  pick: (log: DailyLog) => number | null,
  windowDays: number = WINDOW_DAYS,
): { total: number; readings: number } {
  let total = 0
  let readings = 0
  for (const date of windowEndingOn(endDate, windowDays)) {
    const log = index.get(date)
    if (!log) continue
    const value = pick(log)
    if (value === null) continue
    total += value
    readings += 1
  }
  return { total, readings }
}
