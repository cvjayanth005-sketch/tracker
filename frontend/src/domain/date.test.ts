import { describe, expect, it } from 'vitest'
import {
  addDays,
  asLocalDate,
  dateRange,
  dayOfWeek,
  daysBetween,
  isLocalDate,
  todayIn,
  windowEndingOn,
} from './date'
import { d } from './testUtils'

describe('local date validation', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isLocalDate('2026-02-28')).toBe(true)
    expect(isLocalDate('2024-02-29')).toBe(true) // leap year
    expect(isLocalDate('2026-02-29')).toBe(false) // not a leap year
    expect(isLocalDate('2026-13-01')).toBe(false)
    expect(isLocalDate('2026-04-31')).toBe(false)
    expect(isLocalDate('2026-1-1')).toBe(false)
    expect(() => asLocalDate('nonsense')).toThrow()
  })
})

describe('todayIn', () => {
  it('uses the configured timezone, not UTC, to decide which day it is', () => {
    // 23:40 in Kolkata on 9 Aug is already 18:10 UTC on 9 Aug — same day.
    // But 00:30 on 10 Aug in Kolkata is still 19:00 on 9 Aug in UTC, and a
    // naive toISOString() would file the log under the wrong day.
    const lateNightIST = new Date('2026-08-09T19:00:00.000Z')
    expect(todayIn('Asia/Kolkata', lateNightIST)).toBe('2026-08-10')
    expect(todayIn('UTC', lateNightIST)).toBe('2026-08-09')
    expect(todayIn('America/Los_Angeles', lateNightIST)).toBe('2026-08-09')
  })
})

describe('day arithmetic', () => {
  it('knows 5 Jan 2026 is a Monday', () => {
    expect(dayOfWeek(d('2026-01-05'))).toBe(1)
    expect(dayOfWeek(d('2026-01-11'))).toBe(0)
  })

  it('crosses month and year boundaries', () => {
    expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01')
    expect(addDays(d('2026-01-01'), -1)).toBe('2025-12-31')
    expect(addDays(d('2024-02-28'), 1)).toBe('2024-02-29')
  })

  it('is unaffected by DST shifts', () => {
    // US DST begins 8 Mar 2026; a naive local-time +24h would land on the 8th.
    expect(addDays(d('2026-03-08'), 1)).toBe('2026-03-09')
    expect(daysBetween(d('2026-03-01'), d('2026-03-31'))).toBe(30)
  })

  it('measures signed distance between days', () => {
    expect(daysBetween(d('2026-01-01'), d('2026-01-08'))).toBe(7)
    expect(daysBetween(d('2026-01-08'), d('2026-01-01'))).toBe(-7)
  })
})

describe('windows', () => {
  it('builds an inclusive 7-day window ending on the given day', () => {
    const window = windowEndingOn(d('2026-01-11'), 7)
    expect(window).toHaveLength(7)
    expect(window[0]).toBe('2026-01-05')
    expect(window[6]).toBe('2026-01-11')
  })

  it('returns an empty range when end precedes start', () => {
    expect(dateRange(d('2026-01-10'), d('2026-01-05'))).toEqual([])
  })
})
