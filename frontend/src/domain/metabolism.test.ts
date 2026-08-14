import { describe, expect, it } from 'vitest'
import { estimateTdee, targetVsMaintenance } from './metabolism'
import { addDays, asLocalDate } from './date'
import { makeLog } from './testUtils'

const TODAY = asLocalDate('2026-08-15')

/** 14 days ending today, each with the given intake and a steady weight slope. */
function steadyLogs(intake: number, startWeight: number, kgPerDay: number) {
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(TODAY, -(13 - i))
    return makeLog(date, { calories: intake, weightKg: Math.round((startWeight + kgPerDay * i) * 100) / 100 })
  })
}

describe('estimateTdee', () => {
  it('recovers maintenance from intake and a losing weight trend', () => {
    // 2000 kcal/day while losing 0.05 kg/day => TDEE ≈ 2000 + 0.05*7700 = 2385.
    const result = estimateTdee(TODAY, steadyLogs(2000, 90, -0.05))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.estimate.tdeeKcal).toBe(2385)
    expect(result.estimate.confidence).toBe('high')
    expect(result.estimate.weightChangePerWeekKg).toBeCloseTo(-0.35, 2)
    expect(result.estimate.lowKcal).toBeLessThan(2385)
    expect(result.estimate.highKcal).toBeGreaterThan(2385)
  })

  it('holds maintenance equal to intake when weight is flat', () => {
    const result = estimateTdee(TODAY, steadyLogs(2200, 85, 0))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.estimate.tdeeKcal).toBe(2200)
  })

  it('refuses to estimate without enough weigh-ins', () => {
    const logs = [
      makeLog(addDays(TODAY, -1), { calories: 2000, weightKg: 90 }),
      makeLog(TODAY, { calories: 2000, weightKg: 89.9 }),
    ]
    const result = estimateTdee(TODAY, logs)
    expect(result.status).toBe('insufficient')
  })

  it('drops confidence when the weight swing is too fast to be fat', () => {
    // 0.3 kg/day loss is water, not fat — the estimate must not read as trustworthy.
    const result = estimateTdee(TODAY, steadyLogs(2000, 95, -0.3))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.estimate.confidence).toBe('low')
  })

  it('translates a target into an implied weekly change', () => {
    const { dailyDeltaKcal, weeklyChangeKg } = targetVsMaintenance(2000, 2385)
    expect(dailyDeltaKcal).toBe(-385)
    expect(weeklyChangeKg).toBeCloseTo(-0.35, 2)
  })
})
