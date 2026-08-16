import { describe, expect, it } from 'vitest'
import { emptyDraft } from './chapters'
import { exerciseById } from './catalog/exercises'
import {
  availableEquipment,
  blockedPatterns,
  canPerform,
  eligibilityContext,
  eligibleExercises,
  ineligibilityReason,
  substitutionsFor,
  trainablePatterns,
} from './eligibility'
import type { ExerciseFamiliarity, MovementPattern, OnboardingDraft } from './types'

function draftWith(overrides: {
  equipmentIds?: string[]
  familiarity?: Record<string, ExerciseFamiliarity>
  limitationPatterns?: MovementPattern[]
  experience?: OnboardingDraft['training']['experience']
}): OnboardingDraft {
  const draft = emptyDraft()
  draft.training = {
    ...draft.training,
    experience: overrides.experience ?? 'intermediate',
    environment: 'commercial_gym',
    equipmentIds: overrides.equipmentIds ?? ['barbell', 'squat_rack', 'flat_bench', 'dumbbells'],
    familiarity: overrides.familiarity ?? {},
  }
  if (overrides.limitationPatterns) {
    draft.about.limitations = [
      {
        id: 'lim-1',
        label: 'Cranky lower back',
        affectedPatterns: overrides.limitationPatterns,
        notes: null,
      },
    ]
  }
  return draft
}

describe('equipment availability', () => {
  it('always includes bodyweight, which is not optional equipment', () => {
    expect(availableEquipment(emptyDraft()).has('bodyweight')).toBe(true)
  })

  it('drops ids that are not in the catalogue', () => {
    const draft = draftWith({ equipmentIds: ['barbell', 'imaginary_machine'] })
    const available = availableEquipment(draft)
    expect(available.has('barbell')).toBe(true)
    expect(available.has('imaginary_machine')).toBe(false)
  })

  it('requires ALL of alsoRequires, not just one of them', () => {
    const bench = exerciseById('barbell_bench_press')!
    // Barbell but no bench: the bar alone cannot produce a bench press.
    expect(canPerform(bench, new Set(['barbell']))).toBe(false)
    expect(canPerform(bench, new Set(['barbell', 'flat_bench']))).toBe(true)
  })

  it('accepts ANY one of requiredEquipment', () => {
    const lateral = exerciseById('lateral_raise')!
    expect(canPerform(lateral, new Set(['dumbbells']))).toBe(true)
    expect(canPerform(lateral, new Set(['cable_machine']))).toBe(true)
    expect(canPerform(lateral, new Set(['barbell']))).toBe(false)
  })
})

describe('unavailable equipment never appears', () => {
  it('excludes every exercise needing kit the user does not have', () => {
    const draft = draftWith({ equipmentIds: ['dumbbells'] })
    const available = availableEquipment(draft)

    for (const exercise of eligibleExercises(draft)) {
      expect(exercise.requiredEquipment.some((id) => available.has(id))).toBe(true)
      for (const extra of exercise.alsoRequires ?? []) {
        expect(available.has(extra)).toBe(true)
      }
    }
  })

  it('leaves a bodyweight-only user with real options and no machines', () => {
    const draft = draftWith({ equipmentIds: [] })
    const eligible = eligibleExercises(draft)

    expect(eligible.length).toBeGreaterThan(5)
    expect(eligible.map((e) => e.id)).toContain('push_up')
    expect(eligible.map((e) => e.id)).not.toContain('leg_press_squat')
    expect(eligible.map((e) => e.id)).not.toContain('barbell_bench_press')
  })
})

