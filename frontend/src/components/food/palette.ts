import type { MealSlot } from '@/domain/types'

/** One coherent neon palette for the whole food section, dark-first. */
export const MACRO = {
  calories: { color: '#39ff14', glow: 'rgb(57 255 20 / 0.28)', label: 'Calories', unit: 'kcal' },
  protein: { color: '#00f0ff', glow: 'rgb(0 240 255 / 0.25)', label: 'Protein', unit: 'g' },
  carbs: { color: '#b98bff', glow: 'rgb(185 139 255 / 0.28)', label: 'Carbs', unit: 'g' },
  fat: { color: '#ffb020', glow: 'rgb(255 176 32 / 0.26)', label: 'Fat', unit: 'g' },
} as const

export type MacroKey = keyof typeof MACRO

/** Quality sub-macros shown as secondary readouts, keyed by their Meal field. */
export const SUBMACRO = {
  sugarG: { color: '#ff6fb5', glow: 'rgb(255 111 181 / 0.26)', label: 'Sugar', unit: 'g' },
  satFatG: { color: '#ff8a5c', glow: 'rgb(255 138 92 / 0.26)', label: 'Sat fat', unit: 'g' },
} as const

export type SubMacroKey = keyof typeof SUBMACRO

export const SLOT_META: Record<MealSlot, { label: string; icon: string }> = {
  breakfast: { label: 'Breakfast', icon: '☀️' },
  lunch: { label: 'Lunch', icon: '🍽️' },
  dinner: { label: 'Dinner', icon: '🌙' },
  snack: { label: 'Snack', icon: '🍎' },
}

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
