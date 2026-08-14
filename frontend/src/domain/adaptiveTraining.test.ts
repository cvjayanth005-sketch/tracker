import { describe, expect, it } from 'vitest'
import { buildAdaptiveSession, calculateReadiness } from './adaptiveTraining'
import { makeLog } from './testUtils'
import type { Exercise } from './types'

const exercise = (id: string, order: number): Exercise => ({
  id,
  name: `Exercise ${id}`,
  sessionType: 'upper',
  repRangeMin: 6,
  repRangeMax: 10,
  targetSets: 4,
  targetRir: 2,
  loadIncrementKg: 2.5,
  order,
  archived: false,
})

describe('calculateReadiness', () => {
  it('reports insufficient data without inventing a score', () => {
    expect(calculateReadiness(undefined, 8)).toMatchObject({
      score: null,
      band: 'insufficient',
      confidence: 'low',
    })
  })

  it('reduces readiness for poor sleep, low energy, soreness, and stress', () => {
    const result = calculateReadiness(
      makeLog('2026-01-05', { sleepHours: 5, energy: 2, soreness: 5, stress: 5 }),
      8,
    )
    expect(result.band).toBe('reduce')
    expect(result.confidence).toBe('high')
    expect(result.score).toBeLessThan(50)
  })

  it('does not call one positive signal ready', () => {
    const result = calculateReadiness(makeLog('2026-01-05', { energy: 5 }), 8)
    expect(result.score).toBe(100)
    expect(result.confidence).toBe('low')
    expect(result.band).toBe('steady')
  })
})

describe('buildAdaptiveSession', () => {
  it('caps exercise count to the time available', () => {
    const prescription = buildAdaptiveSession({
      sessionType: 'upper',
      targetSleepHours: 8,
      log: makeLog('2026-01-05', {
        sleepHours: 8,
        energy: 5,
        soreness: 1,
        stress: 1,
        trainingMinutesAvailable: 30,
      }),
      exercises: [exercise('1', 1), exercise('2', 2), exercise('3', 3), exercise('4', 4)],
      history: [],
      now: '2026-01-05T08:00:00.000Z',
    })
    expect(prescription.exercises).toHaveLength(3)
    expect(prescription.readinessBand).toBe('ready')
  })

  it('reduces sets and raises RIR when readiness is low', () => {
    const prescription = buildAdaptiveSession({
      sessionType: 'upper',
      targetSleepHours: 8,
      log: makeLog('2026-01-05', { sleepHours: 4, energy: 1, soreness: 5, stress: 5 }),
      exercises: [exercise('1', 1)],
      history: [],
      now: '2026-01-05T08:00:00.000Z',
    })
    expect(prescription.readinessBand).toBe('reduce')
    expect(prescription.exercises[0]).toMatchObject({ targetSets: 2, targetRir: 4 })
  })
})
