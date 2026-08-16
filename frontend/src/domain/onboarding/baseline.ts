import { eligibilityContext, isEligible, substitutionsFor } from './eligibility'
import { EXERCISES, type CatalogExercise } from './catalog/exercises'
import type {
  ActivityLevel,
  ExercisePrescriptionProposal,
  GeneratedProposal,
  GoalPace,
  MovementPattern,
  NutritionProposal,
  OnboardingDraft,
  PhaseOutlineProposal,
  Range,
  TrainingDayProposal,
  TrainingSplitProposal,
} from './types'

/**
 * The deterministic baseline.
 *
 * This is the floor the whole feature stands on: it must produce a complete,
 * safe proposal from the answers alone, with no network and no model. The AI
 * path is an enhancement layered on top, and when it is unavailable — offline,
 * rate limited, or simply wrong — this is what the user gets, not an error.
 *
 * Every number here is either a published formula or a stated policy constant.
 * Nothing is tuned to feel right.
 */

const KCAL_PER_KG = 7700
const now = () => new Date().toISOString()

/** Hard floors. No proposal from any provider may go under these. */
export const SAFETY = {
  /** Below this, adherence collapses and lean mass goes with it. */
  minCaloriesFemale: 1200,
  minCaloriesMale: 1500,
  /** A deficit past this fraction of maintenance is not sustainable. */
  maxDeficitFraction: 0.25,
  /** Protein floor in g per kg of goal bodyweight. */
  minProteinPerKg: 1.6,
  maxProteinPerKg: 2.4,
  minFatPerKg: 0.6,
  minFiberG: 20,
  maxWeeklyLossFraction: 0.01,
} as const

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  active: 1.55,
  very_active: 1.725,
}

const PACE_WEEKLY_KG: Record<GoalPace, number> = {
  steady: 0.4,
  moderate: 0.7,
  aggressive: 1.0,
}

function round(value: number, step = 1): number {
  return Math.round(value / step) * step
}

function range(min: number, max: number): Range {
  return { min: Math.round(min), max: Math.round(max) }
}

/** Mifflin-St Jeor. `unspecified` uses the midpoint of the two constants. */
export function basalMetabolicRate(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: 'male' | 'female' | 'unspecified',
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

export function maintenanceCalories(draft: OnboardingDraft): number | null {
  const { currentWeightKg, heightCm, birthYear, calculationSex } = draft.about
  if (currentWeightKg === null || heightCm === null || birthYear === null || calculationSex === null) {
    return null
  }
  const age = new Date().getUTCFullYear() - birthYear
  const activity = draft.activity.activityLevel ?? 'lightly_active'
  const bmr = basalMetabolicRate(currentWeightKg, heightCm, age, calculationSex)
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activity])
}

