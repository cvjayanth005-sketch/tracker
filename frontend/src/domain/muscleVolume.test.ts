import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { classifyExerciseMuscle, computeMuscleVolume } from './muscleVolume'
import type { Exercise, Workout, WorkoutSet } from './types'

const TODAY = asLocalDate('2026-08-17')

function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    sessionType: 'upper',
    repRangeMin: 6,
    repRangeMax: 10,
    targetSets: 3,
    targetRir: 2,
    loadIncrementKg: 2.5,
    order: 0,
    archived: false,
  }
}

function set(exerciseId: string, weightKg: number, reps: number): WorkoutSet {
  return {
    id: `${exerciseId}-${Math.random()}`,
    workoutId: 'w1',
    exerciseId,
    setNumber: 1,
    weightKg,
    reps,
    rir: 2,
    isWarmup: false,
    createdAt: new Date().toISOString(),
  }
}

function workout(id: string, date: string): Workout {
  return { id, date: asLocalDate(date), sessionType: 'upper', startedAt: null, finishedAt: null, notes: null, prescription: null }
}

describe('classifyExerciseMuscle', () => {
  it('routes leg curl and leg extension to legs, not arms', () => {
    expect(classifyExerciseMuscle('Leg Curl')).toBe('legs')
    expect(classifyExerciseMuscle('Leg Extension')).toBe('legs')
  })

  it('routes deadlift variants to legs', () => {
    expect(classifyExerciseMuscle('Romanian Deadlift')).toBe('legs')
    expect(classifyExerciseMuscle('Conventional Deadlift')).toBe('legs')
  })

  it('routes chest presses and flyes to chest', () => {
    expect(classifyExerciseMuscle('Barbell Bench Press')).toBe('chest')
    expect(classifyExerciseMuscle('Incline Dumbbell Fly')).toBe('chest')
  })

  it('routes pulling movements to back', () => {
    expect(classifyExerciseMuscle('Barbell Row')).toBe('back')
    expect(classifyExerciseMuscle('Lat Pulldown')).toBe('back')
  })

  it('routes presses and raises to shoulders', () => {
    expect(classifyExerciseMuscle('Overhead Press')).toBe('shoulders')
    expect(classifyExerciseMuscle('Lateral Raise')).toBe('shoulders')
  })

  it('routes curls and pushdowns to arms', () => {
    expect(classifyExerciseMuscle('Dumbbell Curl')).toBe('arms')
    expect(classifyExerciseMuscle('Triceps Pushdown')).toBe('arms')
  })

  it('routes plank and crunch variants to core', () => {
    expect(classifyExerciseMuscle('Plank')).toBe('core')
    expect(classifyExerciseMuscle('Cable Crunch')).toBe('core')
  })

  it('returns null for something it cannot classify', () => {
    expect(classifyExerciseMuscle('Farmer Carry')).toBeNull()
  })
})

describe('computeMuscleVolume', () => {
  it('sums volume into the right buckets', () => {
    const exercises = [exercise('bench', 'Barbell Bench Press'), exercise('squat', 'Back Squat')]
    const sessions = [
      {
        workout: workout('w1', '2026-08-15'),
        sets: [set('bench', 100, 5), set('squat', 120, 5)],
      },
    ]
    const totals = computeMuscleVolume(sessions, exercises, TODAY, 30)
    expect(totals.chest).toBe(500)
    expect(totals.legs).toBe(600)
    expect(totals.back).toBe(0)
  })

  it('drops sessions older than the window', () => {
    const exercises = [exercise('bench', 'Barbell Bench Press')]
    const sessions = [{ workout: workout('w1', '2026-07-01'), sets: [set('bench', 100, 5)] }]
    const totals = computeMuscleVolume(sessions, exercises, TODAY, 14)
    expect(totals.chest).toBe(0)
  })

  it('ignores sets for exercises it cannot classify', () => {
    const exercises = [exercise('carry', 'Farmer Carry')]
    const sessions = [{ workout: workout('w1', '2026-08-16'), sets: [set('carry', 40, 20)] }]
    const totals = computeMuscleVolume(sessions, exercises, TODAY, 30)
    expect(Object.values(totals).every((v) => v === 0)).toBe(true)
  })

  it('ignores future-dated sessions', () => {
    const exercises = [exercise('bench', 'Barbell Bench Press')]
    const sessions = [{ workout: workout('w1', '2026-08-20'), sets: [set('bench', 100, 5)] }]
    const totals = computeMuscleVolume(sessions, exercises, TODAY, 30)
    expect(totals.chest).toBe(0)
  })
})
