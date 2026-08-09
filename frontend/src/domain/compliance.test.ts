import { describe, expect, it } from 'vitest'
import { adherence, complianceFor, outcomeFor, weakestMetrics } from './compliance'
import { addDays } from './date'
import { defaultPhases } from './seed'
import { indexLogs } from './trend'
import { COMPLIANT, d, logsFromWeights, makeLog, repeat } from './testUtils'
import type { Phase } from './types'

const phase = defaultPhases()[0] as Phase
// 2026-01-05 is a Monday, so a window ending 2026-01-11 is exactly Mon..Sun.
const MONDAY = '2026-01-05'
const SUNDAY = d('2026-01-11')

describe('outcomeFor — the four buckets are disjoint', () => {
  it('separates not-scheduled from missed for the gym', () => {
    // Sunday is a run day in the seeded plan: no gym scheduled.
    expect(outcomeFor('gym', makeLog('2026-01-11', { gymDone: false }), phase, SUNDAY)).toBe(
      'notScheduled',
    )
    // Monday is scheduled, so a confirmed no-show is a miss...
    expect(
      outcomeFor('gym', makeLog('2026-01-05', { gymDone: false }), phase, d(MONDAY)),
    ).toBe('missed')
    // ...but an unlogged Monday is unknown, not a miss.
    expect(outcomeFor('gym', makeLog('2026-01-05', {}), phase, d(MONDAY))).toBe('unknown')
    expect(outcomeFor('gym', undefined, phase, d(MONDAY))).toBe('unknown')
  })

  it('treats a logged zero as a real value, not as unknown', () => {
    expect(outcomeFor('steps', makeLog('2026-01-05', { steps: 0 }), phase, d(MONDAY))).toBe(
      'missed',
    )
    expect(outcomeFor('steps', makeLog('2026-01-05', {}), phase, d(MONDAY))).toBe('unknown')
  })

  it('scores calories as a band, so a crash day is not compliance', () => {
    expect(outcomeFor('calories', makeLog('2026-01-05', { calories: 2050 }), phase, d(MONDAY))).toBe('hit')
    expect(outcomeFor('calories', makeLog('2026-01-05', { calories: 2150 }), phase, d(MONDAY))).toBe('hit')
    expect(outcomeFor('calories', makeLog('2026-01-05', { calories: 2400 }), phase, d(MONDAY))).toBe('missed')
    // 1200 kcal is not a well-executed 2050 kcal day.
    expect(outcomeFor('calories', makeLog('2026-01-05', { calories: 1200 }), phase, d(MONDAY))).toBe('missed')
  })

  it('scales the run target to what the day actually scheduled', () => {
    // Monday plans 2 km, Sunday plans 5 km. The same 3 km run passes one and
    // fails the other.
    expect(outcomeFor('run', makeLog('2026-01-05', { runKm: 3 }), phase, d(MONDAY))).toBe('hit')
    expect(outcomeFor('run', makeLog('2026-01-11', { runKm: 3 }), phase, SUNDAY)).toBe('missed')
  })
})

describe('complianceFor', () => {
  it('scores a fully compliant week at 100% with full coverage', () => {
    const index = indexLogs(logsFromWeights(MONDAY, repeat(88, 7), COMPLIANT))
    const report = complianceFor(index, SUNDAY, phase)
    expect(report.overallHitRatePct).toBe(100)
    expect(report.overallCoveragePct).toBe(100)
    expect(report.metrics.gym.eligibleDays).toBe(4) // Mon, Tue, Thu, Fri
    expect(report.metrics.gym.notScheduledDays).toBe(3)
    expect(report.metrics.run.eligibleDays).toBe(7)
  })

  it('keeps hit rate and coverage separate', () => {
    // Two perfect days, five unlogged ones. A single "compliance %" would call
    // this a 100% week; it is a 100% hit rate on 29% coverage.
    const logs = [
      makeLog('2026-01-05', COMPLIANT),
      makeLog('2026-01-06', COMPLIANT),
      ...[2, 3, 4, 5, 6].map((i) => makeLog(addDays(d(MONDAY), i))),
    ]
    const report = complianceFor(indexLogs(logs), SUNDAY, phase)
    expect(report.overallHitRatePct).toBe(100)
    expect(report.overallCoveragePct).toBeLessThan(50)
    expect(report.metrics.calories.knownDays).toBe(2)
    expect(report.metrics.calories.unknownDays).toBe(5)
    expect(report.metrics.calories.eligibleDays).toBe(7)
  })

  it('excludes not-scheduled days from the denominator', () => {
    const index = indexLogs(logsFromWeights(MONDAY, repeat(88, 7), COMPLIANT))
    const gym = complianceFor(index, SUNDAY, phase).metrics.gym
    expect(gym.eligibleDays + gym.notScheduledDays).toBe(7)
    expect(gym.hitDays).toBe(4)
    expect(gym.hitRatePct).toBe(100)
  })
})

describe('adherence gate', () => {
  const goodPct = 80

  it('returns good for a well-logged, on-plan week', () => {
    const index = indexLogs(logsFromWeights(MONDAY, repeat(88, 7), COMPLIANT))
    expect(adherence(complianceFor(index, SUNDAY, phase), goodPct)).toBe('good')
  })

  it('returns unknown — never good — when coverage is too thin to judge', () => {
    const logs = [makeLog('2026-01-05', COMPLIANT), makeLog('2026-01-06', COMPLIANT)]
    expect(adherence(complianceFor(indexLogs(logs), SUNDAY, phase), goodPct)).toBe('unknown')
  })

  it('returns unknown when nothing at all was logged', () => {
    const index = indexLogs(logsFromWeights(MONDAY, repeat(88, 7)))
    expect(adherence(complianceFor(index, SUNDAY, phase), goodPct)).toBe('unknown')
  })

  it('returns poor for a well-logged week that missed targets', () => {
    const index = indexLogs(
      logsFromWeights(MONDAY, repeat(88, 7), {
        ...COMPLIANT,
        calories: 2700,
        proteinG: 90,
        steps: 3000,
        mealsOnPlan: 1,
      }),
    )
    const report = complianceFor(index, SUNDAY, phase)
    expect(adherence(report, goodPct)).toBe('poor')
    // The cue surfaces the metrics actually dragging the week down.
    expect(weakestMetrics(report).every((m) => m.hitRatePct === 0)).toBe(true)
  })
})
