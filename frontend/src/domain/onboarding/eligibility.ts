import { BODYWEIGHT_ID, knownEquipmentIds } from './catalog/equipment'
import { EXERCISES, exerciseById, type CatalogExercise } from './catalog/exercises'
import {
  BLOCKING_FAMILIARITY,
  type ExerciseFamiliarity,
  type MovementPattern,
  type MuscleGroup,
  type OnboardingDraft,
  type TrainingExperience,
} from './types'

/**
 * What a given user may actually be prescribed.
 *
 * Every rule here is a hard filter, not a preference weight. A proposal that
 * reaches the user must already be performable with equipment they have and
 * free of anything they flagged — an "unavailable equipment" or "this hurts"
 * result is not a ranking problem to be outweighed by a good enough score, so
 * these run before any scoring at all.
 */

/** Bodyweight is always available; a body is not optional equipment. */
export function availableEquipment(draft: OnboardingDraft): Set<string> {
  const ids = knownEquipmentIds(draft.training.equipmentIds)
  return new Set([BODYWEIGHT_ID, ...ids])
}

/**
 * `requiredEquipment` is a list of alternatives, `alsoRequires` a list of
 * conjunctions. A barbell bench needs a bar OR nothing else that substitutes,
 * AND a bench — treating both lists the same way would either forbid valid
 * variations or prescribe a bench press with no bench.
 */
export function canPerform(exercise: CatalogExercise, equipment: ReadonlySet<string>): boolean {
  const hasBase = exercise.requiredEquipment.some((id) => equipment.has(id))
  if (!hasBase) return false
  const extras = exercise.alsoRequires ?? []
  return extras.every((id) => equipment.has(id))
}

/**
 * Movement patterns suppressed for this user.
 *
 * Two sources, deliberately treated alike. A limitation the user described
 * ("bad lower back") names its patterns directly. Reporting `discomfort` on a
 * specific lift escalates to its whole pattern, because the pain is far more
 * likely to belong to the movement than to that one implementation of it — and
 * a substitution that stayed within the pattern would hand back the same
 * movement under a different name.
 *
 * `avoid` is not escalated: it is a stated preference, so it removes only the
 * exercise named and leaves the pattern reachable by other means.
 */
export function blockedPatterns(draft: OnboardingDraft): Set<MovementPattern> {
  const blocked = new Set<MovementPattern>()
  for (const limitation of draft.about.limitations) {
    for (const pattern of limitation.affectedPatterns) blocked.add(pattern)
  }
  for (const [exerciseId, familiarity] of Object.entries(draft.training.familiarity)) {
    if (familiarity !== 'discomfort') continue
    const exercise = exerciseById(exerciseId)
    if (exercise) blocked.add(exercise.pattern)
  }
  return blocked
}

/** Exercises the user explicitly will not do. */
export function blockedExerciseIds(draft: OnboardingDraft): Set<string> {
  return new Set(
    Object.entries(draft.training.familiarity)
      .filter(([, value]) => BLOCKING_FAMILIARITY.includes(value))
      .map(([id]) => id),
  )
}

/** Highest technical demand this user should be given unsupervised. */
function demandCeiling(experience: TrainingExperience | null): number {
  switch (experience) {
    case 'advanced':
      return 3
    case 'intermediate':
      return 3
    case 'returning':
      return 2
    // A beginner, or someone who has not said, gets the lower-risk half.
    default:
      return 2
  }
}

export interface EligibilityContext {
  equipment: Set<string>
  blockedPatterns: Set<MovementPattern>
  blockedExercises: Set<string>
  maxTechnicalDemand: number
  familiarity: Record<string, ExerciseFamiliarity>
}

export function eligibilityContext(draft: OnboardingDraft): EligibilityContext {
  return {
    equipment: availableEquipment(draft),
    blockedPatterns: blockedPatterns(draft),
    blockedExercises: blockedExerciseIds(draft),
    maxTechnicalDemand: demandCeiling(draft.training.experience),
    familiarity: draft.training.familiarity,
  }
}

/** Why an exercise was rejected, so the UI can explain rather than just hide. */
export type IneligibilityReason =
  | 'equipment'
  | 'blocked_pattern'
  | 'avoided'
  | 'too_technical'
  | null

export function ineligibilityReason(
  exercise: CatalogExercise,
  context: EligibilityContext,
): IneligibilityReason {
  // Order matters for the message the user sees: a movement that hurts is a
  // better explanation than the equipment it happens to need.
  if (context.blockedPatterns.has(exercise.pattern)) return 'blocked_pattern'
  if (context.blockedExercises.has(exercise.id)) return 'avoided'
  if (!canPerform(exercise, context.equipment)) return 'equipment'
  if (exercise.technicalDemand > context.maxTechnicalDemand) return 'too_technical'
  return null
}

export function isEligible(exercise: CatalogExercise, context: EligibilityContext): boolean {
  return ineligibilityReason(exercise, context) === null
}

export function eligibleExercises(draft: OnboardingDraft): CatalogExercise[] {
  const context = eligibilityContext(draft)
  return EXERCISES.filter((exercise) => isEligible(exercise, context))
}

// ---------------------------------------------------------------------------
// Substitutions
// ---------------------------------------------------------------------------

const FAMILIARITY_RANK: Record<ExerciseFamiliarity, number> = {
  regular: 0,
  comfortable: 1,
  unfamiliar: 2,
  // Never ranked — filtered out before scoring — but present so the record is
  // total and adding a familiarity value forces a decision here.
  avoid: 99,
  discomfort: 99,
}

function muscleOverlap(a: readonly MuscleGroup[], b: readonly MuscleGroup[]): number {
  const set = new Set(b)
  return a.filter((muscle) => set.has(muscle)).length
}

/**
 * Ordered replacements for one exercise.
 *
 * A substitution must share the movement pattern: swapping a row for a curl
 * because both "use biceps" would quietly delete the pull from the session.
 * Within the pattern, preference goes to the closest muscle match, then to what
 * the user already knows, then to the simpler lift — a substitution is usually
 * offered mid-session, which is the worst moment to learn something technical.
 */
export function substitutionsFor(
  exerciseId: string,
  draft: OnboardingDraft,
  limit = 3,
): CatalogExercise[] {
  const original = exerciseById(exerciseId)
  if (!original) return []
  const context = eligibilityContext(draft)

  return EXERCISES.filter(
    (candidate) =>
      candidate.id !== original.id &&
      candidate.pattern === original.pattern &&
      isEligible(candidate, context),
  )
    .sort((a, b) => {
      const overlap =
        muscleOverlap(b.primaryMuscles, original.primaryMuscles) -
        muscleOverlap(a.primaryMuscles, original.primaryMuscles)
      if (overlap !== 0) return overlap
      const known =
        FAMILIARITY_RANK[context.familiarity[a.id] ?? 'unfamiliar'] -
        FAMILIARITY_RANK[context.familiarity[b.id] ?? 'unfamiliar']
      if (known !== 0) return known
      return a.technicalDemand - b.technicalDemand
    })
    .slice(0, limit)
}

/** Patterns this user can still train at all, for split planning. */
export function trainablePatterns(draft: OnboardingDraft): Set<MovementPattern> {
  return new Set(eligibleExercises(draft).map((exercise) => exercise.pattern))
}
