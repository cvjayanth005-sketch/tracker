import { dayOfWeek } from './date'
import type { DaySchedule, LocalDate, Phase, ScheduleOverride } from './types'

const restDay = (date: LocalDate): DaySchedule => ({
  dow: dayOfWeek(date), gym: false, sessionType: 'rest', runKm: null, runType: null,
})

/** Resolve the recurring plan plus the latest user-authored date exception. */
export function scheduleForDate(
  phase: Phase,
  date: LocalDate,
  overrides: ScheduleOverride[] = [],
): DaySchedule | undefined {
  const base = phase.schedule.find((item) => item.dow === dayOfWeek(date))
  const ordered = [...overrides].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const incoming = ordered.find(
    (item) => item.targetDate === date && item.sourceDate !== date && item.action !== 'skip',
  )
  if (incoming) {
    const source = phase.schedule.find((item) => item.dow === dayOfWeek(incoming.sourceDate))
    return source ? { ...source, dow: dayOfWeek(date) } : base
  }
  const outgoing = ordered.find((item) => item.sourceDate === date && item.action !== 'makeup')
  return outgoing ? restDay(date) : base
}

export function scheduleChangeForDate(date: LocalDate, overrides: ScheduleOverride[]) {
  const outgoing = overrides.find((item) => item.sourceDate === date)
  const incoming = overrides.find((item) => item.targetDate === date && item.sourceDate !== date)
  return outgoing ?? incoming
}
