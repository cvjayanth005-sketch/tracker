import { daysBetween } from './date'
import type { Exercise, LocalDate, Workout, WorkoutSet } from './types'

export const BODY_REGIONS = {
  chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques', back: 'Back',
  glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
} as const
export type BodyRegion = keyof typeof BODY_REGIONS
export interface RegionCoverage {
  sets: number
  lastTrained: LocalDate | null
  exercises: Array<{ id: string; name: string; sets: number }>
}
export type BodyCoverage = Record<BodyRegion, RegionCoverage>

/** Conservative primary-region estimate from exercise names. Unknown names
 * remain unmapped; we never spread a broad arms/legs total over every muscle. */
export function exerciseBodyRegions(name: string): BodyRegion[] {
  const n = name.toLowerCase().replace(/[-_]/g, ' ')
  if (/calf|calves/.test(n)) return ['calves']
  if (/leg curl|hamstring|romanian|stiff leg|nordic/.test(n)) return ['hamstrings']
  if (/hip thrust|glute|kickback/.test(n) && !/tricep/.test(n)) return ['glutes']
  if (/squat|lunge|leg press|leg extension|step up|quad/.test(n)) return ['quads']
  if (/deadlift/.test(n)) return ['glutes', 'hamstrings']
  if (/wrist|forearm|farmer|loaded carry/.test(n)) return ['forearms']
  if (/tricep|pushdown|skull.?crusher|close grip bench/.test(n)) return ['triceps']
  if (/curl|bicep/.test(n)) return ['biceps']
  if (/overhead press|shoulder|lateral raise|front raise|rear delt|face pull|arnold|military press/.test(n)) return ['shoulders']
  if (/bench|chest|fly|dip|push ?up|pec/.test(n)) return ['chest']
  if (/row|pulldown|pull ?up|chin ?up|\blat\b|shrug|back extension/.test(n)) return ['back']
  if (/side plank|twist|wood.?chop|side bend|oblique/.test(n)) return ['obliques']
  if (/plank|crunch|sit ?up|\bab\b|abs|core|hanging.*raise|leg raise/.test(n)) return ['abs']
  return []
}

export function computeBodyCoverage(
  sessions: Array<{ workout: Workout; sets: WorkoutSet[] }>,
  exercises: Exercise[], today: LocalDate, windowDays = 30,
): { regions: BodyCoverage; unmappedSets: number } {
  const regions = Object.fromEntries(Object.keys(BODY_REGIONS).map((id) => [id,
    { sets: 0, lastTrained: null, exercises: [] },
  ])) as unknown as BodyCoverage
  const byId = new Map(exercises.map((e) => [e.id, e]))
  let unmappedSets = 0
  for (const { workout, sets } of sessions) {
    const age = daysBetween(workout.date, today)
    if (age < 0 || age >= windowDays) continue
    for (const set of sets) {
      if (set.isWarmup || !((set.reps ?? 0) > 0 || (set.durationSec ?? 0) > 0)) continue
      const exercise = byId.get(set.exerciseId)
      const targets = exercise ? exerciseBodyRegions(exercise.name) : []
      if (!targets.length || !exercise) { unmappedSets++; continue }
      for (const target of targets) {
        const entry = regions[target]
        entry.sets++
        if (!entry.lastTrained || workout.date > entry.lastTrained) entry.lastTrained = workout.date
        const contribution = entry.exercises.find((e) => e.id === exercise.id)
        if (contribution) contribution.sets++
        else entry.exercises.push({ id: exercise.id, name: exercise.name, sets: 1 })
      }
    }
  }
  return { regions, unmappedSets }
}
