import { validateProposal } from './guards'
import type { OnboardingPlanDraft } from '@/db/repo'
import type { GeneratedProposal, OnboardingDraft } from './types'
import type { LocalDate } from '@/domain/types'

/**
 * The only bridge from a proposal to the existing activation contract.
 *
 * `applyOnboardingPlan` is unchanged and remains the single write path to the
 * live plan. This converts a *confirmed* proposal into the shape it already
 * accepts, and refuses everything else — so the confirmation requirement is
 * enforced by the type system and the gate rather than by remembering to check.
 *
 * The conversion collapses ranges to a single number because phases store
 * points, not bands. That collapse happens here, once, at the boundary, so the
 * proposal the user reviewed keeps its ranges intact for display.
 */

export type ConversionResult =
  | { ok: true; draft: OnboardingPlanDraft }
  | { ok: false; reason: 'not_confirmed' | 'failed_validation' | 'incomplete'; detail: string }

/** Explicit user acknowledgement. Nothing converts without one. */
export interface Confirmation {
  confirmed: true
  /** What the user saw when they accepted, for an audit trail. */
  proposalGeneratedAt: string
}

function midpoint(range: { min: number; max: number }): number {
  return Math.round((range.min + range.max) / 2)
}

/**
 * Maps the onboarding interview's rough "what do you currently do" answer to
 * one of the named splits in `trainingSplits.ts`, so a person who already
 * told the app they run PPL isn't asked to pick their split again from
 * scratch the first time they open the exercise library. Answers that don't
 * name a specific split ('other', 'none') stay null — a genuine "ask them"
 * case, not a guess.
 */
function splitIdFromCurrentSplit(currentSplit: OnboardingDraft['training']['currentSplit']): string | null {
  switch (currentSplit) {
    case 'full_body':
      return 'full-body'
    case 'upper_lower':
      return 'upper-lower'
    case 'push_pull_legs':
      return 'ppl'
    case 'bro_split':
      return 'bro-split'
    default:
      return null
  }
}

export function proposalToPlanDraft(
  proposal: GeneratedProposal,
  draft: OnboardingDraft,
  confirmation: Confirmation,
  planStartDate: LocalDate,
): ConversionResult {
  if (confirmation?.confirmed !== true) {
    return { ok: false, reason: 'not_confirmed', detail: 'The user has not confirmed this proposal.' }
  }
  /*
   * The confirmation must name the proposal it was given for. Without this a
   * stale acknowledgement could be replayed against a regenerated plan the
   * user never actually saw.
   */
  if (confirmation.proposalGeneratedAt !== proposal.generatedAt) {
    return {
      ok: false,
      reason: 'not_confirmed',
      detail: 'The confirmation belongs to a different proposal.',
    }
  }

  // Re-validated at the boundary rather than trusting that whoever produced
  // this ran the gate. Activation is the expensive mistake.
  const validation = validateProposal(proposal, draft)
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'failed_validation',
      detail: validation.violations.map((v) => v.message).join(' '),
    }
  }

  const startWeightKg = draft.about.currentWeightKg
  if (startWeightKg === null) {
    return { ok: false, reason: 'incomplete', detail: 'Current weight is required to start a plan.' }
  }
  const goalWeightKg = draft.goals.goalWeightKg ?? startWeightKg

  const phases = proposal.phases.map((phase) => ({
    name: phase.name,
    startWeightKg: phase.startWeightKg,
    targetWeightKg: phase.targetWeightKg,
    calories: phase.calories,
    proteinG: phase.proteinG,
    steps: phase.steps,
    weeklyRunKmTarget: null,
    notes: phase.notes,
  }))

  return {
    ok: true,
    draft: {
      profile: {
        name: draft.about.preferredName,
        birthYear: draft.about.birthYear,
        heightCm: draft.about.heightCm,
        startWeightKg,
        goalWeightKg,
      },
      planStartDate,
      targets: {
        calories: midpoint(proposal.nutrition.calories),
        proteinG: midpoint(proposal.nutrition.proteinG),
        steps: draft.activity.typicalSteps ?? phases[0]?.steps ?? 8000,
        sleepHours: draft.activity.typicalSleepHours ?? 8,
        gymDaysPerWeek: proposal.training.daysPerWeek,
        weeklyRunKmTarget: null,
      },
      phases: phases.length > 0
        ? phases
        : [
            {
              name: 'Phase 1',
              startWeightKg,
              targetWeightKg: goalWeightKg,
              calories: midpoint(proposal.nutrition.calories),
              proteinG: midpoint(proposal.nutrition.proteinG),
              steps: draft.activity.typicalSteps ?? 8000,
              weeklyRunKmTarget: null,
              notes: null,
            },
          ],
      equipmentIds: draft.training.equipmentIds,
      trainingSplitId: splitIdFromCurrentSplit(draft.training.currentSplit),
    },
  }
}
