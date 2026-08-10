import { dayOfWeek, daysBetween } from './date'
import type { LocalDate } from './types'

export function planWeek(planStartDate: LocalDate | null, date: LocalDate): number | null {
  if (!planStartDate) return null
  const days = daysBetween(planStartDate, date)
  if (days < 0) return null
  return Math.floor(days / 7) + 1
}

export function planDayLabel(planStartDate: LocalDate | null, date: LocalDate): string {
  const week = planWeek(planStartDate, date)
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = names[dayOfWeek(date)] ?? ''
  return week ? `Week ${week} · ${day}` : day
}
