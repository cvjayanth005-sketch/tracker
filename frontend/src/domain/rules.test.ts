import { describe, expect, it } from 'vitest'
import { complianceFor } from './compliance'
import { addDays } from './date'
import {
  CUT_STEP_KCAL,
  RAISE_STEP_KCAL,
  RULES_VERSION,
  recommend,
  reviewPhase,
  type Recommendation,
} from './rules'
import { defaultPhases, defaultSettings } from './seed'
import { indexLogs } from './trend'
import { COMPLIANT, d, logsFromWeights, repeat } from './testUtils'
import type { DailyLog, Phase, Settings } from './types'

const START = '2026-01-05' // a Monday, so 7-day windows land on Mon..Sun

interface ScenarioOpts {
  extra?: Partial<DailyLog>
  phase?: Partial<Phase>
  settings?: Partial<Settings>
}

function scenario(weights: Array<number | null>, opts: ScenarioOpts = {}) {
  const phase: Phase = { ...(defaultPhases()[0] as Phase), ...opts.phase }
  const settings: Settings = { ...defaultSettings(), ...opts.settings }
  const logs = logsFromWeights(START, weights, opts.extra ?? COMPLIANT)
  const index = indexLogs(logs)
  const endDate = addDays(d(START), weights.length - 1)
  const compliance = complianceFor(index, endDate, phase)
  return {
    rec: recommend(index, endDate, phase, compliance, settings),
    review: reviewPhase(index, endDate, phase, settings),
    phase,
    settings,
  }
}

/** Two weeks: week one flat at `from`, week two flat at `to`. */
const twoWeeks = (from: number, to: number) => [...repeat(from, 7), ...repeat(to, 7)]

describe('gate 1 — data before decisions', () => {
  it('says nothing useful until two full windows exist', () => {
    const { rec } = scenario(repeat(88, 7))
    expect(rec.code).toBe('insufficient_data')
    expect(rec.proposedCalories).toBeNull()
  })

  it('does not average a window below the reading minimum', () => {
    const { rec } = scenario([88, null, null, 87.8, null, null, null])
    expect(rec.code).toBe('insufficient_data')
    expect(rec.evidence.trendWeightKg).toBeNull()
  })
})

describe('gate 2 — coverage before judgement', () => {
  it('asks for more logging rather than reading a sparse week', () => {
    // Weight logged every day, nothing else logged at all.
    const { rec } = scenario(twoWeeks(88, 87.9), { extra: {} })
    expect(rec.code).toBe('log_more')
    expect(rec.evidence.adherence).toBe('unknown')
    expect(rec.proposedCalories).toBeNull()
  })
})

describe('gate 3 — adherence before arithmetic', () => {
  const sloppy: Partial<DailyLog> = {
    ...COMPLIANT,
    calories: 2700,
    proteinG: 90,
    steps: 3000,
    mealsOnPlan: 1,
  }

  it('refuses to cut a plan that was never actually followed', () => {
    const { rec } = scenario(twoWeeks(88, 87.9), { extra: sloppy })
    expect(rec.code).toBe('fix_adherence')
    expect(rec.evidence.adherence).toBe('poor')
    expect(rec.proposedCalories).toBeNull()
  })

  it('outranks a confirmed plateau', () => {
    // Four flat weeks would otherwise be a textbook cut.
    const { rec } = scenario(repeat(88, 28), { extra: sloppy })
    expect(rec.code).toBe('fix_adherence')
  })

  it('does not interrupt a week that is losing on target', () => {
    // Imperfect logging is not a reason to intervene when the plan is working.
    const { rec } = scenario(twoWeeks(88, 87.4), { extra: sloppy })
    expect(rec.code).toBe('hold_in_band')
  })
})

describe('gate 4 — recovery veto', () => {
  it('blocks a cut when energy is on the floor', () => {
    const { rec } = scenario(repeat(88, 28), { extra: { ...COMPLIANT, energy: 1 } })
    expect(rec.code).toBe('recovery_first')
    expect(rec.evidence.recoveryConcern?.reason).toBe('low_energy')
    expect(rec.proposedCalories).toBeNull()
  })

  it('blocks a cut when sleep is short', () => {
    const { rec } = scenario(repeat(88, 28), {
      extra: { ...COMPLIANT, sleepHours: 5.5 },
    })
    expect(rec.code).toBe('recovery_first')
    expect(rec.evidence.recoveryConcern?.reason).toBe('short_sleep')
  })

  it('does not fire when loss is already on target', () => {
    const { rec } = scenario(twoWeeks(88, 87.4), { extra: { ...COMPLIANT, energy: 1 } })
    expect(rec.code).toBe('hold_in_band')
  })
})

