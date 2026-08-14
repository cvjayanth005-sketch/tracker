import { describe, expect, it } from 'vitest'
import { buildFoodContext } from './foodContext'
import { asLocalDate } from './date'
import { defaultPhases } from './seed'
import { makeLog } from './testUtils'
import type { Meal, MealSlot, Phase, UserProfile } from './types'

const TODAY = asLocalDate('2026-08-15')
const STAMP = '2026-08-15T00:00:00.000Z'

function phase(overrides: Partial<Phase> = {}): Phase {
  return {
    ...defaultPhases()[0]!,
    calories: 2000,
    proteinG: 180,
    mealsPerDay: 4,
    ...overrides,
  }
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'me',
    name: null,
    heightCm: 180,
    birthYear: 1995,
    startWeightKg: 90,
    goalWeightKg: 80,
    updatedAt: STAMP,
    ...overrides,
  }
}

function meal(slot: MealSlot, partial: Partial<Meal> = {}): Meal {
  return {
    id: `${slot}-${partial.name ?? ''}`,
    date: TODAY,
    slot,
    name: partial.name ?? slot,
    time: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    notes: null,
    source: 'manual',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial,
  }
}

describe('buildFoodContext', () => {
  it('reports remaining macros against the phase targets', () => {
    const log = makeLog('2026-08-15', { calories: 1400, proteinG: 120, carbsG: 150, fatG: 40 })
    const ctx = buildFoodContext(TODAY, phase(), profile(), [log], [])
    expect(ctx.today.caloriesRemaining).toBe(600)
    expect(ctx.today.proteinRemaining).toBe(60)
  })

  it('computes the macro energy split from grams', () => {
    // 100g protein (400) + 100g carbs (400) + 44.4g fat (~400) ≈ even thirds.
    const log = makeLog('2026-08-15', { calories: 1200, proteinG: 100, carbsG: 100, fatG: 44.4 })
    const ctx = buildFoodContext(TODAY, phase(), profile(), [log], [])
    expect(ctx.today.macroSplitPct).not.toBeNull()
    expect(ctx.today.macroSplitPct!.proteinPct).toBe(33)
  })

  it('leaves everything null when nothing is logged', () => {
    const ctx = buildFoodContext(TODAY, phase(), profile(), [], [])
    expect(ctx.today.logged).toBe(false)
    expect(ctx.today.caloriesRemaining).toBeNull()
    expect(ctx.today.macroSplitPct).toBeNull()
  })

  it('infers a fat-loss goal direction from profile weights', () => {
    const ctx = buildFoodContext(TODAY, phase(), profile({ startWeightKg: 90, goalWeightKg: 80 }), [], [])
    expect(ctx.physiqueGoal?.direction).toBe('lose')
  })

  it('flags back-loaded protein and a low daily protein gap', () => {
    const log = makeLog('2026-08-15', { calories: 1600, proteinG: 90, carbsG: 200, fatG: 40 })
    const meals = [
      meal('breakfast', { name: 'toast', proteinG: 8 }),
      meal('dinner', { name: 'steak', proteinG: 70 }),
    ]
    const ctx = buildFoodContext(TODAY, phase(), profile(), [log], meals)
    expect(ctx.today.proteinBySlot.dinner).toBe(70)
    expect(ctx.observations.some((note) => note.toLowerCase().includes('back-loaded'))).toBe(true)
    expect(ctx.observations.some((note) => note.includes('protein target'))).toBe(true)
  })

  it('averages the 7-day window and ignores days outside it', () => {
    const logs = [
      makeLog('2026-08-07', { proteinG: 999 }), // 8 days back — excluded
      makeLog('2026-08-14', { proteinG: 100 }),
      makeLog('2026-08-15', { proteinG: 200 }),
    ]
    const ctx = buildFoodContext(TODAY, phase(), profile(), logs, [])
    expect(ctx.weekAverages.days).toBe(2)
    expect(ctx.weekAverages.proteinG).toBe(150)
  })
})
