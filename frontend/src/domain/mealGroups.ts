import type { Meal, MealSlot } from './types'

/** Foods saved in one logging action, shown as a single meal with components. */
export interface MealGroup {
  key: string
  slot: MealSlot
  time: string | null
  meals: Meal[]
}

export function mealGroupKey(meal: Meal): string {
  return meal.groupId || `${meal.date}|${meal.slot}|${meal.createdAt}`
}

/** How many meals were logged, counting a batched Estimate/Save as one. */
export function mealGroupCount(meals: Meal[]): number {
  return new Set(meals.map(mealGroupKey)).size
}

export function groupMeals(meals: Meal[]): MealGroup[] {
  const order: string[] = []
  const byKey = new Map<string, Meal[]>()
  for (const meal of meals) {
    const key = mealGroupKey(meal)
    const existing = byKey.get(key)
    if (existing) {
      existing.push(meal)
      continue
    }
    byKey.set(key, [meal])
    order.push(key)
  }
  return order.map((key) => {
    const group = byKey.get(key) ?? []
    const first = group[0]
    return {
      key,
      slot: first?.slot ?? 'snack',
      time: group.find((meal) => meal.time)?.time ?? null,
      meals: group,
    }
  })
}

export function groupMacroTotals(meals: Meal[]): {
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
} {
  const sum = (pick: (meal: Meal) => number | null): number | null => {
    const known = meals.flatMap((meal) => {
      const value = pick(meal)
      return value === null ? [] : [value]
    })
    return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
  }
  return {
    calories: sum((meal) => meal.calories),
    proteinG: sum((meal) => meal.proteinG),
    carbsG: sum((meal) => meal.carbsG),
    fatG: sum((meal) => meal.fatG),
  }
}

export function groupName(meals: Meal[]): string {
  return meals.map((meal) => meal.name.trim() || 'Untitled').join(', ')
}
