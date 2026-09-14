import { describe, expect, it } from 'vitest'
import { computeBodyCoverage, exerciseBodyRegions } from './bodyCoverage'
import { asLocalDate } from './date'
import type { Exercise, Workout, WorkoutSet } from './types'

describe('body coverage', () => {
  it('distinguishes individual arm and leg regions without matching leg curls to biceps', () => {
    expect(exerciseBodyRegions('Seated Leg Curl')).toEqual(['hamstrings'])
    expect(exerciseBodyRegions('Leg Extension')).toEqual(['quads'])
    expect(exerciseBodyRegions('Triceps Kickback')).toEqual(['triceps'])
    expect(exerciseBodyRegions('Wrist Curl')).toEqual(['forearms'])
    expect(exerciseBodyRegions('Side Plank')).toEqual(['obliques'])
    expect(exerciseBodyRegions('Unknown custom lift')).toEqual([])
  })
  it('counts timed and bodyweight sets, excludes warmups, blank sets and dates outside the window', () => {
    const exercises = [{ id: 'plank', name: 'Plank' }, { id: 'push', name: 'Push-up' },
      { id: 'other', name: 'Custom lift' }] as Exercise[]
    const set = (exerciseId: string, patch: Partial<WorkoutSet>) => ({ exerciseId, isWarmup: false,
      reps: null, weightKg: null, ...patch }) as WorkoutSet
    const session = (date: string, sets: WorkoutSet[]) => ({ workout: { date: asLocalDate(date) } as Workout, sets })
    const result = computeBodyCoverage([
      session('2026-09-13', [set('plank', { durationSec: 45 }), set('plank', {}),
        set('push', { reps: 10, weightKg: 0 }), set('push', { reps: 8, isWarmup: true }),
        set('other', { reps: 5 })]),
      session('2026-08-15', [set('plank', { durationSec: 30 })]),
      session('2026-08-14', [set('plank', { durationSec: 30 })]),
      session('2026-09-14', [set('plank', { durationSec: 30 })]),
    ], exercises, asLocalDate('2026-09-13'))
    expect(result.regions.abs.sets).toBe(2)
    expect(result.regions.abs.lastTrained).toBe('2026-09-13')
    expect(result.regions.abs.exercises).toEqual([{ id: 'plank', name: 'Plank', sets: 2 }])
    expect(result.regions.chest.sets).toBe(1)
    expect(result.unmappedSets).toBe(1)
  })
})
