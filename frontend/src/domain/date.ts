import type { DayOfWeek, LocalDate } from './types'

/**
 * Local calendar dates only.
 *
 * The whole app keys days by `YYYY-MM-DD` in the user's configured timezone.
 * A log written at 23:40 must land on that day, not tomorrow — which is what
 * `toISOString()` would do. Nothing here ever touches UTC arithmetic.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isLocalDate(value: string): value is LocalDate {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function asLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new Error(`Not a local date: ${value}`)
  return value
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** "Today" in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return asLocalDate(parts)
}

/**
 * Minutes since local midnight in the given timezone. Advice that depends on
 * how much of the day is left needs the user's clock, not the browser's.
 */
export function minutesOfDayIn(timezone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const [hours, minutes] = parts.split(':').map(Number) as [number, number]
  return hours * 60 + minutes
}

/** Day-of-week for a local date, 0 = Sunday. Timezone-independent by design. */
export function dayOfWeek(date: LocalDate): DayOfWeek {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as DayOfWeek
}

export function addDays(date: LocalDate, delta: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  const yy = String(shifted.getUTCFullYear()).padStart(4, '0')
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return asLocalDate(`${yy}-${mm}-${dd}`)
}

/** Whole days from `from` to `to`; negative if `to` precedes `from`. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000)
}

function utcMs(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Inclusive list of dates from `start` to `end`. Empty if `end` < `start`. */
export function dateRange(start: LocalDate, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = start; compareDates(d, end) <= 0; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * The `length`-day window ending on `end` (inclusive), oldest first.
 * `windowEndingOn('2026-01-10', 7)` => 2026-01-04 .. 2026-01-10.
 */
export function windowEndingOn(end: LocalDate, length: number): LocalDate[] {
  return dateRange(addDays(end, -(length - 1)), end)
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function weekdayName(date: LocalDate): string {
  return WEEKDAY_NAMES[dayOfWeek(date)] as string
}

/** "9 Aug" / "9 Aug 2025" — display only, never parsed back. */
export function formatShort(date: LocalDate, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const month = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
  return withYear ? `${d} ${month} ${y}` : `${d} ${month}`
}
