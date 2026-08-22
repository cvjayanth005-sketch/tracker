import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { buildGainsSuggestion, groupProgression, MIN_SESSIONS_FOR_ADVICE } from './gainsSuggestion'
import type { MuscleVolume } from './muscleVolume'
import type { Exercise, Workout, WorkoutSet } from './types'

function exercise(id: string, name: string, over: Partial<Exercise> = {}): Exercise {
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
    ...over,
  }
}

function workout(id: string, date: string): Workout {
  return {
    id,
    date: asLocalDate(date),
    sessionType: 'upper',
    startedAt: null,
    finishedAt: null,
    notes: null,
    prescription: null,
  }
}

let setSeq = 0
function set(workoutId: string, exerciseId: string, weightKg: number, reps: number): WorkoutSet {
  setSeq += 1
  return {
    id: `s${setSeq}`,
    workoutId,
    exerciseId,
    setNumber: 1,
    weightKg,
    reps,
    rir: 2,
    isWarmup: false,
    createdAt: new Date().toISOString(),
  }
}

/**
 * `n` sessions of the same exercise at a fixed load and rep count.
 *
 * Three working sets per session by default, because progression is only read
 * once a session carries at least `targetSets` sets at the top load — two
 * would leave every exercise stuck in "keep building" regardless of the reps.
 */
function history(exerciseId: string, n: number, weightKg: number, reps: number, setsPerSession = 3) {
  return Array.from({ length: n }, (_, i) => {
    const id = `w${i}`
    const day = String(10 + i).padStart(2, '0')
    return {
      workout: workout(id, `2026-08-${day}`),
      sets: Array.from({ length: setsPerSession }, () => set(id, exerciseId, weightKg, reps)),
    }
  })
}

const flatVolume: MuscleVolume = {
  chest: 1000,
  back: 1000,
  shoulders: 1000,
  arms: 1000,
  core: 1000,
  legs: 1000,
}

describe('refuses to advise without evidence', () => {
  it('says so when no exercises are programmed', () => {
    const s = buildGainsSuggestion({ exercises: [], history: [], volume: flatVolume })
    expect(s.kind).toBe('insufficient_data')
  })

  it('says so below the session minimum, and counts down', () => {
    const ex = exercise('bench', 'Barbell Bench Press')
    const s = buildGainsSuggestion({
      exercises: [ex],
      history: history('bench', MIN_SESSIONS_FOR_ADVICE - 2, 100, 8),
      volume: flatVolume,
    })
    expect(s.kind).toBe('insufficient_data')
    expect(s.detail).toMatch(/2 more sessions/)
  })

  it('ignores archived exercises when deciding there is nothing to advise on', () => {
    const s = buildGainsSuggestion({
      exercises: [exercise('old', 'Barbell Bench Press', { archived: true })],
      history: history('old', 8, 100, 8),
      volume: flatVolume,
    })
    expect(s.kind).toBe('insufficient_data')
  })
})

describe('raises the most useful single thing', () => {
  it('flags an under-trained muscle group against a well-trained one', () => {
    const exercises = [
      exercise('bench', 'Barbell Bench Press'),
      exercise('row', 'Barbell Row'),
    ]
    // Back at a fraction of chest — well under the imbalance threshold.
    const volume: MuscleVolume = { ...flatVolume, chest: 4000, back: 500 }
    const s = buildGainsSuggestion({
      exercises,
      history: [...history('bench', 5, 100, 8), ...history('row', 5, 60, 8)],
      volume,
    })
    expect(s.kind).toBe('add_volume')
    expect(s.bucket).toBe('back')
    expect(s.exerciseIds).toContain('row')
  })

  it('does not flag ordinary variation between groups', () => {
    const exercises = [exercise('bench', 'Barbell Bench Press'), exercise('row', 'Barbell Row')]
    // Back at 80% of chest is normal programme variation, not neglect.
    const volume: MuscleVolume = { ...flatVolume, chest: 1000, back: 800 }
    const s = buildGainsSuggestion({
      exercises,
      history: [...history('bench', 5, 100, 8), ...history('row', 5, 60, 8)],
      volume,
    })
    expect(s.kind).not.toBe('add_volume')
  })

  it('will not call a group under-trained when nothing trains it', () => {
    // Only chest is programmed, so a zero core volume is not a finding.
    const s = buildGainsSuggestion({
      exercises: [exercise('bench', 'Barbell Bench Press')],
      history: history('bench', 5, 100, 8),
      volume: { ...flatVolume, chest: 4000, core: 0 },
    })
    expect(s.kind).not.toBe('add_volume')
  })

  it('names the exercise when a lift has earned more load', () => {
    // Sitting at the top of the rep range is the increase trigger.
    const ex = exercise('bench', 'Barbell Bench Press', { repRangeMax: 8 })
    const s = buildGainsSuggestion({
      exercises: [ex],
      history: history('bench', 5, 100, 8),
      volume: flatVolume,
    })
    expect(s.kind).toBe('progress_load')
    expect(s.headline).toMatch(/Barbell Bench Press/)
    expect(s.exerciseIds).toEqual(['bench'])
  })
})

describe('groupProgression', () => {
  it('sorts exercises into progression buckets and drops archived ones', () => {
    const ready = exercise('bench', 'Barbell Bench Press', { repRangeMax: 8 })
    const archived = exercise('old', 'Leg Press', { archived: true })
    const groups = groupProgression(
      [ready, archived],
      history('bench', 5, 100, 8),
    )
    expect(groups.ready.map((g) => g.exercise.id)).toEqual(['bench'])
    const allIds = [...groups.ready, ...groups.building, ...groups.stalled, ...groups.untracked].map(
      (g) => g.exercise.id,
    )
    expect(allIds).not.toContain('old')
  })

  it('puts an exercise with no logged sets in untracked', () => {
    const groups = groupProgression([exercise('new', 'Overhead Press')], [])
    expect(groups.untracked.map((g) => g.exercise.id)).toEqual(['new'])
  })
})
