import type { PhaseReview, Recommendation } from '@/domain/rules'

export function isActionableCalorieRecommendation(
  recommendation: Recommendation | undefined,
): recommendation is Recommendation & { proposedCalories: number } {
  return recommendation?.severity === 'action' && recommendation.proposedCalories != null
}

export function shouldApplyCalorieChange(recommendation: Recommendation | undefined): boolean {
  return isActionableCalorieRecommendation(recommendation)
}

export type DecisionPresentation = {
  kind: 'actionable' | 'informational'
  showReviewSecondary: boolean
  showWarnCallout: boolean
  showHoldMeter: boolean
}

export function presentNextDecision(
  recommendation: Recommendation | undefined,
  review: PhaseReview | undefined,
): DecisionPresentation {
  const actionable = isActionableCalorieRecommendation(recommendation)
  const warn = recommendation?.severity === 'warn'
  const hold =
    review != null &&
    (review.code === 'approaching' || review.code === 'ready_for_review') &&
    review.daysRequired > 0

  return {
    kind: actionable ? 'actionable' : 'informational',
    showReviewSecondary: actionable && review?.code === 'ready_for_review',
    showWarnCallout: !actionable && Boolean(warn) && review != null,
    showHoldMeter: !actionable && hold,
  }
}

export function snapshotRemainingKg(
  remainingKg: number | null | undefined,
  trendWeightKg: number | null | undefined,
): number | null {
  if (remainingKg != null && !Number.isNaN(remainingKg)) return remainingKg
  if (trendWeightKg == null || Number.isNaN(trendWeightKg)) return null
  return null
}

export function expectedPaceCopy(
  lossKgPerWeek: number | null | undefined,
  minKg: number,
  maxKg: number,
): { current: string; range: string } {
  const range = `${minKg}–${maxKg} kg/wk`
  if (lossKgPerWeek == null || Number.isNaN(lossKgPerWeek)) {
    return { current: '—', range }
  }
  if (Math.abs(lossKgPerWeek) < 0.005) return { current: '±0.00 kg/wk', range }
  const arrow = lossKgPerWeek > 0 ? '↓' : '↑'
  return { current: `${arrow} ${Math.abs(lossKgPerWeek).toFixed(2)} kg/wk`, range }
}

export function roadmapStatus(
  endedOn: string | null,
  isActive: boolean,
): 'completed' | 'current' | 'upcoming' {
  if (isActive) return 'current'
  if (endedOn != null) return 'completed'
  return 'upcoming'
}
