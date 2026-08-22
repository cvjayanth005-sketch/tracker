import { addDays, compareDates, daysBetween } from './date'
import type { DailyLog, LocalDate } from './types'

/** Enough separation to reduce scale noise without starving the trend of data. */
export const WEIGH_IN_INTERVAL_DAYS = 3

export interface WeighInCadence {
  due: boolean
  lastWeighInDate: LocalDate | null
  nextWeighInDate: LocalDate
  daysUntilNext: number
}

/**
 * A flexible every-third-day cadence based on the last actual reading, rather
 * than a brittle weekday schedule. A missed day simply makes the next visit
 * due; it never creates a backlog of required weigh-ins.
 */
export function getWeighInCadence(today: LocalDate, logs: DailyLog[]): WeighInCadence {
  const last = logs
    .filter((log) => log.weightKg !== null && compareDates(log.date, today) <= 0)
    .sort((a, b) => compareDates(b.date, a.date))[0]

  if (!last) {
    return { due: true, lastWeighInDate: null, nextWeighInDate: today, daysUntilNext: 0 }
  }

  const elapsed = daysBetween(last.date, today)
  const nextWeighInDate = addDays(last.date, WEIGH_IN_INTERVAL_DAYS)
  const daysUntilNext = Math.max(0, WEIGH_IN_INTERVAL_DAYS - elapsed)
  return {
    due: elapsed >= WEIGH_IN_INTERVAL_DAYS,
    lastWeighInDate: last.date,
    nextWeighInDate,
    daysUntilNext,
  }
}
