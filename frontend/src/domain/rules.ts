import { adherence, weakestMetrics, type ComplianceReport } from './compliance'
import {
  consecutivePlateauWeeks,
  daysHeldBelow,
  weeklyChange,
  windowAverage,
  type LogIndex,
  type WeeklyChange,
} from './trend'
import type { LocalDate, Phase, Settings } from './types'

/**
 * Deterministic decision engine. The AI never overrides anything in here; it
 * only paraphrases the output.
 *
 * Bump RULES_VERSION on any behavioural change — it is part of the AI note
 * cache key, so stale notes cannot survive a rule edit.
 */
export const RULES_VERSION = '1.1.0'

/** Suggested step size for a calorie cut, kcal. Displayed as the 100-150 band. */
export const CUT_STEP_KCAL = 125
export const CUT_BAND_KCAL = [100, 150] as const
/** Step size when loss is too fast and calories should come back up. */
export const RAISE_STEP_KCAL = 150
export const RAISE_BAND_KCAL = [100, 200] as const

export type RecommendationCode =
  | 'insufficient_data'
  | 'log_more'
  | 'fix_adherence'
  | 'recovery_first'
  | 'gaining'
  | 'add_calories'
  | 'hold_in_band'
  | 'hold_fast_edge'
  | 'hold_monitor'
  | 'cut_calories'
  | 'cut_capped'
  | 'floor_reached'

export type Severity = 'info' | 'action' | 'warn'

export interface Recommendation {
  code: RecommendationCode
  severity: Severity
  headline: string
  detail: string
  /**
   * Proposed new daily calorie target. Null means "no change proposed".
   * NOTHING in this app writes this value automatically — it is a suggestion
   * the user accepts on the Plan screen or ignores.
   */
  proposedCalories: number | null
  deltaKcal: number | null
  evidence: Evidence
  rulesVersion: string
}

export interface Evidence {
  lossKgPerWeek: number | null
  trendWeightKg: number | null
  previousTrendWeightKg: number | null
  weightReadings: number
  plateauWeeks: number
  adherence: 'good' | 'poor' | 'unknown'
  overallHitRatePct: number | null
  overallCoveragePct: number
  cutsAppliedThisPhase: number
  maxCutsPerPhase: number
  currentCalories: number
  calorieFloor: number
  recoveryConcern: RecoveryConcern | null
}

export interface RecoveryConcern {
  reason: 'low_energy' | 'high_soreness' | 'short_sleep'
  averageValue: number
}

/**
 * Recovery veto. A body that is under-slept or beaten up does not need fewer
 * calories, and cutting here is how a cut turns into a spiral.
 */
export function detectRecoveryConcern(
  index: LogIndex,
  endDate: LocalDate,
  phase: Phase,
): RecoveryConcern | null {
  const energy = windowAverage(index, endDate, (l) => l.energy)
  if (energy.average !== null && energy.readings >= 3 && energy.average <= 2) {
    return { reason: 'low_energy', averageValue: energy.average }
  }
  const soreness = windowAverage(index, endDate, (l) => l.soreness)
  if (soreness.average !== null && soreness.readings >= 3 && soreness.average >= 4) {
    return { reason: 'high_soreness', averageValue: soreness.average }
  }
  const sleep = windowAverage(index, endDate, (l) => l.sleepHours)
  if (
    sleep.average !== null &&
    sleep.readings >= 3 &&
    sleep.average < phase.sleepHours - 1
  ) {
    return { reason: 'short_sleep', averageValue: sleep.average }
  }
  return null
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits)
}

/**
 * The guard chain.
 *
 * Ordering is load-bearing and deliberate:
 *   data → logging coverage → adherence → recovery → loss-rate partition
 *
 * The loss-rate branch covers the entire real line with a final `else`, so
 * there is no rate that falls through without a decision. In particular the
 * 0.3-0.5 kg/week band (slower than target, not yet a plateau) is handled
 * explicitly rather than being silently treated as either.
 */
