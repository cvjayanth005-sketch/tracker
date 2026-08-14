import { describe, expect, it } from 'vitest'
import {
  bestEstimated1rm,
  evaluateProgression,
  sessionVolume,
  type SessionHistory,
} from './progression'
import { d } from './testUtils'
import type { Exercise, Workout, WorkoutSet } from './types'

const bench: Exercise = {
  id: 'ex-1',
  name: 'Barbell Bench Press',
  sessionType: 'upper',
  repRangeMin: 6,
  repRangeMax: 10,
  targetSets: 3,
  targetRir: 2,
  loadIncrementKg: 2.5,
  order: 0,
  archived: false,
}

let setCounter = 0
function set(partial: Partial<WorkoutSet> & { workoutId: string }): WorkoutSet {
  setCounter += 1
  return {
    id: `set-${setCounter}`,
    exerciseId: bench.id,
    setNumber: setCounter,
    weightKg: 60,
    reps: 10,
    rir: 1,
    isWarmup: false,
    createdAt: '2026-01-05T10:00:00.000Z',
    ...partial,
  }
}

function session(date: string, sets: Array<Partial<WorkoutSet>>): SessionHistory {
  const workout: Workout = {
    id: `w-${date}`,
    date: d(date),
    sessionType: 'upper',
    startedAt: null,
    finishedAt: null,
    notes: null,
    prescription: null,
  }
  return { workout, sets: sets.map((s) => set({ ...s, workoutId: workout.id })) }
}

describe('evaluateProgression', () => {
  it('gives starting instructions when there is no history', () => {
    const advice = evaluateProgression(bench, [])
    expect(advice.code).toBe('no_history')
    expect(advice.suggestedWeightKg).toBeNull()
  })

  it('adds load once every working set tops the range at target RIR', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 2 },
        { weightKg: 60, reps: 10, rir: 2 },
      ]),
    ])
    expect(advice.code).toBe('ready_to_increase')
    expect(advice.suggestedWeightKg).toBe(62.5)
    expect(advice.suggestedRepTarget).toBe(bench.repRangeMin)
  })

  it('holds load while any set is short of the top of the range', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 9, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
      ]),
    ])
    expect(advice.code).toBe('keep_building')
    expect(advice.suggestedWeightKg).toBe(60)
  })

  it('will not progress on unproven RIR', () => {
    // Reps are there, but nothing says the sets were actually hard.
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: null },
        { weightKg: 60, reps: 10, rir: null },
        { weightKg: 60, reps: 10, rir: null },
      ]),
    ])
    expect(advice.code).toBe('keep_building')
  })

  it('will not progress on too-easy sets', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 4 },
        { weightKg: 60, reps: 10, rir: 4 },
        { weightKg: 60, reps: 10, rir: 4 },
      ]),
    ])
    expect(advice.code).toBe('keep_building')
  })

  it('will not progress on fewer sets than the target', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
      ]),
    ])
    expect(advice.code).toBe('keep_building')
  })

  it('refuses to judge a partly unlogged session', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: null, rir: null },
        { weightKg: 60, reps: 10, rir: 1 },
      ]),
    ])
    expect(advice.code).toBe('incomplete_data')
    expect(advice.suggestedWeightKg).toBe(60)
  })

  it('suggests a deload when every set falls under the range', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 5, rir: 0 },
        { weightKg: 60, reps: 4, rir: 0 },
        { weightKg: 60, reps: 4, rir: 0 },
      ]),
    ])
    expect(advice.code).toBe('consider_deload')
    // 90% of 60 kg, rounded to the 2.5 kg increment.
    expect(advice.suggestedWeightKg).toBe(55)
  })

  it('ignores warm-up sets entirely', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 20, reps: 15, rir: 5, isWarmup: true },
        { weightKg: 40, reps: 12, rir: 5, isWarmup: true },
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 2 },
      ]),
    ])
    expect(advice.code).toBe('ready_to_increase')
    expect(advice.lastWorkingWeightKg).toBe(60)
  })

  it('reads the most recent session, not the first one found', () => {
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
      ]),
      session('2026-01-12', [
        { weightKg: 62.5, reps: 7, rir: 1 },
        { weightKg: 62.5, reps: 7, rir: 1 },
        { weightKg: 62.5, reps: 6, rir: 0 },
      ]),
    ])
    expect(advice.lastSessionDate).toBe('2026-01-12')
    expect(advice.code).toBe('keep_building')
    expect(advice.suggestedWeightKg).toBe(62.5)
  })

  it('ignores sessions that did not include this exercise', () => {
    const other = session('2026-01-19', [{ weightKg: 100, reps: 5, rir: 1 }])
    other.sets = other.sets.map((s) => ({ ...s, exerciseId: 'ex-other' }))
    const advice = evaluateProgression(bench, [
      session('2026-01-05', [
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
        { weightKg: 60, reps: 10, rir: 1 },
      ]),
      other,
    ])
    expect(advice.lastSessionDate).toBe('2026-01-05')
    expect(advice.code).toBe('ready_to_increase')
  })
})

describe('session aggregates', () => {
  const sets = session('2026-01-05', [
    { weightKg: 20, reps: 15, isWarmup: true },
    { weightKg: 60, reps: 10 },
    { weightKg: 60, reps: 8 },
    { weightKg: 60, reps: null },
  ]).sets

  it('counts volume from complete working sets only', () => {
    expect(sessionVolume(sets)).toBe(60 * 10 + 60 * 8)
  })

  it('estimates 1RM from the best working set', () => {
    expect(bestEstimated1rm(sets)).toBeCloseTo(60 * (1 + 10 / 30), 6)
  })

  it('returns null when there is nothing complete to estimate from', () => {
    expect(bestEstimated1rm([])).toBeNull()
  })
})