/** The absolute calorie floor for this user, before any goal is applied. */
export function calorieFloorFor(draft: OnboardingDraft): number {
  return draft.about.calculationSex === 'female'
    ? SAFETY.minCaloriesFemale
    : SAFETY.minCaloriesMale
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export function buildNutrition(draft: OnboardingDraft): NutritionProposal | null {
  const maintenance = maintenanceCalories(draft)
  const weightKg = draft.about.currentWeightKg
  if (maintenance === null || weightKg === null) return null

  const goal = draft.goals.primaryGoal ?? 'maintenance'
  const pace = draft.goals.pace ?? 'steady'
  const floor = calorieFloorFor(draft)

  let target = maintenance
  if (goal === 'fat_loss' || goal === 'recomposition') {
    const weeklyKg = Math.min(
      PACE_WEEKLY_KG[pace],
      weightKg * SAFETY.maxWeeklyLossFraction,
    )
    const deficit = Math.min(
      (weeklyKg * KCAL_PER_KG) / 7,
      maintenance * SAFETY.maxDeficitFraction,
    )
    target = maintenance - deficit
  } else if (goal === 'muscle_gain') {
    // A surplus large enough to build and small enough not to be mostly fat.
    target = maintenance + (pace === 'aggressive' ? 400 : pace === 'moderate' ? 300 : 200)
  }

  /*
   * A band rather than a single number: daily intake never lands on a point,
   * and a range the user can hit is followed where an exact figure is not.
   *
   * The floors bound the band's *lower* edge, not its centre. The bottom of a
   * recommended range is what someone eats on a strict day, so centring on the
   * cap and then widening downward would put real intake under the limit the
   * cap exists to hold.
   */
  const hardMin = Math.max(floor, maintenance * (1 - SAFETY.maxDeficitFraction))
  const centre = Math.max(hardMin + 100, round(target, 10))
  const calories = range(Math.max(hardMin, centre - 100), centre + 100)

  const goalWeight = draft.goals.goalWeightKg ?? weightKg
  const proteinBasis = Math.max(40, Math.min(goalWeight, weightKg))
  const proteinG = range(
    proteinBasis * SAFETY.minProteinPerKg,
    proteinBasis * SAFETY.maxProteinPerKg,
  )
  const fatMin = weightKg * SAFETY.minFatPerKg
  const fatG = range(fatMin, Math.max(fatMin + 20, (centre * 0.3) / 9))
  // Carbs fill what protein and fat leave, at the midpoint of each band.
  const proteinKcal = ((proteinG.min + proteinG.max) / 2) * 4
  const fatKcal = ((fatG.min + fatG.max) / 2) * 9
  const carbCentre = Math.max(50, (centre - proteinKcal - fatKcal) / 4)
  const carbsG = range(carbCentre * 0.85, carbCentre * 1.15)

  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG: range(SAFETY.minFiberG, Math.max(SAFETY.minFiberG + 10, (centre / 1000) * 14)),
    hydrationMl: range(weightKg * 30, weightKg * 40),
    mealsPerDay: draft.food.mealsPerDay ?? 3,
  }
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

/** Pattern emphasis per split day, ordered by how the session should run. */
const SPLIT_TEMPLATES: Record<number, Array<{ name: string; focus: MovementPattern[] }>> = {
  2: [
    { name: 'Full body A', focus: ['squat', 'horizontal_push', 'horizontal_pull', 'core_brace'] },
    { name: 'Full body B', focus: ['hinge', 'vertical_push', 'vertical_pull', 'core_flexion'] },
  ],
  3: [
    { name: 'Full body A', focus: ['squat', 'horizontal_push', 'horizontal_pull'] },
    { name: 'Full body B', focus: ['hinge', 'vertical_push', 'vertical_pull'] },
    { name: 'Full body C', focus: ['lunge', 'horizontal_push', 'horizontal_pull', 'core_brace'] },
  ],
  4: [
    { name: 'Upper A', focus: ['horizontal_push', 'horizontal_pull', 'elbow_flexion'] },
    { name: 'Lower A', focus: ['squat', 'knee_extension', 'calf'] },
    { name: 'Upper B', focus: ['vertical_push', 'vertical_pull', 'elbow_extension'] },
    { name: 'Lower B', focus: ['hinge', 'knee_flexion', 'core_brace'] },
  ],
  5: [
    { name: 'Push', focus: ['horizontal_push', 'vertical_push', 'elbow_extension'] },
    { name: 'Pull', focus: ['vertical_pull', 'horizontal_pull', 'elbow_flexion'] },
    { name: 'Legs', focus: ['squat', 'hinge', 'calf'] },
    { name: 'Upper', focus: ['horizontal_push', 'horizontal_pull', 'core_brace'] },
    { name: 'Lower', focus: ['lunge', 'knee_flexion', 'knee_extension'] },
  ],
}

function repSchemeFor(exercise: CatalogExercise, goal: string): { sets: Range; reps: Range; rir: number } {
  if (exercise.compound) {
    return goal === 'muscle_gain'
      ? { sets: { min: 3, max: 4 }, reps: { min: 6, max: 10 }, rir: 2 }
      : { sets: { min: 3, max: 4 }, reps: { min: 8, max: 12 }, rir: 2 }
  }
  return { sets: { min: 2, max: 3 }, reps: { min: 10, max: 15 }, rir: 1 }
}

/** Best available exercise for a pattern, favouring what the user knows. */
function pickForPattern(
  pattern: MovementPattern,
  draft: OnboardingDraft,
  used: Set<string>,
): CatalogExercise | null {
  const context = eligibilityContext(draft)
  const candidates = EXERCISES.filter(
    (exercise) =>
      exercise.pattern === pattern && !used.has(exercise.id) && isEligible(exercise, context),
  )
  if (candidates.length === 0) return null
  const rank = (exercise: CatalogExercise): number => {
    const familiarity = context.familiarity[exercise.id]
    if (familiarity === 'regular') return 0
    if (familiarity === 'comfortable') return 1
    return exercise.compound ? 2 : 3
  }
  return [...candidates].sort((a, b) => rank(a) - rank(b) || a.technicalDemand - b.technicalDemand)[0]!
}

export function buildTrainingSplit(draft: OnboardingDraft): TrainingSplitProposal {
  const requested = draft.training.preferredDays.length || draft.activity.availableTrainingDays || 3
  const daysPerWeek = Math.max(2, Math.min(5, requested))
  const template = SPLIT_TEMPLATES[daysPerWeek] ?? SPLIT_TEMPLATES[3]!
  const sessionMinutes = draft.training.sessionMinutes ?? draft.activity.sessionMinutes ?? 60
  // Roughly one exercise per 12 minutes, floored so a short session is still
  // a session rather than a single lift.
  const perDay = Math.max(3, Math.min(6, Math.floor(sessionMinutes / 12)))
  const preferred = draft.training.preferredDays
  const goal = draft.goals.primaryGoal ?? 'maintenance'

  const days: TrainingDayProposal[] = template.map((slot, index) => {
    const used = new Set<string>()
    const exercises: ExercisePrescriptionProposal[] = []
    // Walk the focus list first, then top up from any trainable pattern.
    const patterns = [...slot.focus, ...slot.focus]
    for (const pattern of patterns) {
      if (exercises.length >= perDay) break
      const exercise = pickForPattern(pattern, draft, used)
      if (!exercise) continue
      used.add(exercise.id)
      const scheme = repSchemeFor(exercise, goal)
      /*
       * Name the alternative the user actually owns, not the first one listed.
       * `requiredEquipment` is an OR — a cable row lists both a dedicated row
       * station and a cable machine — so taking the head of the list can claim
       * a machine this user has never had, which the guard then rejects.
       */
      const available = eligibilityContext(draft).equipment
      const usedBase = exercise.requiredEquipment.find((id) => available.has(id))
      exercises.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: scheme.sets,
        reps: scheme.reps,
        rir: scheme.rir,
        restSeconds: exercise.compound ? { min: 120, max: 180 } : { min: 60, max: 90 },
        equipmentIds: [...(usedBase ? [usedBase] : []), ...(exercise.alsoRequires ?? [])],
        substitutionIds: substitutionsFor(exercise.id, draft, 2).map((s) => s.id),
        rationale: exercise.compound
          ? `Anchors the ${pattern.replace(/_/g, ' ')} pattern for this session.`
          : `Adds direct work for ${exercise.primaryMuscles.join(', ')}.`,
      })
    }
    return {
      dow: preferred[index] ?? [1, 3, 5, 2, 4][index] ?? 1,
      name: slot.name,
      focus: slot.focus,
      exercises,
    }
  })

  return { name: `${daysPerWeek}-day split`, daysPerWeek, sessionMinutes, days }
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export function buildPhases(draft: OnboardingDraft, nutrition: NutritionProposal): PhaseOutlineProposal[] {
  const start = draft.about.currentWeightKg
  const goalWeight = draft.goals.goalWeightKg
  const calories = Math.round((nutrition.calories.min + nutrition.calories.max) / 2)
  const proteinG = Math.round((nutrition.proteinG.min + nutrition.proteinG.max) / 2)
  const steps = draft.activity.typicalSteps ?? 8000

  if (start === null || goalWeight === null || goalWeight >= start) {
    return [
      {
        name: 'Phase 1',
        startWeightKg: start ?? 0,
        targetWeightKg: goalWeight ?? start ?? 0,
        calories,
        proteinG,
        steps,
        estimatedWeeks: null,
        notes: null,
      },
    ]
  }

  const totalLoss = start - goalWeight
  const phaseCount = Math.min(4, Math.max(1, Math.round(totalLoss / 5)))
  const per = totalLoss / phaseCount
  const weeklyKg = PACE_WEEKLY_KG[draft.goals.pace ?? 'steady']

  return Array.from({ length: phaseCount }, (_, i) => ({
    name: `Phase ${i + 1}`,
    startWeightKg: Math.round((start - per * i) * 10) / 10,
    targetWeightKg: Math.round((start - per * (i + 1)) * 10) / 10,
    calories,
    proteinG,
    steps,
    estimatedWeeks: Math.ceil(per / weeklyKg),
    notes: null,
  }))
}