export function recommend(
  index: LogIndex,
  endDate: LocalDate,
  phase: Phase,
  compliance: ComplianceReport,
  settings: Settings,
): Recommendation {
  const change = weeklyChange(index, endDate, settings.minReadingsPerWindow)
  const verdict = adherence(compliance, settings.goodCompliancePct)
  const plateauWeeks = consecutivePlateauWeeks(
    index,
    endDate,
    settings.minReadingsPerWindow,
    settings.plateauLossPerWeekThreshold,
  )
  const recovery = detectRecoveryConcern(index, endDate, phase)

  const evidence: Evidence = {
    lossKgPerWeek: change.lossKgPerWeek,
    trendWeightKg: change.current.averageKg,
    previousTrendWeightKg: change.previous.averageKg,
    weightReadings: change.current.readings,
    plateauWeeks,
    adherence: verdict,
    overallHitRatePct: compliance.overallHitRatePct,
    overallCoveragePct: compliance.overallCoveragePct,
    cutsAppliedThisPhase: phase.calorieCutsApplied,
    maxCutsPerPhase: settings.maxCalorieCutsPerPhase,
    currentCalories: phase.calories,
    calorieFloor: settings.calorieFloor,
    recoveryConcern: recovery,
  }

  const make = (
    code: RecommendationCode,
    severity: Severity,
    headline: string,
    detail: string,
    proposedCalories: number | null = null,
    deltaKcal: number | null = null,
  ): Recommendation => ({
    code,
    severity,
    headline,
    detail,
    proposedCalories,
    deltaKcal,
    evidence,
    rulesVersion: RULES_VERSION,
  })

  // --- Gate 1: is there enough weight data to say anything at all? ---------
  if (change.status !== 'ok' || change.lossKgPerWeek === null) {
    return make(
      'insufficient_data',
      'info',
      'Not enough weight data yet',
      `Two full weeks of weigh-ins are needed before a trend means anything. ` +
        `This window has ${change.current.readings} of ${settings.minReadingsPerWindow} ` +
        `required readings, the week before has ${change.previous.readings}. ` +
        `Keep weighing in each morning — no changes until then.`,
    )
  }

  const loss = change.lossKgPerWeek

  // --- Gate 2: is the window logged well enough to judge behaviour? --------
  if (verdict === 'unknown') {
    return make(
      'log_more',
      'info',
      'Too many gaps to judge the week',
      `Weight is moving at ${fmt(loss)} kg/week, but only ` +
        `${Math.round(compliance.overallCoveragePct)}% of the week was logged. ` +
        `Filling in food, steps and sleep for a full week comes before any ` +
        `change to targets — otherwise a plateau caused by not tracking looks ` +
        `identical to one caused by eating too much.`,
    )
  }

  // --- Gate 3: adherence before arithmetic --------------------------------
  // Only blocks when the plan is not working. A compliant-enough week that is
  // losing correctly should never be interrupted by this.
  if (verdict === 'poor' && loss < settings.targetLossPerWeekMin) {
    const weak = weakestMetrics(compliance)
      .map((m) => `${m.metric} ${Math.round(m.hitRatePct as number)}%`)
      .join(', ')
    return make(
      'fix_adherence',
      'action',
      'Hit the current plan before changing it',
      `Loss is ${fmt(loss)} kg/week with compliance at ` +
        `${Math.round(compliance.overallHitRatePct as number)}%. The plan has not ` +
        `been tested yet, so cutting calories would just make a plan you are ` +
        `already missing harder to hit. Weakest this week: ${weak || 'n/a'}.`,
    )
  }

  // --- Gate 4: recovery veto ----------------------------------------------
  if (recovery && loss < settings.targetLossPerWeekMin) {
    const reasonText =
      recovery.reason === 'low_energy'
        ? `energy is averaging ${fmt(recovery.averageValue, 1)}/5`
        : recovery.reason === 'high_soreness'
          ? `soreness is averaging ${fmt(recovery.averageValue, 1)}/5`
          : `sleep is averaging ${fmt(recovery.averageValue, 1)}h against a ` +
            `${phase.sleepHours}h target`

    return make(
      'recovery_first',
      'warn',
      'Fix recovery before cutting anything',
      `Loss has slowed to ${fmt(loss)} kg/week and ${reasonText}. Under-recovery ` +
        `suppresses movement and appetite control on its own. Hold calories, ` +
        `protect sleep for a week, then re-read the trend.`,
    )
  }

  // --- Loss-rate partition. Total, with an explicit final branch. ---------

  // Too fast: muscle and adherence both pay for this later.
  if (loss > settings.fastLossPerWeekThreshold) {
    const proposed = phase.calories + RAISE_STEP_KCAL
    return make(
      'add_calories',
      'warn',
      'Losing too fast — add calories back',
      `Trend weight is falling ${fmt(loss)} kg/week, above the ` +
        `${fmt(settings.fastLossPerWeekThreshold, 1)} kg/week ceiling. At this rate ` +
        `a growing share of the loss is muscle, and the deficit gets harder to ` +
        `sustain. Suggest adding ${RAISE_BAND_KCAL[0]}-${RAISE_BAND_KCAL[1]} kcal/day.`,
      proposed,
      RAISE_STEP_KCAL,
    )
  }

  // Faster than target but under the ceiling: acceptable, just watch recovery.
  if (loss > settings.targetLossPerWeekMax) {
    return make(
      'hold_fast_edge',
      'info',
      'Slightly ahead of target — hold',
      `Losing ${fmt(loss)} kg/week against a target band of ` +
        `${fmt(settings.targetLossPerWeekMin, 1)}-${fmt(settings.targetLossPerWeekMax, 1)}. ` +
        `Fine for now. Keep calories where they are and watch energy and gym ` +
        `performance — those slip before the scale shows a problem.`,
    )
  }

  // In the target band.
  if (loss >= settings.targetLossPerWeekMin) {
    return make(
      'hold_in_band',
      'info',
      'On target — change nothing',
      `Losing ${fmt(loss)} kg/week, inside the ` +
        `${fmt(settings.targetLossPerWeekMin, 1)}-${fmt(settings.targetLossPerWeekMax, 1)} ` +
        `kg/week band, with compliance at ` +
        `${Math.round(compliance.overallHitRatePct ?? 0)}%. The plan is working. ` +
        `The only job this week is repeating it.`,
    )
  }

  // Slower than target but not yet a plateau: the 0.3-0.5 gap.
  if (loss >= settings.plateauLossPerWeekThreshold) {
    return make(
      'hold_monitor',
      'info',
      'A little slow — hold and re-read next week',
      `Losing ${fmt(loss)} kg/week, under the ` +
        `${fmt(settings.targetLossPerWeekMin, 1)} kg/week target but above the ` +
        `plateau line. One slow week is usually water, not fat. No change yet.`,
    )
  }

  // Below the plateau line — including flat and gaining.
  if (plateauWeeks < settings.plateauWeeksBeforeCut) {
    const direction = loss < 0 ? `up ${fmt(-loss)}` : `flat at ${fmt(loss)}`
    return make(
      'hold_monitor',
      'info',
      'Stalled for now — not yet a trend',
      `Trend weight is ${direction} kg/week, which is ${plateauWeeks} ` +
        `${plateauWeeks === 1 ? 'week' : 'weeks'} below the plateau line. ` +
        `${settings.plateauWeeksBeforeCut} consecutive weeks are needed before ` +
        `touching calories, so that water shifts do not get mistaken for a stall.`,
    )
  }

  // Confirmed plateau, adherence is good, recovery is fine.
  if (loss < 0) {
    return make(
      'gaining',
      'warn',
      'Trend weight is rising',
      `Trend weight is up ${fmt(-loss)} kg/week across ${plateauWeeks} weeks ` +
        `with compliance at ${Math.round(compliance.overallHitRatePct ?? 0)}%. ` +
        `When logged intake looks on-plan but weight rises, the usual cause is ` +
        `unlogged intake rather than metabolism. Weigh and log everything for ` +
        `one week before changing the target.`,
    )
  }

  if (phase.calorieCutsApplied >= settings.maxCalorieCutsPerPhase) {
    return make(
      'cut_capped',
      'warn',
      'No more cuts this phase — review instead',
      `${phase.calorieCutsApplied} cuts have already been made in this phase and ` +
        `the trend is still under ${fmt(settings.plateauLossPerWeekThreshold, 1)} ` +
        `kg/week. Cutting again chases the problem downwards. Better options: a ` +
        `1-2 week maintenance break, more daily steps, or an honest audit of ` +
        `weekend intake.`,
    )
  }

  if (phase.calories - CUT_STEP_KCAL < settings.calorieFloor) {
    return make(
      'floor_reached',
      'warn',
      'At the calorie floor — add activity, not less food',
      `A cut would take the target under the ${settings.calorieFloor} kcal floor. ` +
        `Going lower at this bodyweight costs muscle, sleep and training quality. ` +
        `Add 1000-2000 steps a day or an easy cardio session instead, and hold ` +
        `intake where it is.`,
    )
  }

  const proposed = phase.calories - CUT_STEP_KCAL
  return make(
    'cut_calories',
    'action',
    'Confirmed plateau — small cut warranted',
    `${plateauWeeks} consecutive weeks under ` +
      `${fmt(settings.plateauLossPerWeekThreshold, 1)} kg/week with compliance at ` +
      `${Math.round(compliance.overallHitRatePct ?? 0)}% and recovery holding up. ` +
      `Suggest dropping ${CUT_BAND_KCAL[0]}-${CUT_BAND_KCAL[1]} kcal/day to ` +
      `${proposed} kcal. This is cut ${phase.calorieCutsApplied + 1} of ` +
      `${settings.maxCalorieCutsPerPhase} for the phase. Nothing changes until ` +
      `you apply it on the Plan screen.`,
    proposed,
    -CUT_STEP_KCAL,
  )
}

