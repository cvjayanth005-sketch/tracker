import { compareDates, daysBetween } from './date'
import type { Exercise, LocalDate, Workout, WorkoutSet } from './types'
import { sessionVolume } from './progression'

/**
 * Volume by muscle group, bucketed for a single glance rather than the finer
 * 19-way split the onboarding catalogue uses. Six is what fits a radial chart
 * without the labels overlapping, and it is the grouping a lifter already
 * thinks in — "chest day", not "pec day".
 */
export type MuscleBucket = 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'legs'

export const MUSCLE_BUCKETS: readonly MuscleBucket[] = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs']

export const MUSCLE_BUCKET_LABEL: Record<MuscleBucket, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  legs: 'Legs',
}

/**
 * Name-based classifier rather than an id lookup against the onboarding
 * catalogue: live workout exercises are keyed by their own ids (`ex-upper-1`,
 * user-added custom lifts), not the catalogue's, so there is nothing to join
 * against. Order matters — "leg curl" and "leg extension" would otherwise
 * fall into the arms bucket via the bare "curl"/"extension" match, so the leg
 * check runs first and claims anything starting with "leg" outright.
 */
export function classifyExerciseMuscle(name: string): MuscleBucket | null {
  const n = name.toLowerCase()

  if (/\bleg\b|squat|lunge|calf|hip thrust|glute|quad|hamstring/.test(n)) return 'legs'
  if (/deadlift/.test(n)) return 'legs'
  if (/bench|chest|fly|flye|dip|push[- ]?up|pec/.test(n)) return 'chest'
  if (/\brow\b|pulldown|pull[- ]?up|\blat\b|shrug|back extension/.test(n)) return 'back'
  if (/overhead press|shoulder press|lateral raise|front raise|rear delt|face pull|arnold/.test(n)) return 'shoulders'
  if (/curl|tricep|pushdown|skull ?crusher|kickback|extension/.test(n)) return 'arms'
  if (/plank|crunch|sit[- ]?up|\bab\b|abs|core|twist|hanging raise/.test(n)) return 'core'

  return null
}

export type MuscleVolume = Record<MuscleBucket, number>

function emptyVolume(): MuscleVolume {
  return { chest: 0, back: 0, shoulders: 0, arms: 0, core: 0, legs: 0 }
}

/**
 * Total volume (kg × reps) per muscle bucket over a trailing window, split
 * evenly across an exercise's own sets — a session's volume already sums its
 * sets, so this just routes each exercise's slice to the bucket its name
 * classifies into and drops anything unclassifiable rather than guessing.
 */
export function computeMuscleVolume(
  sessions: Array<{ workout: Workout; sets: WorkoutSet[] }>,
  exercises: Exercise[],
  today: LocalDate,
  windowDays: number,
): MuscleVolume {
  return computeMuscleMetrics(sessions, exercises, today, windowDays).volume
}

/** The three angles on the same underlying sets — one card, three readings. */
export type MuscleMetricMode = 'volume' | 'frequency' | 'load'

export const MUSCLE_METRIC_LABEL: Record<MuscleMetricMode, string> = {
  volume: 'Total Volume',
  frequency: 'Workout Frequency',
  load: 'Muscular Load',
}

export const MUSCLE_METRIC_UNIT: Record<MuscleMetricMode, string> = {
  volume: 'kg',
  frequency: 'sets',
  load: 'reps',
}

export interface MuscleMetrics {
  /** kg × reps — how much weight actually moved. */
  volume: MuscleVolume
  /** Working sets logged — how often the bucket was trained at all. */
  frequency: MuscleVolume
  /** Total reps performed — endurance load independent of how heavy. */
  load: MuscleVolume
}

/**
 * All three readings in one pass over the sessions, so switching the mode in
 * the UI is just picking a different field rather than recomputing.
 */
export function computeMuscleMetrics(
  sessions: Array<{ workout: Workout; sets: WorkoutSet[] }>,
  exercises: Exercise[],
  today: LocalDate,
  windowDays: number,
): MuscleMetrics {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))
  const volume = emptyVolume()
  const frequency = emptyVolume()
  const load = emptyVolume()

  for (const { workout, sets } of sessions) {
    if (compareDates(workout.date, today) > 0) continue
    if (daysBetween(workout.date, today) > windowDays) continue

    const byExercise = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
      const list = byExercise.get(set.exerciseId)
      if (list) list.push(set)
      else byExercise.set(set.exerciseId, [set])
    }

    for (const [exerciseId, exerciseSets] of byExercise) {
      const exercise = exerciseById.get(exerciseId)
      if (!exercise) continue
      const bucket = classifyExerciseMuscle(exercise.name)
      if (!bucket) continue

      const working = exerciseSets.filter((s) => !s.isWarmup)
      volume[bucket] += sessionVolume(exerciseSets)
      frequency[bucket] += working.length
      load[bucket] += working.reduce((sum, s) => sum + (s.reps ?? 0), 0)
    }
  }

  return { volume, frequency, load }
}