// ---------------------------------------------------------------------------
// Full proposal
// ---------------------------------------------------------------------------

/**
 * Everything the interview can conclude on its own.
 *
 * Returns null only when the required answers are absent — the caller should
 * not be asking yet. It never throws and never reaches the network, so it is
 * always available as the fallback.
 */
export function buildBaselineProposal(draft: OnboardingDraft): GeneratedProposal | null {
  const nutrition = buildNutrition(draft)
  if (!nutrition) return null

  const training = buildTrainingSplit(draft)
  const phases = buildPhases(draft, nutrition)

  const assumptions: string[] = []
  const missing: string[] = []
  const cautions: string[] = []

  if (draft.activity.activityLevel === null) assumptions.push('Assumed a lightly active day.')
  if (draft.food.mealsPerDay === null) assumptions.push('Assumed three meals a day.')
  if (draft.training.sessionMinutes === null) assumptions.push('Assumed 60-minute sessions.')
  if (draft.activity.typicalSteps === null) missing.push('Typical daily steps')
  if (draft.goals.goalWeightKg === null) missing.push('Goal weight')
  if (draft.about.limitations.length === 0) missing.push('Injuries or movements to avoid')
  if (Object.keys(draft.training.familiarity).length === 0) {
    missing.push('Exercise familiarity')
    cautions.push('No exercise history given, so the plan favours simpler movements.')
  }

  const maintenance = maintenanceCalories(draft)
  if (maintenance !== null && nutrition.calories.min <= calorieFloorFor(draft)) {
    cautions.push('Calories sit at the safety floor; progress will be slower than the chosen pace.')
  }
  for (const day of training.days) {
    if (day.exercises.length < 3) {
      cautions.push(`${day.name} is short on options with the equipment selected.`)
      break
    }
  }

  // Confidence reflects how much was answered, not how good the plan looks.
  const knownSignals = [
    draft.activity.typicalSteps !== null,
    draft.goals.goalWeightKg !== null,
    Object.keys(draft.training.familiarity).length > 0,
    draft.training.equipmentIds.length > 0,
    draft.activity.typicalSleepHours !== null,
  ].filter(Boolean).length
  const confidence = knownSignals >= 4 ? 'high' : knownSignals >= 2 ? 'medium' : 'low'

  return {
    inputVersion: draft.version,
    provider: 'rules',
    confidence,
    assumptions,
    missingInformation: missing,
    cautions,
    training,
    nutrition,
    phases,
    requiresConfirmation: true,
    generatedAt: now(),
  }
}
