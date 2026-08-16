import { describe, expect, it } from 'vitest'
import { asLocalDate, addDays, daysBetween } from './date'
import { projectArrival } from './projection'
import type { TrendPoint } from './trend'

const TODAY = asLocalDate('2026-08-16')

/** A trend series falling at a steady rate, optionally with added wobble. */
function series(opts: {
  days: number
  startKg: number
  kgPerDay: number
  wobble?: number
  gaps?: boolean
}): TrendPoint[] {
  const start = addDays(TODAY, -(opts.days - 1))
  return Array.from({ length: opts.days }, (_, i) => {
    const date = addDays(start, i)
    // Deterministic pseudo-wobble so the test is not flaky.
    const noise = opts.wobble ? Math.sin(i * 1.7) * opts.wobble : 0
    return {
      date,
      rawKg: opts.startKg + opts.kgPerDay * i + noise,
      trendKg: opts.gaps && i % 5 === 0 ? null : opts.startKg + opts.kgPerDay * i + noise,
    }
  })
}

describe('refuses to guess', () => {
  it('says nothing without a goal weight', () => {
    const p = projectArrival(series({ days: 30, startKg: 90, kgPerDay: -0.02 }), TODAY, null)
    expect(p.status).toBe('insufficient_data')
    expect(p.arrivalDate).toBeNull()
  })

  it('needs enough trend points before dating anything', () => {
    const p = projectArrival(series({ days: 5, startKg: 90, kgPerDay: -0.02 }), TODAY, 80)
    expect(p.status).toBe('insufficient_data')
    expect(p.detail).toMatch(/more days/)
    expect(p.arrivalDate).toBeNull()
  })

  it('will not date a flat trend', () => {
    const p = projectArrival(series({ days: 40, startKg: 90, kgPerDay: 0 }), TODAY, 80)
    expect(p.status).toBe('stalled')
    expect(p.arrivalDate).toBeNull()
    // The rate is still reported, because "flat" is itself the information.
    expect(p.ratePerWeek).toBeCloseTo(0, 2)
  })

  it('refuses to date movement away from the goal', () => {
    // Gaining while the goal is below.
    const p = projectArrival(series({ days: 40, startKg: 90, kgPerDay: 0.03 }), TODAY, 80)
    expect(p.status).toBe('wrong_direction')
    expect(p.arrivalDate).toBeNull()
    expect(p.ratePerWeek).toBeGreaterThan(0)
  })

  it('does not project beyond a year', () => {
    // 0.015 kg/day clears the stall threshold (0.105 kg/week) but still puts
    // 10kg roughly 667 days out, which is past the horizon.
    const p = projectArrival(series({ days: 40, startKg: 90, kgPerDay: -0.015 }), TODAY, 80)
    expect(p.status).toBe('insufficient_data')
    expect(p.detail).toMatch(/more than a year/)
  })

  it('recognises the goal is already met', () => {
    const p = projectArrival(series({ days: 40, startKg: 80, kgPerDay: -0.001 }), TODAY, 80)
    expect(p.status).toBe('already_reached')
  })
})

describe('projecting a real decline', () => {
  it('dates the arrival from the trend slope', () => {
    // 90 -> 88.8 over 40 days is -0.03 kg/day; 8.8kg to go at that rate ~ 293 days.
    const p = projectArrival(series({ days: 40, startKg: 90, kgPerDay: -0.03 }), TODAY, 80)

    expect(p.status).toBe('ok')
    expect(p.arrivalDate).not.toBeNull()
    expect(p.daysRemaining).toBeGreaterThan(250)
    expect(p.daysRemaining).toBeLessThan(340)
    expect(p.ratePerWeek).toBeCloseTo(-0.21, 1)
  })

  it('puts the arrival date exactly daysRemaining ahead of today', () => {
    const p = projectArrival(series({ days: 40, startKg: 85, kgPerDay: -0.04 }), TODAY, 80)
    expect(p.status).toBe('ok')
    expect(daysBetween(TODAY, p.arrivalDate!)).toBe(p.daysRemaining)
  })

  it('works for a gaining goal as well as a losing one', () => {
    const p = projectArrival(series({ days: 40, startKg: 70, kgPerDay: 0.03 }), TODAY, 75)
    expect(p.status).toBe('ok')
    expect(p.ratePerWeek).toBeGreaterThan(0)
  })

  it('ignores gaps rather than bridging them', () => {
    const withGaps = projectArrival(series({ days: 40, startKg: 90, kgPerDay: -0.03, gaps: true }), TODAY, 80)
    expect(withGaps.status).toBe('ok')
    // Dropping every fifth point should not meaningfully move the estimate.
    const clean = projectArrival(series({ days: 40, startKg: 90, kgPerDay: -0.03 }), TODAY, 80)
    expect(Math.abs(withGaps.daysRemaining! - clean.daysRemaining!)).toBeLessThan(30)
  })
})

describe('uncertainty reflects how noisy the trend is', () => {
  it('gives a steady trend a narrower band than a wobbling one', () => {
    const steady = projectArrival(series({ days: 40, startKg: 90, kgPerDay: -0.04 }), TODAY, 85)
    const noisy = projectArrival(
      series({ days: 40, startKg: 90, kgPerDay: -0.04, wobble: 0.6 }),
      TODAY,
      85,
    )

    expect(steady.status).toBe('ok')
    expect(noisy.status).toBe('ok')
    // A trend that wobbles cannot honestly claim the same precision.
    expect(noisy.uncertaintyDays!).toBeGreaterThan(steady.uncertaintyDays!)
  })

  it('always reports a band alongside a date', () => {
    const p = projectArrival(series({ days: 40, startKg: 90, kgPerDay: -0.04 }), TODAY, 85)
    expect(p.uncertaintyDays).not.toBeNull()
    expect(p.uncertaintyDays).toBeGreaterThanOrEqual(0)
  })
})
