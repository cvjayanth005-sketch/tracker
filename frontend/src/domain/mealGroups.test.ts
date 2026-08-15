import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { groupMeals, groupName, mealGroupCount, mealGroupKey } from './mealGroups'
import type { Meal, MealSlot } from './types'

const TODAY = asLocalDate('2026-08-15')
const STAMP = '2026-08-15T12:00:00.000Z'

function meal(slot: MealSlot, partial: Partial<Meal> = {}): Meal {
  return {
    id: `${slot}-${partial.name ?? 'food'}`,
    date: TODAY,
    slot,
    name: partial.name ?? 'food',
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
    source: 'ai',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial,
  }
}

describe('meal grouping', () => {
  it('counts a batched lunch as one meal', () => {
    const lunch = [
      meal('lunch', { id: '1', name: 'roti', groupId: 'g1', calories: 225 }),
      meal('lunch', { id: '2', name: 'aloo bhujiya', groupId: 'g1', calories: 300 }),
      meal('lunch', { id: '3', name: 'cucumber', groupId: 'g1', calories: 8 }),
    ]
    expect(mealGroupCount(lunch)).toBe(1)
    const groups = groupMeals(lunch)
    expect(groups).toHaveLength(1)
    expect(groupName(groups[0]!.meals)).toBe('roti, aloo bhujiya, cucumber')
  })

  it('keeps a later snack as its own meal', () => {
    const meals = [
      meal('lunch', { id: '1', name: 'roti', groupId: 'lunch-1' }),
      meal('snack', { id: '2', name: 'whey', groupId: 'snack-1' }),
    ]
    expect(mealGroupCount(meals)).toBe(2)
  })

  it('falls back to date, slot, and createdAt when groupId is missing', () => {
    const a = meal('lunch', { id: '1', name: 'roti', createdAt: STAMP })
    const b = meal('lunch', { id: '2', name: 'bhujiya', createdAt: STAMP })
    const c = meal('lunch', { id: '3', name: 'later', createdAt: '2026-08-15T13:00:00.000Z' })
    expect(mealGroupKey(a)).toBe(mealGroupKey(b))
    expect(mealGroupCount([a, b, c])).toBe(2)
  })
})
