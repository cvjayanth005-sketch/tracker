import { describe, expect, it } from 'vitest'
import type { PhaseReview, Recommendation } from '@/domain/rules'
import {
  expectedPaceCopy,
  isActionableCalorieRecommendation,
  presentNextDecision,
  roadmapStatus,
  shouldApplyCalorieChange,
  snapshotRemainingKg,
} from './decision'

function rec(partial: Partial<Recommendation> & Pick<Recommendation, 'code' | 'severity'>): Recommendation {
  return {
    headline: partial.headline ?? partial.code,
    detail: partial.detail ?? '',
    proposedCalories: partial.proposedCalories ?? null,
    deltaKcal: partial.deltaKcal ?? null,
    evidence: {
      lossKgPerWeek: null,
      trendWeightKg: null,
      previousTrendWeightKg: null,
      weightReadings: 0,
      plateauWeeks: 0,
      adherence: 'unknown',
      overallHitRatePct: null,
      overallCoveragePct: 0,
      cutsAppliedThisPhase: 0,
      maxCutsPerPhase: 2,
      currentCalories: 2200,
      calorieFloor: 1700,
      recoveryConcern: null,
    },
    rulesVersion: '1.1.0',
    ...partial,
  }
}

function review(partial: Partial<PhaseReview> & Pick<PhaseReview, 'code'>): PhaseReview {
  return {
    headline: partial.headline ?? partial.code,
    detail: partial.detail ?? '',
    trendWeightKg: partial.trendWeightKg ?? null,
    targetWeightKg: partial.targetWeightKg ?? 80,
    daysHeld: partial.daysHeld ?? 0,
    daysRequired: partial.daysRequired ?? 5,
    remainingKg: partial.remainingKg ?? null,
    ...partial,
  }
}

describe('isActionableCalorieRecommendation', () => {
  it('allows Apply only for action + proposed calories', () => {
    expect(
      isActionableCalorieRecommendation(
        rec({ code: 'cut_calories', severity: 'action', proposedCalories: 2100, deltaKcal: -125 }),
      ),
    ).toBe(true)
    expect(shouldApplyCalorieChange(rec({ code: 'cut_calories', severity: 'action', proposedCalories: 2100 }))).toBe(
      true,
    )
  })

  it('never treats cut_capped or floor_reached as Apply', () => {
    expect(isActionableCalorieRecommendation(rec({ code: 'cut_capped', severity: 'warn' }))).toBe(false)
    expect(isActionableCalorieRecommendation(rec({ code: 'floor_reached', severity: 'warn' }))).toBe(false)
    expect(shouldApplyCalorieChange(rec({ code: 'add_calories', severity: 'warn', proposedCalories: 2300 }))).toBe(
      false,
    )
  })

  it('keeps action-without-calories informational', () => {
    expect(isActionableCalorieRecommendation(rec({ code: 'fix_adherence', severity: 'action' }))).toBe(false)
  })
})

describe('presentNextDecision', () => {
  it('prioritizes an actionable rec and shows review readiness as secondary', () => {
    const view = presentNextDecision(
      rec({ code: 'cut_calories', severity: 'action', proposedCalories: 2000 }),
      review({ code: 'ready_for_review', daysHeld: 5, daysRequired: 5, remainingKg: 0, trendWeightKg: 80 }),
    )
    expect(view).toEqual({
      kind: 'actionable',
      showReviewSecondary: true,
      showWarnCallout: false,
      showHoldMeter: false,
    })
  })

  it('keeps warnings informational even when calories are proposed', () => {
    const view = presentNextDecision(
      rec({ code: 'floor_reached', severity: 'warn', proposedCalories: null }),
      review({ code: 'in_progress', remainingKg: 4, trendWeightKg: 84 }),
    )
    expect(view.kind).toBe('informational')
    expect(view.showWarnCallout).toBe(true)
  })

  it('explains missing trend without inventing remaining weight', () => {
    const view = presentNextDecision(
      rec({ code: 'insufficient_data', severity: 'info' }),
      review({ code: 'insufficient_data', remainingKg: null, trendWeightKg: null }),
    )
    expect(view.kind).toBe('informational')
    expect(snapshotRemainingKg(null, null)).toBeNull()
    expect(snapshotRemainingKg(Number.NaN, 80)).toBeNull()
  })
})

describe('snapshotRemainingKg', () => {
  it('returns the review remaining value when present', () => {
    expect(snapshotRemainingKg(1.2, 81.2)).toBe(1.2)
    expect(snapshotRemainingKg(0, 72)).toBe(0)
  })
})

describe('expectedPaceCopy', () => {
  it('uses an em dash when weekly change is missing', () => {
    expect(expectedPaceCopy(null, 0.5, 0.75)).toEqual({ current: '—', range: '0.5–0.75 kg/wk' })
    expect(expectedPaceCopy(Number.NaN, 0.5, 0.75).current).toBe('—')
  })
})

describe('roadmapStatus', () => {
  it('marks the active phase current even if an earlier one is still open', () => {
    expect(roadmapStatus(null, true)).toBe('current')
    expect(roadmapStatus('2026-01-01', false)).toBe('completed')
    expect(roadmapStatus(null, false)).toBe('upcoming')
  })
})
