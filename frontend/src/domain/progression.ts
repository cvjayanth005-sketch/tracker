import { compareDates } from './date'
import type { Exercise, LocalDate, Workout, WorkoutSet } from './types'

/**
 * Double progression.
 *
 * Add reps at a fixed load until every working set sits at the top of the rep
 * range and is hard enough (RIR at or below target); only then add load and
 * drop back to the bottom of the range.
 *
 * Warm-ups never count. Sets with unknown reps never count as evidence of
 * success — an unlogged set is not a completed set.
 */

export type ProgressionCode =
  | 'no_history'
  | 'incomplete_data'
  | 'ready_to_increase'
  | 'keep_building'
  | 'consider_deload'

export interface ProgressionAdvice {
  code: ProgressionCode
  exerciseId: string
  headline: string
  detail: string
  /** Weight to use next session, when it can be determined. */
  suggestedWeightKg: number | null
  suggestedRepTarget: number | null
  lastSessionDate: LocalDate | null
  lastWorkingWeightKg: number | null
  lastReps: number[]
}

export interface SessionHistory {
  workout: Workout
  sets: WorkoutSet[]
}

/**
 * Most recent session containing working sets for `exerciseId`, newest first
 * ordering handled internally.
 */
export function lastSessionFor(
  exerciseId: string,
  history: SessionHistory[],
): SessionHistory | null {
  const withExercise = history
    .map((h) => ({
      workout: h.workout,
      sets: h.sets.filter((s) => s.exerciseId === exerciseId && !s.isWarmup),
    }))
    .filter((h) => h.sets.length > 0)
    .sort((a, b) => compareDates(b.workout.date, a.workout.date))
  return withExercise[0] ?? null
}

export function evaluateProgression(
  exercise: Exercise,
  history: SessionHistory[],
): ProgressionAdvice {
  const last = lastSessionFor(exercise.id, history)

  const base = {
    exerciseId: exercise.id,
    lastSessionDate: last?.workout.date ?? null,
    lastWorkingWeightKg: null as number | null,
    lastReps: [] as number[],
  }

  if (!last) {
    return {
      ...base,
      code: 'no_history',
      headline: 'First time logging this',
      detail: `Pick a load you can hold for ${exercise.repRangeMin}-${exercise.repRangeMax} ` +
        `reps with about ${exercise.targetRir} left in the tank, and log it. ` +
        `Progression starts from the next session.`,
      suggestedWeightKg: null,
      suggestedRepTarget: exercise.repRangeMax,
    }
  }

  const sets = [...last.sets].sort((a, b) => a.setNumber - b.setNumber)
  const weights = sets.map((s) => s.weightKg)
  const reps = sets.map((s) => s.reps)

  // The reference load is the heaviest logged working set of that session.
  const knownWeights = weights.filter((w): w is number => w !== null)
  const topWeight = knownWeights.length > 0 ? Math.max(...knownWeights) : null
  base.lastWorkingWeightKg = topWeight
  base.lastReps = reps.filter((r): r is number => r !== null)

  const anyUnknown =
    reps.some((r) => r === null) || weights.some((w) => w === null) || topWeight === null

  if (anyUnknown) {
    return {
      ...base,
      code: 'incomplete_data',
      headline: 'Last session was partly unlogged',
      detail: `Some sets are missing reps or load, so progression cannot be judged. ` +
        `Repeat ${topWeight !== null ? `${topWeight} kg` : 'the same load'} and log ` +
        `every working set this time.`,
      suggestedWeightKg: topWeight,
      suggestedRepTarget: exercise.repRangeMax,
    }
  }

  // Only sets at the reference load speak to progression at that load.
  const atTopWeight = sets.filter((s) => s.weightKg === topWeight)
  const repsAtTop = atTopWeight.map((s) => s.reps as number)

  const enoughSets = atTopWeight.length >= exercise.targetSets
  const allAtCeiling = repsAtTop.every((r) => r >= exercise.repRangeMax)
  // Null RIR is treated as "not proven hard enough" rather than assumed fine.
  const hardEnough = atTopWeight.every((s) => s.rir !== null && s.rir <= exercise.targetRir)

  if (enoughSets && allAtCeiling && hardEnough) {
    const next = (topWeight as number) + exercise.loadIncrementKg
    return {
      ...base,
      code: 'ready_to_increase',
      headline: `Ready to add ${exercise.loadIncrementKg} kg`,
      detail: `All ${atTopWeight.length} working sets hit ${exercise.repRangeMax} reps ` +
        `at ${topWeight} kg within ${exercise.targetRir} RIR. Go to ${next} kg and ` +
        `expect reps to drop back toward ${exercise.repRangeMin}.`,
      suggestedWeightKg: next,
      suggestedRepTarget: exercise.repRangeMin,
    }
  }

  const allBelowFloor = repsAtTop.every((r) => r < exercise.repRangeMin)
  if (allBelowFloor && repsAtTop.length >= exercise.targetSets) {
    const deloaded = Math.max(
      exercise.loadIncrementKg,
      Math.round(((topWeight as number) * 0.9) / exercise.loadIncrementKg) *
        exercise.loadIncrementKg,
    )
    return {
      ...base,
      code: 'consider_deload',
      headline: 'Load is too heavy for the range',
      detail: `Every set at ${topWeight} kg came in under ${exercise.repRangeMin} reps. ` +
        `Drop to about ${deloaded} kg and build back up through the range.`,
      suggestedWeightKg: deloaded,
      suggestedRepTarget: exercise.repRangeMin,
    }
  }

  const shortfall = repsAtTop.filter((r) => r < exercise.repRangeMax).length
  return {
    ...base,
    code: 'keep_building',
    headline: `Stay at ${topWeight} kg`,
    detail: `${shortfall} of ${repsAtTop.length} sets are still short of ` +
      `${exercise.repRangeMax} reps${!hardEnough && shortfall === 0 ? ' with proven RIR' : ''}. ` +
      `Same load, chase one more rep per set before adding weight.`,
    suggestedWeightKg: topWeight,
    suggestedRepTarget: exercise.repRangeMax,
  }
}

/** Total load moved in a session, kg·reps. Warm-ups excluded. */
export function sessionVolume(sets: WorkoutSet[]): number {
  return sets
    .filter((s) => !s.isWarmup && s.weightKg !== null && s.reps !== null)
    .reduce((sum, s) => sum + (s.weightKg as number) * (s.reps as number), 0)
}

/** Best estimated 1RM across a session's sets (Epley), for progress display. */
export function bestEstimated1rm(sets: WorkoutSet[]): number | null {
  const estimates = sets
    .filter((s) => !s.isWarmup && s.weightKg !== null && s.reps !== null && s.reps > 0)
    .map((s) => (s.weightKg as number) * (1 + (s.reps as number) / 30))
  return estimates.length === 0 ? null : Math.max(...estimates)
}
