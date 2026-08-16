import { describe, expect, it } from 'vitest'
import { emptyDraft } from './chapters'
import { buildBaselineProposal, buildNutrition, calorieFloorFor, maintenanceCalories, SAFETY } from './baseline'
import { validateProposal } from './guards'
import type { OnboardingDraft } from './types'

function draft(overrides: Partial<{
  weightKg: number
  goalWeightKg: number | null
  sex: 'male' | 'female' | 'unspecified'
  pace: 'steady' | 'moderate' | 'aggressive'
  goal: OnboardingDraft['goals']['primaryGoal']
  equipmentIds: string[]
  days: number[]
}> = {}): OnboardingDraft {
  const d = emptyDraft('UTC')
  d.about = {
    ...d.about,
    heightCm: 180,
    currentWeightKg: overrides.weightKg ?? 90,
    birthYear: 1995,
    calculationSex: overrides.sex ?? 'male',
    units: 'metric',
  }
  d.activity = { ...d.activity, activityLevel: 'active', availableTrainingDays: 4 }
  d.goals = {
    ...d.goals,
    primaryGoal: overrides.goal ?? 'fat_loss',
    pace: overrides.pace ?? 'moderate',
    goalWeightKg: overrides.goalWeightKg === undefined ? 80 : overrides.goalWeightKg,
  }
  d.training = {
    ...d.training,
    experience: 'intermediate',
    environment: 'commercial_gym',
    equipmentIds: overrides.equipmentIds ?? [
      'barbell', 'dumbbells', 'squat_rack', 'flat_bench', 'adjustable_bench',
      'cable_machine', 'lat_pulldown', 'leg_press', 'leg_curl', 'leg_extension',
    ],
    preferredDays: overrides.days ?? [1, 2, 4, 5],
  }
  d.food = { ...d.food, mealsPerDay: 4 }
  return d
}

describe('deterministic nutrition', () => {
  it('produces a maintenance estimate from the four required answers', () => {
    expect(maintenanceCalories(draft())).toBeGreaterThan(2000)
    // Missing any one of them yields null rather than a guess.
    const partial = emptyDraft()
    expect(maintenanceCalories(partial)).toBeNull()
  })

  it('never drops calories below the sex-specific floor', () => {
    // A tiny, aggressive cut is where a naive formula goes underwater.
    const aggressive = draft({ weightKg: 48, goalWeightKg: 42, sex: 'female', pace: 'aggressive' })
    const nutrition = buildNutrition(aggressive)!
    expect(nutrition.calories.min).toBeGreaterThanOrEqual(SAFETY.minCaloriesFemale)
    expect(calorieFloorFor(aggressive)).toBe(SAFETY.minCaloriesFemale)
  })

  it('caps the deficit as a fraction of maintenance, not just an absolute floor', () => {
    const d = draft({ weightKg: 150, goalWeightKg: 90, pace: 'aggressive' })
    const nutrition = buildNutrition(d)!
    const maintenance = maintenanceCalories(d)!
    expect(nutrition.calories.min).toBeGreaterThanOrEqual(
      maintenance * (1 - SAFETY.maxDeficitFraction) - 1,
    )
  })

  it('puts a surplus on a muscle gain goal', () => {
    const gain = buildNutrition(draft({ goal: 'muscle_gain', goalWeightKg: 95 }))!
    const maintenance = maintenanceCalories(draft({ goal: 'muscle_gain', goalWeightKg: 95 }))!
    expect(gain.calories.max).toBeGreaterThan(maintenance)
  })

  it('keeps protein, fat and fibre above their floors', () => {
    const d = draft()
    const nutrition = buildNutrition(d)!
    expect(nutrition.proteinG.min).toBeGreaterThanOrEqual(80 * SAFETY.minProteinPerKg - 1)
    expect(nutrition.fatG.min).toBeGreaterThanOrEqual(90 * SAFETY.minFatPerKg - 1)
    expect(nutrition.fiberG.min).toBeGreaterThanOrEqual(SAFETY.minFiberG)
  })

  it('expresses every target as a valid range', () => {
    const n = buildNutrition(draft())!
    for (const key of ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'hydrationMl'] as const) {
      expect(n[key].min).toBeLessThanOrEqual(n[key].max)
      expect(n[key].min).toBeGreaterThan(0)
    }
  })
})

describe('deterministic training', () => {
  it('builds a split that only uses available equipment', () => {
    const d = draft({ equipmentIds: ['dumbbells'] })
    const proposal = buildBaselineProposal(d)!

    for (const day of proposal.training.days) {
      for (const prescription of day.exercises) {
        for (const id of prescription.equipmentIds) {
          expect(['bodyweight', 'dumbbells']).toContain(id)
        }
      }
    }
  })

  it('passes its own guard, which is the contract the AI path must also meet', () => {
    const d = draft()
    const proposal = buildBaselineProposal(d)!
    expect(validateProposal(proposal, d)).toEqual({ ok: true })
  })

  it('still produces a usable plan for a bodyweight-only beginner', () => {
    const d = draft({ equipmentIds: [] })
    d.training.experience = 'beginner'
    const proposal = buildBaselineProposal(d)!

    expect(proposal.training.days.length).toBeGreaterThan(0)
    expect(proposal.training.days.some((day) => day.exercises.length > 0)).toBe(true)
    expect(validateProposal(proposal, d)).toEqual({ ok: true })
  })

  it('excludes avoided and painful movements from the generated split', () => {
    const d = draft()
    d.training.familiarity = { back_squat: 'avoid', conventional_deadlift: 'discomfort' }
    const proposal = buildBaselineProposal(d)!
    const ids = proposal.training.days.flatMap((day) => day.exercises.map((e) => e.exerciseId))

    expect(ids).not.toContain('back_squat')
    // Discomfort suppresses the hinge pattern entirely.
    expect(ids).not.toContain('conventional_deadlift')
    expect(ids).not.toContain('romanian_deadlift')
    expect(validateProposal(proposal, d)).toEqual({ ok: true })
  })
})

describe('proposal metadata', () => {
  it('always requires confirmation and never activates anything', () => {
    const proposal = buildBaselineProposal(draft())!
    expect(proposal.requiresConfirmation).toBe(true)
    expect(proposal.provider).toBe('rules')
  })

  it('returns null when required answers are missing rather than inventing them', () => {
    expect(buildBaselineProposal(emptyDraft())).toBeNull()
  })

  it('reports what it assumed and what it still needs', () => {
    const sparse = draft()
    sparse.activity.typicalSteps = null
    sparse.training.familiarity = {}
    const proposal = buildBaselineProposal(sparse)!

    expect(proposal.missingInformation).toContain('Typical daily steps')
    expect(proposal.missingInformation).toContain('Exercise familiarity')
    expect(proposal.confidence).not.toBe('high')
  })

  it('raises confidence as more is answered', () => {
    const rich = draft()
    rich.activity.typicalSteps = 9000
    rich.activity.typicalSleepHours = 7.5
    rich.training.familiarity = { back_squat: 'regular', barbell_bench_press: 'comfortable' }
    expect(buildBaselineProposal(rich)!.confidence).toBe('high')
  })

  it('stamps the draft version so a stale proposal is detectable', () => {
    const d = draft()
    expect(buildBaselineProposal(d)!.inputVersion).toBe(d.version)
  })
})
