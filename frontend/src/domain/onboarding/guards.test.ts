import { describe, expect, it } from 'vitest'
import { emptyDraft } from './chapters'
import { buildBaselineProposal, SAFETY } from './baseline'
import { validateProposal } from './guards'
import type { GeneratedProposal, OnboardingDraft } from './types'
import type { ValidationResult, Violation } from './guards'

/**
 * These are the teeth behind "AI personalizes, deterministic code decides
 * safety". Each case takes a valid rules proposal and mutates it the way a
 * model plausibly would, then asserts the gate refuses it.
 */

function baseDraft(): OnboardingDraft {
  const d = emptyDraft('UTC')
  d.about = {
    ...d.about,
    heightCm: 180, currentWeightKg: 90, birthYear: 1995,
    calculationSex: 'male', units: 'metric',
  }
  d.activity = { ...d.activity, activityLevel: 'active', availableTrainingDays: 4 }
  d.goals = { ...d.goals, primaryGoal: 'fat_loss', pace: 'moderate', goalWeightKg: 80 }
  d.training = {
    ...d.training,
    experience: 'intermediate',
    environment: 'commercial_gym',
    equipmentIds: ['barbell', 'dumbbells', 'squat_rack', 'flat_bench', 'cable_machine', 'lat_pulldown'],
    preferredDays: [1, 2, 4, 5],
  }
  d.food = { ...d.food, mealsPerDay: 4 }
  return d
}

/** A structurally valid proposal, then relabelled as if a model produced it. */
function aiProposal(draft: OnboardingDraft): GeneratedProposal {
  const base = buildBaselineProposal(draft)!
  return { ...base, provider: 'ai', confidence: 'high' }
}

const codes = (result: ValidationResult): string[] =>
  result.ok ? [] : result.violations.map((v: Violation) => v.code)

describe('the gate treats AI and rules identically', () => {
  it('accepts an AI-labelled proposal that respects every boundary', () => {
    const draft = baseDraft()
    expect(validateProposal(aiProposal(draft), draft)).toEqual({ ok: true })
  })

  it('rejects calories below the floor, however confident the model is', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.nutrition.calories = { min: 900, max: 1100 }

    const result = validateProposal(proposal, draft)
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('calories_below_floor')
  })

  it('rejects a deficit deeper than the sustainable fraction of maintenance', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    // Above the absolute floor, so only the proportional rule catches it.
    proposal.nutrition.calories = { min: 1550, max: 1650 }

    expect(codes(validateProposal(proposal, draft))).toContain('deficit_too_aggressive')
  })

  it('rejects protein or fat below their floors', () => {
    const draft = baseDraft()
    const low = aiProposal(draft)
    low.nutrition.proteinG = { min: 40, max: 60 }
    expect(codes(validateProposal(low, draft))).toContain('protein_out_of_range')

    const lowFat = aiProposal(draft)
    lowFat.nutrition.fatG = { min: 10, max: 20 }
    expect(codes(validateProposal(lowFat, draft))).toContain('fat_below_floor')
  })

  it('rejects an inverted or malformed range instead of quietly reordering it', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.nutrition.calories = { min: 2600, max: 1800 }
    expect(codes(validateProposal(proposal, draft))).toContain('invalid_range')
  })

  it('rejects equipment the user does not own', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.training.days[0]!.exercises[0] = {
      ...proposal.training.days[0]!.exercises[0]!,
      exerciseId: 'leg_press_squat',
      exerciseName: 'Leg press',
      equipmentIds: ['leg_press'],
      substitutionIds: [],
    }

    expect(codes(validateProposal(proposal, draft))).toContain('unavailable_equipment')
  })

  it('rejects an exercise id that is not in the catalogue', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.training.days[0]!.exercises[0] = {
      ...proposal.training.days[0]!.exercises[0]!,
      exerciseId: 'hypertrophy_maximiser_3000',
      exerciseName: 'Invented lift',
      equipmentIds: [],
      substitutionIds: [],
    }

    expect(codes(validateProposal(proposal, draft))).toContain('unknown_exercise')
  })

  it('rejects an avoided exercise', () => {
    const draft = baseDraft()
    draft.training.familiarity = { barbell_bench_press: 'avoid' }
    const proposal = aiProposal(draft)
    proposal.training.days[0]!.exercises[0] = {
      ...proposal.training.days[0]!.exercises[0]!,
      exerciseId: 'barbell_bench_press',
      exerciseName: 'Barbell bench press',
      equipmentIds: ['barbell', 'flat_bench'],
      substitutionIds: [],
    }

    expect(codes(validateProposal(proposal, draft))).toContain('blocked_exercise')
  })

  it('rejects a movement pattern suppressed by an injury', () => {
    const draft = baseDraft()
    draft.about.limitations = [
      { id: 'l1', label: 'Lower back', affectedPatterns: ['hinge'], notes: null },
    ]
    const proposal = aiProposal(draft)
    proposal.training.days[0]!.exercises[0] = {
      ...proposal.training.days[0]!.exercises[0]!,
      exerciseId: 'romanian_deadlift',
      exerciseName: 'Romanian deadlift',
      equipmentIds: ['barbell'],
      substitutionIds: [],
    }

    expect(codes(validateProposal(proposal, draft))).toContain('blocked_pattern')
  })

  it('rejects a substitution that is itself unusable', () => {
    const draft = baseDraft()
    draft.training.familiarity = { push_up: 'avoid' }
    const proposal = aiProposal(draft)
    proposal.training.days[0]!.exercises[0] = {
      ...proposal.training.days[0]!.exercises[0]!,
      substitutionIds: ['push_up', 'leg_press_squat'],
    }

    const result = validateProposal(proposal, draft)
    // A substitution is offered mid-session; an unusable one is worse than none.
    expect(codes(result)).toContain('blocked_exercise')
    expect(codes(result)).toContain('unavailable_equipment')
  })

  it('rejects a proposal that dropped its confirmation requirement', () => {
    const draft = baseDraft()
    const proposal = { ...aiProposal(draft), requiresConfirmation: false } as unknown as GeneratedProposal

    expect(codes(validateProposal(proposal, draft))).toContain('missing_confirmation_flag')
  })

  it('reports every violation at once rather than stopping at the first', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.nutrition.calories = { min: 800, max: 900 }
    proposal.nutrition.fiberG = { min: 2, max: 5 }

    const result = validateProposal(proposal, draft)
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('calories_below_floor')
    expect(codes(result)).toContain('fiber_below_floor')
  })

  it('points at the offending field so the UI can explain the refusal', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.nutrition.calories = { min: 900, max: 1000 }

    const result = validateProposal(proposal, draft)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations[0]!.path).toContain('nutrition.calories')
      expect(result.violations[0]!.message).toBeTruthy()
    }
  })

  it('rejects rather than clamps, so a refused plan is never silently reshaped', () => {
    const draft = baseDraft()
    const proposal = aiProposal(draft)
    proposal.nutrition.calories = { min: 900, max: 1100 }

    validateProposal(proposal, draft)
    // The caller still holds exactly what the model asked for.
    expect(proposal.nutrition.calories).toEqual({ min: 900, max: 1100 })
    expect(SAFETY.minCaloriesMale).toBe(1500)
  })
})
