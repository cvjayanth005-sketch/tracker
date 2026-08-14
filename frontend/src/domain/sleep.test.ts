import { describe, expect, it } from 'vitest'
import { calculateSleepScore } from './sleep'
import { makeLog } from './testUtils'

describe('calculateSleepScore', () => {
  it('uses duration and quality as the required base signal', () => {
    const result = calculateSleepScore(
      makeLog('2026-01-08', { sleepHours: 8, sleepQuality: 5 }),
      8,
      [],
    )
    expect(result).toMatchObject({ score: 100, confidence: 'low', label: 'Restorative' })
  })

  it('does not invent a score without duration and quality', () => {
    expect(calculateSleepScore(makeLog('2026-01-08', { sleepHours: 8 }), 8, [])).toMatchObject({
      score: null,
      confidence: 'none',
      label: 'Needs check-in',
    })
  })

  it('reweights optional signals and raises confidence when they are logged', () => {
    const withAwakenings = calculateSleepScore(
      makeLog('2026-01-08', { sleepHours: 8, sleepQuality: 5, nightAwakenings: 2 }),
      8,
      [],
    )
    expect(withAwakenings).toMatchObject({ score: 94, confidence: 'medium', awakeningsScore: 50 })
  })

  it('uses circular time calculations when bedtime crosses midnight', () => {
    const history = [
      makeLog('2026-01-01', { sleepBedtime: '23:50', sleepWakeTime: '07:30' }),
      makeLog('2026-01-02', { sleepBedtime: '00:05', sleepWakeTime: '07:35' }),
      makeLog('2026-01-03', { sleepBedtime: '23:55', sleepWakeTime: '07:25' }),
    ]
    const result = calculateSleepScore(
      makeLog('2026-01-04', {
        sleepHours: 8,
        sleepQuality: 4,
        sleepBedtime: '00:10',
        sleepWakeTime: '07:35',
        nightAwakenings: 0,
      }),
      8,
      history,
    )
    expect(result.consistencyScore).toBeGreaterThan(90)
    expect(result.confidence).toBe('high')
  })

  it('uses only the most recent seven prior timing records', () => {
    const history = [
      makeLog('2026-01-01', { sleepBedtime: '18:00', sleepWakeTime: '03:00' }),
      ...Array.from({ length: 7 }, (_, index) =>
        makeLog(`2026-01-${String(index + 2).padStart(2, '0')}`, {
          sleepBedtime: '23:30',
          sleepWakeTime: '07:30',
        }),
      ),
    ]
    const result = calculateSleepScore(
      makeLog('2026-01-09', {
        sleepHours: 8,
        sleepQuality: 4,
        sleepBedtime: '23:30',
        sleepWakeTime: '07:30',
      }),
      8,
      history,
    )
    expect(result.consistencyScore).toBe(100)
  })
})
