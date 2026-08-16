import { describe, expect, it } from 'vitest'
import { asLocalDate } from '@/domain/date'
import { emptyDraft } from './chapters'
import { buildBaselineProposal } from './baseline'
import { proposalToPlanDraft, type Confirmation } from './toPlanDraft'
import type { OnboardingDraft } from './types'

const START = asLocalDate('2026-09-01')

function baseDraft(): OnboardingDraft {
  const d = emptyDraft('UTC')
  d.about = {
    ...d.about,
    preferredName: 'Dev', heightCm: 180, currentWeightKg: 90,
    birthYear: 1995, calculationSex: 'male', units: 'metric',
  }
  d.activity = { ...d.activity, activityLevel: 'active', availableTrainingDays: 4, typicalSteps: 9000, typicalSleepHours: 7.5 }
  d.goals = { ...d.goals, primaryGoal: 'fat_loss', pace: 'moderate', goalWeightKg: 80 }
  d.training = {
    ...d.training,
    experience: 'intermediate', environment: 'commercial_gym',
    equipmentIds: ['barbell', 'dumbbells', 'squat_rack', 'flat_bench', 'cable_machine', 'lat_pulldown'],
    preferredDays: [1, 2, 4, 5],
  }
  d.food = { ...d.food, mealsPerDay: 4 }
  return d
}

function confirmationFor(generatedAt: string): Confirmation {
  return { confirmed: true, proposalGeneratedAt: generatedAt }
}

describe('activation requires explicit confirmation', () => {
  it('converts a confirmed, valid proposal', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    const result = proposalToPlanDraft(proposal, draft, confirmationFor(proposal.generatedAt), START)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.profile.startWeightKg).toBe(90)
      expect(result.draft.profile.goalWeightKg).toBe(80)
      expect(result.draft.planStartDate).toBe(START)
      expect(result.draft.targets.gymDaysPerWeek).toBe(proposal.training.daysPerWeek)
      expect(result.draft.phases.length).toBeGreaterThan(0)
    }
  })

  it('refuses when the user has not confirmed', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    const result = proposalToPlanDraft(
      proposal,
      draft,
      { confirmed: false } as unknown as Confirmation,
      START,
    )

    expect(result).toMatchObject({ ok: false, reason: 'not_confirmed' })
  })

  it('refuses a confirmation that belongs to a different proposal', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    // A stale acknowledgement must not be replayable against a regenerated plan.
    const stale = confirmationFor('2020-01-01T00:00:00.000Z')

    expect(proposalToPlanDraft(proposal, draft, stale, START)).toMatchObject({
      ok: false,
      reason: 'not_confirmed',
    })
  })

  it('re-validates at the boundary instead of trusting the caller', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    // Tampered after generation, as a mutated AI response could be.
    proposal.nutrition.calories = { min: 700, max: 900 }

    const result = proposalToPlanDraft(proposal, draft, confirmationFor(proposal.generatedAt), START)
    expect(result).toMatchObject({ ok: false, reason: 'failed_validation' })
  })

  it('refuses when the draft lacks a current weight', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    draft.about.currentWeightKg = null

    expect(proposalToPlanDraft(proposal, draft, confirmationFor(proposal.generatedAt), START)).toMatchObject({
      ok: false,
    })
  })
})

describe('range collapse at the boundary', () => {
  it('collapses ranges to the midpoint the phase model expects', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    const result = proposalToPlanDraft(proposal, draft, confirmationFor(proposal.generatedAt), START)

    expect(result.ok).toBe(true)
    if (result.ok) {
      const expected = Math.round((proposal.nutrition.calories.min + proposal.nutrition.calories.max) / 2)
      expect(result.draft.targets.calories).toBe(expected)
      expect(result.draft.targets.calories).toBeGreaterThanOrEqual(proposal.nutrition.calories.min)
      expect(result.draft.targets.calories).toBeLessThanOrEqual(proposal.nutrition.calories.max)
    }
  })

  it('leaves the reviewed proposal untouched so the UI still shows bands', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    const before = { ...proposal.nutrition.calories }
    proposalToPlanDraft(proposal, draft, confirmationFor(proposal.generatedAt), START)

    expect(proposal.nutrition.calories).toEqual(before)
  })

  it('carries the user answers the plan needs rather than re-deriving them', () => {
    const draft = baseDraft()
    const proposal = buildBaselineProposal(draft)!
    const result = proposalToPlanDraft(proposal, draft, confirmationFor(proposal.generatedAt), START)

    if (!result.ok) throw new Error('expected conversion to succeed')
    expect(result.draft.profile.name).toBe('Dev')
    expect(result.draft.targets.steps).toBe(9000)
    expect(result.draft.targets.sleepHours).toBe(7.5)
  })
})
