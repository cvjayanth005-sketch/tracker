import { calorieFloorFor, maintenanceCalories, SAFETY } from './baseline'
import { availableEquipment, blockedExerciseIds, blockedPatterns } from './eligibility'
import { exerciseById } from './catalog/exercises'
import { equipmentById } from './catalog/equipment'
import type { GeneratedProposal, NutritionProposal, OnboardingDraft, Range } from './types'

/**
 * The boundary every proposal crosses, whoever produced it.
 *
 * The product rule is that deterministic calculation owns safety and AI owns
 * personalization. That rule is only real if it is enforced in code, so the AI
 * path runs through exactly this function — an AI proposal is not trusted more
 * than a rules one, it is simply another candidate that must pass.
 *
 * Violations reject rather than clamp. Silently correcting a model that asked
 * for 900 calories would hide that it did, and the caller would ship a plan
 * subtly different from the one that was explained to the user.
 */

export type ViolationCode =
  | 'calories_below_floor'
  | 'deficit_too_aggressive'
  | 'protein_out_of_range'
  | 'fat_below_floor'
  | 'fiber_below_floor'
  | 'invalid_range'
  | 'unknown_exercise'
  | 'unavailable_equipment'
  | 'blocked_exercise'
  | 'blocked_pattern'
  | 'missing_confirmation_flag'
  | 'empty_training'

export interface Violation {
  code: ViolationCode
  message: string
  /** Where it occurred, for a UI that wants to point at it. */
  path: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; violations: Violation[] }

function badRange(range: Range | undefined | null): boolean {
  return (
    !range ||
    typeof range.min !== 'number' ||
    typeof range.max !== 'number' ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min > range.max ||
    range.min < 0
  )
}

export function validateNutrition(
  nutrition: NutritionProposal,
  draft: OnboardingDraft,
): Violation[] {
  const violations: Violation[] = []
  const floor = calorieFloorFor(draft)
  const weightKg = draft.about.currentWeightKg

  for (const [key, value] of Object.entries({
    calories: nutrition.calories,
    proteinG: nutrition.proteinG,
    carbsG: nutrition.carbsG,
    fatG: nutrition.fatG,
    fiberG: nutrition.fiberG,
    hydrationMl: nutrition.hydrationMl,
  })) {
    if (badRange(value)) {
      violations.push({
        code: 'invalid_range',
        message: `${key} is not a valid range.`,
        path: `nutrition.${key}`,
      })
    }
  }
  // A malformed range makes every downstream comparison meaningless.
  if (violations.length > 0) return violations

  if (nutrition.calories.min < floor) {
    violations.push({
      code: 'calories_below_floor',
      message: `Calories may not go below ${floor} for this user.`,
      path: 'nutrition.calories.min',
    })
  }

  const maintenance = maintenanceCalories(draft)
  if (maintenance !== null) {
    const deepest = nutrition.calories.min
    if (deepest < maintenance * (1 - SAFETY.maxDeficitFraction) - 1) {
      violations.push({
        code: 'deficit_too_aggressive',
        message: `A deficit deeper than ${SAFETY.maxDeficitFraction * 100}% of maintenance is not sustainable.`,
        path: 'nutrition.calories.min',
      })
    }
  }

  if (weightKg !== null) {
    const basis = Math.max(40, Math.min(draft.goals.goalWeightKg ?? weightKg, weightKg))
    if (nutrition.proteinG.min < basis * SAFETY.minProteinPerKg - 1) {
      violations.push({
        code: 'protein_out_of_range',
        message: 'Protein is below the floor needed to hold lean mass.',
        path: 'nutrition.proteinG.min',
      })
    }
    if (nutrition.fatG.min < weightKg * SAFETY.minFatPerKg - 1) {
      violations.push({
        code: 'fat_below_floor',
        message: 'Fat is below the hormonal floor.',
        path: 'nutrition.fatG.min',
      })
    }
  }

  if (nutrition.fiberG.min < SAFETY.minFiberG - 1) {
    violations.push({
      code: 'fiber_below_floor',
      message: `Fibre should be at least ${SAFETY.minFiberG}g.`,
      path: 'nutrition.fiberG.min',
    })
  }

  return violations
}

