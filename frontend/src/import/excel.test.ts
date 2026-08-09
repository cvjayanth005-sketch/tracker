import { describe, expect, it } from 'vitest'
import { rowsToDailyLogs } from './excel'

describe('Excel history import', () => {
  it('maps dated facts and keeps unchecked template cells unknown', () => {
    const result = rowsToDailyLogs([
      ['Day', 'Date', 'Weight', 'Calories \u2713', 'Protein \u2713', 'Steps \u2713', 'Run \u2713', 'Gym \u2713', 'Breakfast \u2713', 'Lunch \u2713', 'Post-workout \u2713', 'Dinner \u2713', 'Sleep 8h \u2713', 'Notes'],
      ['Mon', '2026-08-03', 88.2, '\u2610', '\u2610', '\u2610', '\u2610', '\u2610', '\u2610', '\u2610', '\u2610', '\u2610', '\u2610', 'Start'],
      ['Tue', '2026-08-04', 87.9, 2040, 166, 11200, 2, '\u2611', '\u2611', '\u2611', '\u2611', '\u2611', '\u2611', 'Good day'],
    ])

    expect(result.logs).toHaveLength(2)
    expect(result.logs[0]?.calories).toBeNull()
    expect(result.logs[0]?.gymDone).toBeNull()
    expect(result.logs[0]?.mealsOnPlan).toBeNull()
    expect(result.logs[1]).toMatchObject({
      calories: 2040,
      proteinG: 166,
      steps: 11200,
      runKm: 2,
      gymDone: true,
      mealsOnPlan: 4,
      sleepHours: 8,
    })
  })

  it('ignores structural rows without dates', () => {
    const result = rowsToDailyLogs([
      ['Day', 'Date', 'Weight'],
      ['Week 1', null, null],
      ['Mon', null, null],
    ])
    expect(result.logs).toEqual([])
    expect(result.ignoredRows).toBe(2)
  })
})