describe('loss-rate partition', () => {
  it('adds calories back when loss is too fast', () => {
    const { rec } = scenario(twoWeeks(88, 86.8)) // 1.2 kg/week
    expect(rec.code).toBe('add_calories')
    expect(rec.deltaKcal).toBe(RAISE_STEP_KCAL)
    expect(rec.proposedCalories).toBe(2050 + RAISE_STEP_KCAL)
  })

  it('holds when slightly ahead of target but under the ceiling', () => {
    const { rec } = scenario(twoWeeks(88, 87.1)) // 0.9 kg/week
    expect(rec.code).toBe('hold_fast_edge')
    expect(rec.proposedCalories).toBeNull()
  })

  it('holds inside the target band', () => {
    expect(scenario(twoWeeks(88, 87.5)).rec.code).toBe('hold_in_band') // 0.5
    expect(scenario(twoWeeks(88, 87.4)).rec.code).toBe('hold_in_band') // 0.6
    expect(scenario(twoWeeks(88, 87.2)).rec.code).toBe('hold_in_band') // 0.8
  })

  it('covers the 0.3-0.5 gap explicitly instead of letting it fall through', () => {
    const { rec } = scenario(twoWeeks(88, 87.6)) // 0.4 kg/week
    expect(rec.code).toBe('hold_monitor')
    expect(rec.proposedCalories).toBeNull()
  })

  it('waits out a short stall rather than cutting on one flat week', () => {
    const { rec } = scenario(twoWeeks(88, 87.95)) // 0.05 kg/week, 1 week only
    expect(rec.code).toBe('hold_monitor')
    expect(rec.evidence.plateauWeeks).toBe(1)
  })

  it('cuts once a plateau is confirmed over the required weeks', () => {
    const { rec } = scenario(repeat(88, 28))
    expect(rec.code).toBe('cut_calories')
    expect(rec.evidence.plateauWeeks).toBe(3)
    expect(rec.deltaKcal).toBe(-CUT_STEP_KCAL)
    expect(rec.proposedCalories).toBe(2050 - CUT_STEP_KCAL)
  })

  it('flags a rising trend as a logging problem, not a metabolism problem', () => {
    const { rec } = scenario([
      ...repeat(87, 7),
      ...repeat(87.2, 7),
      ...repeat(87.4, 7),
      ...repeat(87.6, 7),
    ])
    expect(rec.code).toBe('gaining')
    expect(rec.evidence.lossKgPerWeek).toBeCloseTo(-0.2, 6)
  })

  it('leaves no loss rate without a decision', () => {
    // Sweep the whole plausible range; every value must produce a code.
    for (let delta = -1; delta <= 2.0001; delta += 0.05) {
      const { rec } = scenario(twoWeeks(88, 88 - delta))
      expect(rec.code).toBeTruthy()
      expect(rec.rulesVersion).toBe(RULES_VERSION)
    }
  })
})

describe('cut caps and the calorie floor', () => {
  it('stops cutting after the per-phase cap and switches to review', () => {
    const { rec } = scenario(repeat(88, 28), { phase: { calorieCutsApplied: 2 } })
    expect(rec.code).toBe('cut_capped')
    expect(rec.proposedCalories).toBeNull()
  })

  it('still allows the final cut at exactly one below the cap', () => {
    const { rec } = scenario(repeat(88, 28), { phase: { calorieCutsApplied: 1 } })
    expect(rec.code).toBe('cut_calories')
  })

  it('refuses to cut through the floor and suggests activity instead', () => {
    const { rec } = scenario(repeat(88, 28), {
      phase: { calories: 1800 },
      extra: { ...COMPLIANT, calories: 1800 },
    })
    expect(rec.code).toBe('floor_reached')
    expect(rec.proposedCalories).toBeNull()
    expect(rec.evidence.calorieFloor).toBe(1700)
  })

  it('never mutates the phase — a recommendation is only ever a proposal', () => {
    const { rec, phase } = scenario(repeat(88, 28))
    expect(rec.proposedCalories).toBe(1925)
    expect(phase.calories).toBe(2050)
    expect(phase.calorieCutsApplied).toBe(0)
  })
})

describe('reviewPhase', () => {
  it('reports remaining distance while still above target', () => {
    const { review } = scenario(twoWeeks(88, 87.4))
    expect(review.code).toBe('in_progress')
    expect(review.remainingKg).toBeCloseTo(3.4, 6)
    expect(review.daysHeld).toBe(0)
  })

  it('waits for the threshold to hold before offering the review', () => {
    // Trend dips under 84 for exactly 4 days — one short of the 5-day hold.
    const { review } = scenario([...repeat(85, 7), ...repeat(83, 7)])
    expect(review.code).toBe('approaching')
    expect(review.daysHeld).toBe(4)
    expect(review.daysRequired).toBe(5)
  })

  it('offers the review once the hold is satisfied', () => {
    const { review } = scenario([...repeat(85, 7), ...repeat(83, 8)])
    expect(review.code).toBe('ready_for_review')
    expect(review.daysHeld).toBeGreaterThanOrEqual(5)
  })

  it('never advances on a single light morning', () => {
    // Thirteen days at 85, one dry morning at 82.
    const { review } = scenario([...repeat(85, 13), 82])
    expect(review.code).not.toBe('ready_for_review')
    expect(review.daysHeld).toBe(0)
  })

  it('is unavailable rather than wrong when weigh-ins are missing', () => {
    const { review } = scenario([...repeat(83, 7), 83, null, null, null, null, null, null])
    expect(review.code).toBe('insufficient_data')
    expect(review.trendWeightKg).toBeNull()
  })
})

describe('evidence payload', () => {
  it('carries the numbers behind the decision so the UI can show its working', () => {
    const { rec }: { rec: Recommendation } = scenario(twoWeeks(88, 87.4))
    expect(rec.evidence.trendWeightKg).toBeCloseTo(87.4, 6)
    expect(rec.evidence.previousTrendWeightKg).toBeCloseTo(88, 6)
    expect(rec.evidence.weightReadings).toBe(7)
    expect(rec.evidence.overallHitRatePct).toBe(100)
    expect(rec.evidence.overallCoveragePct).toBe(100)
    expect(rec.evidence.currentCalories).toBe(2050)
  })
})