export function validateTraining(proposal: GeneratedProposal, draft: OnboardingDraft): Violation[] {
  const violations: Violation[] = []
  const equipment = availableEquipment(draft)
  const blockedExercises = blockedExerciseIds(draft)
  const patterns = blockedPatterns(draft)

  if (proposal.training.days.length === 0) {
    violations.push({
      code: 'empty_training',
      message: 'The split contains no training days.',
      path: 'training.days',
    })
  }

  proposal.training.days.forEach((day, dayIndex) => {
    day.exercises.forEach((prescription, exerciseIndex) => {
      const path = `training.days[${dayIndex}].exercises[${exerciseIndex}]`
      const exercise = exerciseById(prescription.exerciseId)

      // An id we do not recognise cannot be checked for anything else, so it is
      // rejected outright rather than assumed harmless.
      if (!exercise) {
        violations.push({
          code: 'unknown_exercise',
          message: `"${prescription.exerciseId}" is not in the exercise catalogue.`,
          path,
        })
        return
      }
      if (blockedExercises.has(exercise.id)) {
        violations.push({
          code: 'blocked_exercise',
          message: `${exercise.name} was marked avoid or discomfort.`,
          path,
        })
      }
      if (patterns.has(exercise.pattern)) {
        violations.push({
          code: 'blocked_pattern',
          message: `${exercise.name} uses a movement pattern the user cannot train.`,
          path,
        })
      }
      const needsBase = exercise.requiredEquipment.some((id) => equipment.has(id))
      const needsExtras = (exercise.alsoRequires ?? []).every((id) => equipment.has(id))
      if (!needsBase || !needsExtras) {
        violations.push({
          code: 'unavailable_equipment',
          message: `${exercise.name} needs equipment the user does not have.`,
          path,
        })
      }
      // Equipment the prescription claims must also exist and be owned.
      for (const id of prescription.equipmentIds) {
        if (!equipmentById(id) || !equipment.has(id)) {
          violations.push({
            code: 'unavailable_equipment',
            message: `"${id}" is not available to this user.`,
            path: `${path}.equipmentIds`,
          })
        }
      }
      // A substitution is offered mid-session; an unusable one is worse than none.
      for (const id of prescription.substitutionIds) {
        const sub = exerciseById(id)
        if (!sub) {
          violations.push({ code: 'unknown_exercise', message: `Unknown substitution "${id}".`, path: `${path}.substitutionIds` })
          continue
        }
        if (blockedExercises.has(sub.id) || patterns.has(sub.pattern)) {
          violations.push({
            code: 'blocked_exercise',
            message: `Substitution ${sub.name} is blocked for this user.`,
            path: `${path}.substitutionIds`,
          })
        }
        if (!sub.requiredEquipment.some((eq) => equipment.has(eq))) {
          violations.push({
            code: 'unavailable_equipment',
            message: `Substitution ${sub.name} needs unavailable equipment.`,
            path: `${path}.substitutionIds`,
          })
        }
      }
      if (badRange(prescription.sets) || badRange(prescription.reps) || badRange(prescription.restSeconds)) {
        violations.push({ code: 'invalid_range', message: 'Sets, reps, or rest is not a valid range.', path })
      }
    })
  })

  return violations
}

/** The single gate. Any proposal, any provider. */
export function validateProposal(
  proposal: GeneratedProposal,
  draft: OnboardingDraft,
): ValidationResult {
  const violations = [
    ...validateNutrition(proposal.nutrition, draft),
    ...validateTraining(proposal, draft),
  ]

  // A proposal that lost its confirmation requirement in transit must not be
  // able to reach the activation path at all.
  if (proposal.requiresConfirmation !== true) {
    violations.push({
      code: 'missing_confirmation_flag',
      message: 'A proposal must require explicit confirmation.',
      path: 'requiresConfirmation',
    })
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
