import type { Exercise, Workout, WorkoutSet } from './types'

export type OneRepMaxFormula = 'epley' | 'brzycki'

export function estimateOneRepMax(weightKg: number, reps: number, formula: OneRepMaxFormula = 'epley'): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps < 1 || reps > 12) return null
  const value = formula === 'brzycki'
    ? weightKg * (36 / (37 - reps))
    : weightKg * (1 + reps / 30)
  return Math.round(value * 10) / 10
}

export interface OneRepMaxPoint { date: string; estimateKg: number; exerciseId: string }

export function oneRepMaxHistory(
  exerciseId: string,
  sessions: Array<{ workout: Workout; sets: WorkoutSet[] }>,
): OneRepMaxPoint[] {
  return sessions.flatMap(({ workout, sets }) => {
    const estimates = sets
      .filter((set) => set.exerciseId === exerciseId && !set.isWarmup && set.weightKg !== null && set.reps !== null)
      .flatMap((set) => estimateOneRepMax(set.weightKg!, set.reps!) ?? [])
    return estimates.length ? [{ date: workout.date, estimateKg: Math.max(...estimates), exerciseId }] : []
  }).sort((a, b) => a.date.localeCompare(b.date))
}

export function eligibleStrengthExercises(exercises: Exercise[]): Exercise[] {
  return exercises.filter((exercise) => !exercise.isTimed && !exercise.archived)
}
