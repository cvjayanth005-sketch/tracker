import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { buildFoodContext } from './foodContext'
import { defaultPhases } from './seed'
import { calculateSleepScore } from './sleep'
import { makeLog } from './testUtils'
import { buildTodayTips, type TipInputs } from './todayTips'
import type { DailyLog, Phase } from './types'

const TODAY = asLocalDate('2026-08-15')

function phase(overrides: Partial<Phase> = {}): Phase {
  return { ...defaultPhases()[0]!, calories: 2000, proteinG: 180, steps: 10000, sleepHours: 8, ...overrides }
}

/** Builds the full input bundle from a single day's log, so tests stay short. */
function inputs(log: Partial<DailyLog>, nowMinutes: number, overrides: Partial<TipInputs> = {}): TipInputs {
  const p = overrides.phase ?? phase()
  const today = makeLog('2026-08-15', log)
  return {
    food: buildFoodContext(TODAY, p, undefined, [today], []),
    log: today,
    phase: p,
    sleep: calculateSleepScore(today, p.sleepHours, [today]),
    schedule: undefined,
    nowMinutes,
    runKmToday: null,
    ...overrides,
  }
}

const ids = (tips: ReturnType<typeof buildTodayTips>) => tips.map((tip) => tip.id)

describe('buildTodayTips', () => {
  it('asks for the missing protein while there is still time to eat it', () => {
    const tips = buildTodayTips(inputs({ calories: 1200, proteinG: 90, weightKg: 82 }, 15 * 60))
    const protein = tips.find((tip) => tip.id === 'protein-left')
    expect(protein).toBeDefined()
    // 180 target − 90 logged, surfaced as something to actually eat.
    expect(protein?.title).toContain('90g')
    expect(protein?.detail).toMatch(/whey|chicken|egg/)
  })

  it('drops the protein nudge once the day is effectively over', () => {
    const tips = buildTodayTips(inputs({ calories: 1200, proteinG: 90, weightKg: 82 }, 22 * 60))
    expect(ids(tips)).not.toContain('protein-left')
  })

  it('softens the over-target message in the evening instead of urging a cut', () => {
    const early = buildTodayTips(inputs({ calories: 2600, weightKg: 82 }, 12 * 60))
    const late = buildTodayTips(inputs({ calories: 2600, weightKg: 82 }, 20 * 60))
    expect(early.find((t) => t.id === 'calories-over')?.detail).toMatch(/Still early/)
    expect(late.find((t) => t.id === 'calories-over')?.detail).toMatch(/tomorrow/)
  })

  it('flags a short night as a reason to train easier, not as a failure', () => {
    const tips = buildTodayTips(inputs({ sleepHours: 5, weightKg: 82 }, 9 * 60))
    const sleep = tips.find((tip) => tip.id === 'sleep-debt')
    expect(sleep?.tone).toBe('watch')
    expect(sleep?.title).toBe('Keep today easy')
  })

  it('only chases water while there is still time to drink it', () => {
    const afternoon = buildTodayTips(inputs({ waterMl: 300, weightKg: 82 }, 16 * 60))
    const night = buildTodayTips(inputs({ waterMl: 300, weightKg: 82 }, 22 * 60))
    expect(ids(afternoon)).toContain('water-behind')
    expect(ids(night)).not.toContain('water-behind')
  })

  it('stops nagging for a weigh-in after the morning has passed', () => {
    expect(ids(buildTodayTips(inputs({}, 9 * 60)))).toContain('weigh-in')
    expect(ids(buildTodayTips(inputs({}, 19 * 60)))).not.toContain('weigh-in')
  })

  it('surfaces an unlogged scheduled session', () => {
    const tips = buildTodayTips(
      inputs({ weightKg: 82 }, 14 * 60, {
        schedule: { dow: 6, gym: true, sessionType: 'upper', runKm: null, runType: null },
      }),
    )
    expect(ids(tips)).toContain('gym-pending')
  })

  it('says the day is on plan rather than inventing a chore', () => {
    const tips = buildTodayTips(
      inputs(
        {
          weightKg: 82,
          calories: 1950,
          proteinG: 178,
          steps: 10500,
          sleepHours: 8,
          waterMl: 3000,
        },
        20 * 60,
      ),
    )
    expect(ids(tips)).toEqual(['on-track'])
    expect(tips[0]?.tone).toBe('good')
  })
})
