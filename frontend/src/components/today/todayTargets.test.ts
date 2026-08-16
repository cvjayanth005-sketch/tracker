import { describe, expect, it } from 'vitest'
import { asLocalDate } from '@/domain/date'
import { TOLERANCE } from '@/domain/compliance'
import { defaultPhases } from '@/domain/seed'
import { makeLog } from '@/domain/testUtils'
import {
  buildInsight,
  buildTodayTargets,
  formatActual,
  formatBand,
} from './todayTargets'
import type { Phase } from '@/domain/types'

const DATE = asLocalDate('2026-08-16')

function phase(overrides: Partial<Phase> = {}): Phase {
  return {
    ...defaultPhases()[0]!,
    calories: 2000,
    proteinG: 180,
    steps: 10000,
    sleepHours: 8,
    ...overrides,
  }
}

const find = (targets: ReturnType<typeof buildTodayTargets>, metric: string) =>
  targets.find((t) => t.metric === metric)!

describe('bands come from the same tolerance the app judges by', () => {
  it('derives the calorie range from TOLERANCE rather than inventing one', () => {
    const calories = find(buildTodayTargets(phase(), undefined, DATE), 'calories')

    expect(calories.band).toEqual({
      kind: 'range',
      min: 2000 * TOLERANCE.caloriesLower,
      max: 2000 * TOLERANCE.caloriesUpper,
    })
    expect(formatBand(calories.band)).toBe('1,700–2,100')
  })

  it('shows floors as floors, not as invented two-sided ranges', () => {
    const targets = buildTodayTargets(phase(), undefined, DATE)

    expect(find(targets, 'protein').band).toEqual({ kind: 'floor', min: 171 })
    expect(find(targets, 'steps').band).toEqual({ kind: 'floor', min: 9000 })
    expect(find(targets, 'sleep').band).toEqual({ kind: 'floor', min: 7.5 })
    expect(formatBand(find(targets, 'protein').band)).toBe('171+')
  })

  it('agrees with outcomeFor at the edge of the band', () => {
    // 1,750 is under the plain 2,000 target but inside the tolerated range, so
    // the screen and the compliance engine must both call it a hit.
    const inside = buildTodayTargets(phase(), makeLog('2026-08-16', { calories: 1750 }), DATE)
    expect(find(inside, 'calories').outcome).toBe('hit')

    const outside = buildTodayTargets(phase(), makeLog('2026-08-16', { calories: 1600 }), DATE)
    expect(find(outside, 'calories').outcome).toBe('missed')
  })
})

describe('missing data never renders as zero', () => {
  it('keeps an unlogged value null and formats it as an em dash', () => {
    const targets = buildTodayTargets(phase(), undefined, DATE)

    for (const target of targets) {
      expect(target.actual).toBeNull()
      expect(target.progress).toBeNull()
      expect(target.outcome).toBe('unknown')
      expect(formatActual(target.actual, target.metric)).toBe('—')
    }
  })

  it('formats NaN as an em dash rather than letting it reach the screen', () => {
    expect(formatActual(Number.NaN, 'calories')).toBe('—')
    expect(formatBand({ kind: 'range', min: Number.NaN, max: 10 })).toBe('—')
  })

  it('distinguishes a genuine zero from an absent value', () => {
    const zero = buildTodayTargets(phase(), makeLog('2026-08-16', { steps: 0 }), DATE)
    expect(find(zero, 'steps').actual).toBe(0)
    expect(formatActual(0, 'steps')).toBe('0')
  })
})

describe('steps give a practical recommendation', () => {
  it('converts the remaining distance into minutes of walking', () => {
    const targets = buildTodayTargets(phase(), makeLog('2026-08-16', { steps: 5200 }), DATE)
    const steps = find(targets, 'steps')

    // 9,000 floor - 5,200 logged = 3,800 to go.
    expect(steps.hint).toContain('3,800')
    expect(steps.hint).toMatch(/\d+-minute walk/)
  })

  it('drops the hint once the target is met', () => {
    const targets = buildTodayTargets(phase(), makeLog('2026-08-16', { steps: 11000 }), DATE)
    expect(find(targets, 'steps').hint).toBeNull()
  })

  it('states the whole target when nothing is logged', () => {
    const targets = buildTodayTargets(phase(), undefined, DATE)
    expect(find(targets, 'steps').hint).toContain('9,000')
  })
})

describe('calorie hints read the right side of the range', () => {
  it('reports how far over the top of the range a day went', () => {
    const targets = buildTodayTargets(phase(), makeLog('2026-08-16', { calories: 2400 }), DATE)
    expect(find(targets, 'calories').hint).toContain('300 kcal over')
  })

  it('reports what is left before reaching the bottom of the range', () => {
    const targets = buildTodayTargets(phase(), makeLog('2026-08-16', { calories: 1200 }), DATE)
    expect(find(targets, 'calories').hint).toContain('500 kcal left')
  })
})

describe('insights speak plainly instead of quoting averages', () => {
  it('refuses to read a trend from too few logged days', () => {
    expect(buildInsight(90, 20, 80).verdict).toBe('insufficient')
    expect(buildInsight(null, null, 80).verdict).toBe('insufficient')
    expect(buildInsight(90, 20, 80).summary).not.toMatch(/\d+%/)
  })

  it('uses the same good-adherence threshold as the rest of the app', () => {
    expect(buildInsight(85, 100, 80).verdict).toBe('good')
    expect(buildInsight(75, 100, 80).verdict).toBe('steady')
    expect(buildInsight(40, 100, 80).verdict).toBe('needs_attention')
  })

  it('never surfaces a bare percentage', () => {
    for (const rate of [95, 75, 30]) {
      expect(buildInsight(rate, 100, 80).summary).not.toMatch(/\d+%/)
    }
  })
})