describe('avoidance and discomfort', () => {
  it('removes an avoided exercise but keeps the pattern reachable', () => {
    const draft = draftWith({ familiarity: { back_squat: 'avoid' } })
    const ids = eligibleExercises(draft).map((e) => e.id)

    expect(ids).not.toContain('back_squat')
    // A preference against one lift must not delete the squat pattern.
    expect(trainablePatterns(draft).has('squat')).toBe(true)
    expect(ids).toContain('goblet_squat')
  })

  it('escalates discomfort to the whole pattern', () => {
    const draft = draftWith({ familiarity: { back_squat: 'discomfort' } })
    const ids = eligibleExercises(draft).map((e) => e.id)

    // Pain is likelier to belong to the movement than to one implementation.
    expect(ids).not.toContain('back_squat')
    expect(ids).not.toContain('goblet_squat')
    expect(trainablePatterns(draft).has('squat')).toBe(false)
    // Unrelated patterns are untouched.
    expect(trainablePatterns(draft).has('horizontal_push')).toBe(true)
  })

  it('honours a declared limitation across every exercise in the pattern', () => {
    const draft = draftWith({ limitationPatterns: ['hinge'] })
    const ids = eligibleExercises(draft).map((e) => e.id)

    expect(ids).not.toContain('conventional_deadlift')
    expect(ids).not.toContain('romanian_deadlift')
    expect(ids).not.toContain('kettlebell_swing')
  })

  it('explains why something was rejected instead of only hiding it', () => {
    const context = eligibilityContext(
      draftWith({ equipmentIds: [], familiarity: { push_up: 'avoid' } }),
    )
    expect(ineligibilityReason(exerciseById('leg_press_squat')!, context)).toBe('equipment')
    expect(ineligibilityReason(exerciseById('push_up')!, context)).toBe('avoided')

    // Technical demand is relative to experience: a nordic curl is fine for an
    // intermediate and out of reach for a beginner, so it only reads as
    // "too technical" against the lower ceiling.
    const beginner = eligibilityContext(draftWith({ equipmentIds: [], experience: 'beginner' }))
    expect(ineligibilityReason(exerciseById('nordic_curl')!, beginner)).toBe('too_technical')
    expect(ineligibilityReason(exerciseById('nordic_curl')!, context)).toBeNull()
  })

  it('gates technical lifts by experience', () => {
    const beginner = eligibilityContext(draftWith({ experience: 'beginner' }))
    const advanced = eligibilityContext(draftWith({ experience: 'advanced' }))
    const deadlift = exerciseById('conventional_deadlift')!

    expect(ineligibilityReason(deadlift, beginner)).toBe('too_technical')
    expect(ineligibilityReason(deadlift, advanced)).toBeNull()
  })
})

describe('substitutions', () => {
  it('stays within the movement pattern', () => {
    const draft = draftWith({})
    for (const sub of substitutionsFor('barbell_bench_press', draft)) {
      expect(sub.pattern).toBe('horizontal_push')
      // Swapping a press for a curl would silently delete the push.
      expect(sub.id).not.toBe('barbell_bench_press')
    }
  })

  it('only proposes substitutes the user can actually perform', () => {
    const draft = draftWith({ equipmentIds: ['dumbbells', 'flat_bench'] })
    const available = availableEquipment(draft)

    for (const sub of substitutionsFor('barbell_bench_press', draft)) {
      expect(sub.requiredEquipment.some((id) => available.has(id))).toBe(true)
    }
  })

  it('never substitutes in something avoided or painful', () => {
    const draft = draftWith({
      equipmentIds: ['dumbbells', 'flat_bench', 'adjustable_bench'],
      familiarity: { dumbbell_bench_press: 'avoid', push_up: 'discomfort' },
    })
    const ids = substitutionsFor('barbell_bench_press', draft, 10).map((s) => s.id)

    expect(ids).not.toContain('dumbbell_bench_press')
    // push_up carries discomfort, which suppresses the whole push pattern.
    expect(ids).toEqual([])
  })

  it('prefers a movement the user already knows', () => {
    const draft = draftWith({
      equipmentIds: ['dumbbells', 'flat_bench', 'adjustable_bench', 'chest_press_machine'],
      familiarity: { machine_chest_press: 'regular' },
    })
    const ids = substitutionsFor('barbell_bench_press', draft, 5).map((s) => s.id)

    expect(ids).toContain('machine_chest_press')
  })

  it('returns nothing for an unknown exercise id rather than guessing', () => {
    expect(substitutionsFor('not_a_real_exercise', draftWith({}))).toEqual([])
  })
})

describe('blocked pattern derivation', () => {
  it('combines declared limitations and reported discomfort', () => {
    const draft = draftWith({
      limitationPatterns: ['hinge'],
      familiarity: { overhead_press: 'discomfort' },
    })
    const blocked = blockedPatterns(draft)

    expect(blocked.has('hinge')).toBe(true)
    expect(blocked.has('vertical_push')).toBe(true)
    expect(blocked.has('squat')).toBe(false)
  })

  it('ignores familiarity entries for exercises that no longer exist', () => {
    const draft = draftWith({ familiarity: { retired_exercise: 'discomfort' } })
    expect(blockedPatterns(draft).size).toBe(0)
  })
})
