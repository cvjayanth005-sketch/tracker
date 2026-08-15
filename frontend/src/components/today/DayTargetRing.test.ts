import { describe, expect, it } from 'vitest'
import { defaultPhases } from '@/domain/seed'
import { d, makeLog } from '@/domain/testUtils'
import type { MetricKey } from '@/domain/compliance'
import type { Phase } from '@/domain/types'
import {
  arcStateForOutcome,
  targetCount,
  targetSegmentsForDay,
} from './dayTargetRingModel'

const METRICS: MetricKey[] = ['calories', 'protein', 'steps', 'run', 'gym', 'sleep', 'meals']
const phase = defaultPhases()[0] as Phase

describe('day target ring states', () => {
  it('keeps an unlogged target visually distinct from a logged miss', () => {
    expect(arcStateForOutcome('unknown')).toBe('ghost')
    expect(arcStateForOutcome('missed')).toBe('dim')
    expect(arcStateForOutcome('unknown')).not.toBe(arcStateForOutcome('missed'))
    expect(arcStateForOutcome('hit')).toBe('lit')
  })

  it('filters targets that are not scheduled on a rest day', () => {
    const sunday = d('2026-01-11')
    const segments = targetSegmentsForDay(METRICS, makeLog(sunday), phase, sunday)

    expect(segments.some((segment) => segment.metric === 'gym')).toBe(false)
    expect(segments.some((segment) => segment.metric === 'run')).toBe(true)
    expect(segments).toHaveLength(6)
  })

  it('counts only applicable hits', () => {
    const monday = d('2026-01-05')
    const segments = targetSegmentsForDay(
      METRICS,
      makeLog(monday, {
        calories: phase.calories,
        proteinG: phase.proteinG,
        steps: phase.steps,
        runKm: 0,
        gymDone: null,
        sleepHours: null,
        mealsOnPlan: phase.mealsPerDay,
      }),
      phase,
      monday,
    )

    expect(targetCount(segments)).toEqual({ hit: 4, applicable: 7 })
  })
})