// ---------------------------------------------------------------------------
// Phase review
// ---------------------------------------------------------------------------

export type PhaseReviewCode =
  | 'insufficient_data'
  | 'in_progress'
  | 'approaching'
  | 'ready_for_review'

export interface PhaseReview {
  code: PhaseReviewCode
  headline: string
  detail: string
  trendWeightKg: number | null
  targetWeightKg: number
  daysHeld: number
  daysRequired: number
  /** Remaining kg on trend weight, floored at 0. Null when unknown. */
  remainingKg: number | null
}

/**
 * Phase advancement is never automatic and never fires off a raw weigh-in.
 * Trend weight must sit at or below the target for `phaseHoldDays` consecutive
 * days, and even then this only *offers* the review.
 */
export function reviewPhase(
  index: LogIndex,
  endDate: LocalDate,
  phase: Phase,
  settings: Settings,
): PhaseReview {
  const change = weeklyChange(index, endDate, settings.minReadingsPerWindow)
  const trend = change.current.averageKg
  const held = daysHeldBelow(
    index,
    endDate,
    phase.targetWeightKg,
    settings.minReadingsPerWindow,
  )

  const base = {
    trendWeightKg: trend,
    targetWeightKg: phase.targetWeightKg,
    daysHeld: held,
    daysRequired: settings.phaseHoldDays,
    remainingKg: trend === null ? null : Math.max(0, trend - phase.targetWeightKg),
  }

  if (trend === null) {
    return {
      ...base,
      code: 'insufficient_data',
      headline: 'Phase progress unavailable',
      detail: `Trend weight needs at least ${settings.minReadingsPerWindow} ` +
        `weigh-ins in the last 7 days.`,
    }
  }

  if (held >= settings.phaseHoldDays) {
    return {
      ...base,
      code: 'ready_for_review',
      headline: `${phase.name} target reached — review before advancing`,
      detail: `Trend weight has held at or below ${phase.targetWeightKg} kg for ` +
        `${held} consecutive days. Check waist and gym performance too, then ` +
        `advance the phase manually on the Plan screen.`,
    }
  }

  if (held > 0) {
    return {
      ...base,
      code: 'approaching',
      headline: 'Under target — waiting for it to hold',
      detail: `Trend weight is under ${phase.targetWeightKg} kg on day ${held} of ` +
        `${settings.phaseHoldDays}. Holding the threshold for a few days filters ` +
        `out a single light morning.`,
    }
  }

  return {
    ...base,
    code: 'in_progress',
    headline: `${fmt(base.remainingKg ?? 0, 1)} kg to go in ${phase.name}`,
    detail: `Trend weight ${fmt(trend, 1)} kg against a ${phase.targetWeightKg} kg ` +
      `phase target.`,
  }
}

/** Shape handed to the AI endpoint. Deliberately small and already decided. */
export interface CoachStateSummary {
  date: LocalDate
  phaseName: string
  rulesVersion: string
  recommendation: Pick<Recommendation, 'code' | 'headline'>
  phaseReview: Pick<PhaseReview, 'code' | 'daysHeld' | 'remainingKg'>
  evidence: Evidence
}

export function buildCoachSummary(
  date: LocalDate,
  phase: Phase,
  rec: Recommendation,
  review: PhaseReview,
): CoachStateSummary {
  return {
    date,
    phaseName: phase.name,
    rulesVersion: RULES_VERSION,
    recommendation: { code: rec.code, headline: rec.headline },
    phaseReview: {
      code: review.code,
      daysHeld: review.daysHeld,
      remainingKg: review.remainingKg,
    },
    evidence: rec.evidence,
  }
}

export type { WeeklyChange }
