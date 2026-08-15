import { describe, expect, it } from 'vitest'
import { buildStarterPlan, previewNumbers, projectWeeks } from './onboardingPlan'

const ANSWERS = {
  name: 'Sam',
  sex: 'Male',
  age: '30',
  heightCm: '180',
  currentWeightKg: '90',
  goalWeightKg: '80',
  activityLevel: 'Moderate',
  desiredPace: 'Steady',
  gymDaysPerWeek: '4',
}

describe('buildStarterPlan', () => {
  it('produces a usable phase-wise plan from answers', () => {
    const plan = buildStarterPlan(ANSWERS, 'UTC')
    expect(plan.profile.startWeightKg).toBe(90)
    expect(plan.profile.goalWeightKg).toBe(80)
    expect(plan.phases.length).toBeGreaterThanOrEqual(1)
    // First phase starts at current weight, last ends at goal.
    expect(plan.phases[0]!.startWeightKg).toBe(90)
    expect(plan.phases.at(-1)!.targetWeightKg).toBeCloseTo(80, 1)
    // Calories are a real deficit under maintenance, never below the floor.
    expect(plan.targets.calories).toBeGreaterThanOrEqual(1500)
    expect(plan.targets.calories).toBeLessThan(previewNumbers(ANSWERS).maintenanceKcal)
    expect(plan.targets.proteinG).toBeGreaterThan(100)
  })

  it('falls back to a maintenance plan when goal >= current', () => {
    const plan = buildStarterPlan({ ...ANSWERS, goalWeightKg: '90' }, 'UTC')
    expect(plan.phases).toHaveLength(1)
    expect(plan.profileSummary.toLowerCase()).toContain('maintenance')
  })

  it('never throws on empty answers', () => {
    expect(() => buildStarterPlan({}, 'UTC')).not.toThrow()
  })
})

describe('projectWeeks', () => {
  it('divides the loss by the pace', () => {
    expect(projectWeeks(90, 82, 'Steady')).toBe(16) // 8 kg / 0.5
    expect(projectWeeks(90, 82, 'Moderate')).toBe(11) // 8 / 0.75 → 10.67 → 11
    expect(projectWeeks(80, 82, 'Steady')).toBeNull() // not losing
  })
})
