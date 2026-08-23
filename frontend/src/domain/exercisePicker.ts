import { BODYWEIGHT_ID } from './onboarding/catalog/equipment'
import type { CatalogExercise } from './onboarding/catalog/exercises'
import type { Exercise } from './types'

/**
 * Bridges the onboarding exercise catalogue to the live, trackable exercise
 * list.
 *
 * The catalogue (100+ movements, tagged by required equipment) has existed
 * since onboarding but was only ever used to ask "have you done this
 * before?" — nothing let a person browse it afterward to actually add one of
 * those exercises to their plan. Everyone got the same fixed 11-exercise
 * starter list regardless of what they said they had access to.
 */

/**
 * A catalogue entry is usable when the person owns at least one of its
 * alternative equipment options AND every item it additionally requires.
 * Bodyweight is always available — nobody is asked to "own" their own body.
 */
export function isCatalogExerciseUsable(exercise: CatalogExercise, ownedEquipmentIds: string[]): boolean {
  const owned = new Set([...ownedEquipmentIds, BODYWEIGHT_ID])
  const hasOneOfRequired = exercise.requiredEquipment.some((id) => owned.has(id))
  const hasAllAlsoRequired = (exercise.alsoRequires ?? []).every((id) => owned.has(id))
  return hasOneOfRequired && hasAllAlsoRequired
}

const LOWER_BODY_MUSCLES = new Set(['quads', 'hamstrings', 'glutes', 'calves'])

/**
 * Sensible starting rep range, sets, RIR target, and load increment for a
 * catalogue exercise, mirroring the defaults the original seeded starter
 * list already used: lower-body compounds progress in bigger jumps than
 * upper-body isolation work, and compounds get lower rep ranges than the
 * accessory work built around them.
 */
export function defaultExerciseParams(
  exercise: CatalogExercise,
): Pick<Exercise, 'repRangeMin' | 'repRangeMax' | 'targetSets' | 'targetRir' | 'loadIncrementKg'> {
  const lowerBody = exercise.primaryMuscles.some((m) => LOWER_BODY_MUSCLES.has(m))
  if (exercise.compound) {
    return lowerBody
      ? { repRangeMin: 5, repRangeMax: 8, targetSets: 3, targetRir: 2, loadIncrementKg: 5 }
      : { repRangeMin: 6, repRangeMax: 10, targetSets: 3, targetRir: 2, loadIncrementKg: 2.5 }
  }
  return lowerBody
    ? { repRangeMin: 10, repRangeMax: 15, targetSets: 3, targetRir: 1, loadIncrementKg: 2.5 }
    : { repRangeMin: 10, repRangeMax: 15, targetSets: 2, targetRir: 1, loadIncrementKg: 2 }
}

/** Sensible general-purpose defaults for a free-text exercise with no catalogue entry to derive from. */
export function defaultCustomExerciseParams(): Pick<
  Exercise,
  'repRangeMin' | 'repRangeMax' | 'targetSets' | 'targetRir' | 'loadIncrementKg'
> {
  return { repRangeMin: 8, repRangeMax: 12, targetSets: 3, targetRir: 2, loadIncrementKg: 2.5 }
}
