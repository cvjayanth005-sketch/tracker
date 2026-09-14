import { describe, expect, it } from 'vitest'
import { bestNextAction } from './bestNextAction'
import { asLocalDate } from './date'
import type { DailyLog, DaySchedule, Phase } from './types'

const date = asLocalDate('2026-09-14')
const phase = { sleepHours: 8, proteinG: 120, steps: 8000 } as Phase
const gym = { gym: true, sessionType: 'upper', runKm: null } as DaySchedule
const log = (patch: Partial<DailyLog>) => ({ sleepHours: 8, ...patch }) as DailyLog
describe('best next action', () => {
  it('asks for missing sleep rather than treating it as poor sleep', () => {
    expect(bestNextAction(phase, gym, undefined, date).id).toBe('sleep')
  })
  it('puts readiness review ahead of scheduled training when soreness is high', () => {
    expect(bestNextAction(phase, gym, log({ soreness: 4 }), date).id).toBe('readiness')
  })
  it('offers the scheduled session without assuming recovery is good', () => {
    expect(bestNextAction(phase, gym, log({}), date).id).toBe('workout')
  })
  it('does not ask to restart a completed or explicitly skipped gym session', () => {
    for (const gymDone of [true, false]) expect(bestNextAction(phase, gym, log({ gymDone }), date).id).toBe('food')
  })
  it('uses the resolved rest schedule and respects a finished food log', () => {
    expect(bestNextAction(phase, undefined, log({ foodComplete: true }), date).id).toBe('steps')
  })
  it('distinguishes unlogged water from an explicit zero', () => {
    const done = { foodComplete: true, steps: 8000 }
    expect(bestNextAction(phase, undefined, log(done), date).id).toBe('water')
    expect(bestNextAction(phase, undefined, log({ ...done, waterMl: 0 }), date).id).toBe('review')
  })
})
