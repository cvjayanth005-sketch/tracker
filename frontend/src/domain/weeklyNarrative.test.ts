import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import {
  buildWeeklyNarrativeContext,
  hasEnoughDataForNarrative,
  MIN_LOGGED_DAYS_FOR_NARRATIVE,
  weeklyNarrativePrompt,
} from './weeklyNarrative'
import type { ComplianceReport, MetricCompliance } from './compliance'

function metric(hitRatePct: number | null): MetricCompliance {
  return {
    metric: 'calories',
    eligibleDays: 7,
    knownDays: 7,
    hitDays: 0,
    missedDays: 0,
    unknownDays: 0,
    notScheduledDays: 0,
    hitRatePct,
    coveragePct: 100,
  }
}

function report(): ComplianceReport {
  return {
    from: asLocalDate('2026-08-14'),
    to: asLocalDate('2026-08-20'),
    metrics: {
      calories: metric(80),
      protein: metric(60),
      steps: metric(90),
      sleep: metric(null),
      meals: metric(100),
      gym: metric(75),
      run: metric(null),
    },
    overallHitRatePct: 76,
    overallCoveragePct: 90,
  }
}

describe('hasEnoughDataForNarrative', () => {
  it('refuses below the minimum logged days', () => {
    expect(hasEnoughDataForNarrative(MIN_LOGGED_DAYS_FOR_NARRATIVE - 1)).toBe(false)
  })

  it('allows exactly the minimum', () => {
    expect(hasEnoughDataForNarrative(MIN_LOGGED_DAYS_FOR_NARRATIVE)).toBe(true)
  })
})

describe('buildWeeklyNarrativeContext', () => {
  it('carries through each metric hit rate distinctly', () => {
    const ctx = buildWeeklyNarrativeContext(asLocalDate('2026-08-20'), report(), 5, -0.4)
    expect(ctx.calorieHitRatePct).toBe(80)
    expect(ctx.proteinHitRatePct).toBe(60)
    expect(ctx.stepsHitRatePct).toBe(90)
    expect(ctx.gymHitRatePct).toBe(75)
    expect(ctx.sleepHitRatePct).toBeNull()
    expect(ctx.trendWeightChangeKg).toBe(-0.4)
    expect(ctx.loggedDays).toBe(5)
  })

  it('anchors the week to the 7 days ending today', () => {
    const ctx = buildWeeklyNarrativeContext(asLocalDate('2026-08-20'), report(), 5, null)
    expect(ctx.weekEnd).toBe('2026-08-20')
    expect(ctx.weekStart).toBe('2026-08-14')
  })
})

describe('weeklyNarrativePrompt', () => {
  it('instructs the model not to invent numbers beyond the given context', () => {
    expect(weeklyNarrativePrompt()).toMatch(/do not estimate or invent/i)
  })
})
