import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { scheduleForDate } from './schedule'
import type { Phase, ScheduleOverride } from './types'

const phase = { schedule: [
  { dow: 1, gym: true, sessionType: 'upper', runKm: null, runType: null },
  { dow: 2, gym: false, sessionType: 'rest', runKm: null, runType: null },
] } as Phase
const change = (sourceDate: string, targetDate: string | null, action: ScheduleOverride['action']): ScheduleOverride => ({
  id: `${sourceDate}-${targetDate}`, sourceDate: asLocalDate(sourceDate),
  targetDate: targetDate ? asLocalDate(targetDate) : null, action, reason: null, createdAt: '2026-09-13T00:00:00Z',
})

describe('scheduleForDate', () => {
  it('removes skipped work from the compliance schedule', () => {
    expect(scheduleForDate(phase, asLocalDate('2026-09-14'), [change('2026-09-14', null, 'skip')])?.gym).toBe(false)
  })
  it('moves the source prescription to the target date', () => {
    const moved = change('2026-09-14', '2026-09-15', 'move')
    expect(scheduleForDate(phase, asLocalDate('2026-09-14'), [moved])?.gym).toBe(false)
    expect(scheduleForDate(phase, asLocalDate('2026-09-15'), [moved])?.sessionType).toBe('upper')
  })
  it('swaps the prescriptions for two dates', () => {
    const overrides = [change('2026-09-14', '2026-09-15', 'move'), change('2026-09-15', '2026-09-14', 'move')]
    expect(scheduleForDate(phase, asLocalDate('2026-09-14'), overrides)?.sessionType).toBe('rest')
    expect(scheduleForDate(phase, asLocalDate('2026-09-15'), overrides)?.sessionType).toBe('upper')
  })
})
