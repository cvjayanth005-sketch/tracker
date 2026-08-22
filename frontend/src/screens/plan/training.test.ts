import { describe, expect, it } from 'vitest'
import { describeSchedule } from './training'
import type { DaySchedule } from '@/domain/types'

function day(over: Partial<DaySchedule> & { dow: number }): DaySchedule {
  return {
    gym: false,
    sessionType: 'rest',
    runKm: null,
    runType: null,
    ...over,
  } as DaySchedule
}

describe('describeSchedule', () => {
  it('counts gym, run, and rest days without double-counting a combined day', () => {
    const schedule = [
      day({ dow: 1, gym: true, sessionType: 'upper' }),
      // Both lifting and running on one day: one gym day, one run day, no rest.
      day({ dow: 2, gym: true, sessionType: 'lower', runKm: 5, runType: 'easy' }),
      day({ dow: 3 }),
    ]
    const s = describeSchedule(schedule)
    expect(s.gymDays).toBe(2)
    expect(s.runDays).toBe(1)
    expect(s.restDays).toBe(1)
  })

  it('sums weekly running distance', () => {
    const s = describeSchedule([
      day({ dow: 1, runKm: 5, runType: 'easy' }),
      day({ dow: 3, runKm: 7.5, runType: 'easy' }),
    ])
    expect(s.weeklyRunKm).toBe('12.5')
  })

  it('drops the decimal on a whole-number distance', () => {
    const s = describeSchedule([day({ dow: 1, runKm: 5, runType: 'easy' })])
    expect(s.weeklyRunKm).toBe('5')
  })

  it('names the alternating shape when upper and lower both appear', () => {
    const s = describeSchedule([
      day({ dow: 1, gym: true, sessionType: 'upper' }),
      day({ dow: 3, gym: true, sessionType: 'lower' }),
    ])
    expect(s.rationale).toMatch(/alternating upper and lower/)
  })

  it('says so plainly when no strength work is scheduled', () => {
    const s = describeSchedule([day({ dow: 1 }), day({ dow: 2 })])
    expect(s.gymDays).toBe(0)
    expect(s.rationale).toMatch(/No strength sessions/)
  })

  it('omits the running sentence when nothing is scheduled', () => {
    const s = describeSchedule([day({ dow: 1, gym: true, sessionType: 'upper' })])
    expect(s.rationale).not.toMatch(/Running/)
  })
})
