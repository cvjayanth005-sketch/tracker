import { describe, expect, it } from 'vitest'
import { buildConsistencyStrip, buildFoodContext, deriveMacroTargets } from './foodContext'
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
    quantity: null,
    unit: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    satFatG: null,
    micros: null,
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

  it('derives carb/fat ring targets from calories and protein', () => {
    const t = deriveMacroTargets(2000, 180)
    // fat = 27% of 2000 kcal / 9 ≈ 60g; carbs fill the rest.
    expect(t.fatG).toBe(60)
    expect(t.calories).toBe(2000)
    expect(t.proteinG).toBe(180)
    // carbs kcal = 2000 - 180*4 - 60*9 = 2000 - 720 - 540 = 740 → 185g
    expect(t.carbsG).toBe(185)
    expect(buildFoodContext(TODAY, phase(), profile(), [], []).macroTargets).toEqual(t)
  })

  it('sizes the water target from bodyweight and reads hydration back', () => {
    const log = makeLog('2026-08-15', { weightKg: 90, waterMl: 1000, sodiumMg: 4000, alcoholUnits: 3 })
    const ctx = buildFoodContext(TODAY, phase(), profile(), [log], [])
    expect(ctx.today.hydration.targetMl).toBe(3150) // 90kg × 35ml
    expect(ctx.today.hydration.waterMl).toBe(1000)
    // low water (< 60% of target), high sodium, and alcohol all get flagged.
    expect(ctx.observations.some((n) => n.toLowerCase().includes('hydration'))).toBe(true)
    expect(ctx.observations.some((n) => n.toLowerCase().includes('sodium'))).toBe(true)
    expect(ctx.observations.some((n) => n.toLowerCase().includes('alcohol'))).toBe(true)
  })

  it('computes the eating window from timed meals and flags late eating', () => {
    const meals = [
      meal('breakfast', { name: 'oats', time: '08:00' }),
      meal('dinner', { name: 'curry', time: '22:30' }),
    ]
    const ctx = buildFoodContext(TODAY, phase(), profile(), [], meals)
    expect(ctx.today.eatingWindow).toEqual({ firstMealTime: '08:00', lastMealTime: '22:30', windowHours: 14.5 })
    expect(ctx.observations.some((n) => n.toLowerCase().includes('eating window'))).toBe(true)
    expect(ctx.observations.some((n) => n.toLowerCase().includes('late eating'))).toBe(true)
  })

  it('builds the consistency strip and counts the current streak', () => {
    const logs = [
      makeLog('2026-08-12', { calories: 2000, proteinG: 180 }), // on
      makeLog('2026-08-13', { calories: 3200, proteinG: 60 }), //  off (breaks streak)
      makeLog('2026-08-14', { calories: 2000, proteinG: 180 }), // on
      makeLog('2026-08-15', { calories: 2000, proteinG: 180 }), // on (today)
    ]
    const strip = buildConsistencyStrip(TODAY, logs, phase(), 14)
    expect(strip.days).toHaveLength(14)
    const last = strip.days.slice(-4)
    expect(last.map((d) => d.status)).toEqual(['on', 'off', 'on', 'on'])
    expect(strip.streak).toBe(2) // today + yesterday, broken by 08-13
  })

  it('does not let an unlogged today break the streak', () => {
    const logs = [
      makeLog('2026-08-13', { calories: 2000, proteinG: 180 }),
      makeLog('2026-08-14', { calories: 2000, proteinG: 180 }),
      // 2026-08-15 (today) not logged
    ]
    const strip = buildConsistencyStrip(TODAY, logs, phase(), 14)
    expect(strip.days.at(-1)!.status).toBe('none')
    expect(strip.streak).toBe(2)
  })

  it('reports day completeness and hedges a partial under-target day', () => {
    const empty = buildFoodContext(TODAY, phase(), profile(), [], [])
    expect(empty.today.completeness).toBe('empty')

    const partial = buildFoodContext(TODAY, phase(), profile(), [makeLog('2026-08-15', { calories: 800, proteinG: 60 })], [])
    expect(partial.today.completeness).toBe('partial')
    expect(partial.today.logComplete).toBe(false)
    expect(partial.observations.some((n) => n.toLowerCase().includes('still open'))).toBe(true)

    const done = buildFoodContext(TODAY, phase(), profile(), [makeLog('2026-08-15', { calories: 800, proteinG: 60, foodComplete: true })], [])
    expect(done.today.completeness).toBe('complete')
    expect(done.today.logComplete).toBe(true)
    // A day the user marked done is not flagged as partial, even if under target.
    expect(done.observations.some((n) => n.toLowerCase().includes('still open'))).toBe(false)
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
