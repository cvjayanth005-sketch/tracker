import { addDays, asLocalDate } from './date'
import type { DailyLog, LocalDate } from './types'

/** Test helpers. Not a `.test.ts` file, so vitest does not collect it. */

const STAMP = '2026-01-01T00:00:00.000Z'

export const d = (value: string): LocalDate => asLocalDate(value)

export function makeLog(date: string, partial: Partial<DailyLog> = {}): DailyLog {
  return {
    date: d(date),
    weightKg: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    waterMl: null,
    sodiumMg: null,
    alcoholUnits: null,
    caffeineMg: null,
    steps: null,
    runKm: null,
    gymDone: null,
    mealsOnPlan: null,
    sleepHours: null,
    energy: null,
    hunger: null,
    soreness: null,
    stress: null,
    trainingMinutesAvailable: null,
    trainingConstraints: null,
    notes: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial,
  }
}

/** Fields that satisfy every Phase-1 target, for isolating one variable. */
export const COMPLIANT: Partial<DailyLog> = {
  calories: 2050,
  proteinG: 170,
  steps: 11500,
  runKm: 6,
  gymDone: true,
  mealsOnPlan: 4,
  sleepHours: 7.5,
  energy: 4,
  hunger: 3,
  soreness: 2,
}

/**
 * One log per day starting at `start`; `weights[i]` is the weight on day i.
 * A `null` weight means the day exists but was not weighed.
 */
export function logsFromWeights(
  start: string,
  weights: Array<number | null>,
  extra: Partial<DailyLog> = {},
): DailyLog[] {
  return weights.map((weightKg, i) =>
    makeLog(addDays(d(start), i), { weightKg, ...extra }),
  )
}

/** `count` copies of `value` — keeps week-shaped fixtures readable. */
export function repeat<T>(value: T, count: number): T[] {
  return Array.from({ length: count }, () => value)
}
