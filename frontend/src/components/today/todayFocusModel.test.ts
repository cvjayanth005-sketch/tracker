import { describe, expect, it } from 'vitest'
import { defaultPhases } from '@/domain/seed'
import { d, makeLog } from '@/domain/testUtils'
import type { DaySchedule, Phase } from '@/domain/types'
import type { DayTargetSegment } from './dayTargetRingModel'
import { attentionMetricsForToday, buildTodayFocus } from './todayFocusModel'

const phase = defaultPhases()[0] as Phase
const gymDay: DaySchedule = {
  dow: 1,
  gym: true,
  sessionType: 'upper',
  runKm: 5,
  runType: 'easy',
}

function segments(
  outcomes: Partial<Record<DayTargetSegment['metric'], DayTargetSegment['outcome']>>,
): DayTargetSegment[] {
  return Object.entries(outcomes).map(([metric, outcome]) => ({
    metric: metric as DayTargetSegment['metric'],
    outcome: outcome as DayTargetSegment['outcome'],
  }))
}

describe('today focus', () => {
  it('keeps scheduled strength work ahead of other open targets', () => {
    const focus = buildTodayFocus(
      phase,
      gymDay,
      makeLog(d('2026-01-05')),
      segments({ gym: 'unknown', run: 'unknown', steps: 'unknown', protein: 'unknown' }),
    )

    expect(focus.title).toBe('Complete your upper session')
    expect(focus.action).toEqual({ kind: 'workout' })
  })

  it('turns a known step gap into a concrete walking recommendation', () => {
    const focus = buildTodayFocus(
      phase,
      { ...gymDay, gym: false, runKm: null, runType: null },
      makeLog(d('2026-01-05'), { steps: phase.steps - 2_400 }),
      segments({ steps: 'missed', protein: 'hit', calories: 'hit', meals: 'hit' }),
    )

    expect(focus.title).toBe('2,400 steps to go')
    expect(focus.detail).toContain('24 minutes')
    expect(focus.action).toEqual({ kind: 'metric', metric: 'steps' })
  })

  it('presents calories as a range after higher-priority targets are handled', () => {
    const focus = buildTodayFocus(
      phase,
      { ...gymDay, gym: false, runKm: null, runType: null },
      makeLog(d('2026-01-05'), { calories: null }),
      segments({ steps: 'hit', protein: 'hit', calories: 'unknown', meals: 'hit', sleep: 'unknown' }),
    )

    expect(focus.title).toContain('-')
    expect(focus.title).toContain('kcal')
    expect(focus.action).toEqual({ kind: 'metric', metric: 'calories' })
  })

  it('keeps the supporting list short and excludes sleep and the primary metric', () => {
    const focus = buildTodayFocus(
      phase,
      { ...gymDay, gym: false, runKm: null, runType: null },
      makeLog(d('2026-01-05')),
      segments({ steps: 'unknown', sleep: 'unknown', protein: 'unknown', calories: 'unknown', meals: 'unknown' }),
    )

    expect(attentionMetricsForToday(
      segments({ steps: 'unknown', sleep: 'unknown', protein: 'unknown', calories: 'unknown', meals: 'unknown' }),
      focus,
    )).toEqual(['protein', 'calories', 'meals'])
  })
})
