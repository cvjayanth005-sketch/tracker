import type { Instant, LocalDate } from '@/domain/types'

/**
 * Versioned onboarding model.
 *
 * Everything the interview collects lands here before any of it reaches the
 * live plan. The draft is deliberately separate from `Settings`, `UserProfile`,
 * and `Phase`: those describe an *active* plan, and an answer that has only
 * been typed into a form must never be mistaken for one the user accepted.
 * `applyOnboardingPlan` remains the single path that activates anything.
 *
 * Nullability follows the app-wide contract: `null` means "not answered", and
 * no field is ever back-filled with a plausible-looking guess. A migration that
 * cannot know an answer writes `null` and the UI asks.
 */

/** Bumped when a stored draft can no longer be read by the current parser. */
export const ONBOARDING_DRAFT_VERSION = 1

export const CHAPTER_IDS = ['about', 'activity', 'goals', 'training', 'food'] as const
export type ChapterId = (typeof CHAPTER_IDS)[number]

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

/** Drives Mifflin-St Jeor only. Named for the calculation, not identity. */
export type CalculationSex = 'male' | 'female' | 'unspecified'
export type UnitPreference = 'metric' | 'imperial'
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'active' | 'very_active'
export type PrimaryGoal = 'fat_loss' | 'muscle_gain' | 'recomposition' | 'maintenance' | 'performance'
export type GoalPace = 'steady' | 'moderate' | 'aggressive'
export type TrainingExperience = 'beginner' | 'returning' | 'intermediate' | 'advanced'
export type TrainingEnvironment =
  | 'commercial_gym'
  | 'home_gym'
  | 'minimal_equipment'
  | 'bodyweight'
  | 'custom'

/**
 * How a user relates to one movement.
 *
 * `avoid` is a preference and `discomfort` is a physical signal. They are kept
 * apart because they justify different behaviour: an avoided lift can be
 * offered again later or swapped freely, whereas discomfort should suppress the
 * whole movement pattern until a human revisits it. Collapsing them into a
 * single "no" would lose the reason and let a substitution reintroduce the
 * exact thing that hurt.
 */
export type ExerciseFamiliarity = 'regular' | 'comfortable' | 'unfamiliar' | 'avoid' | 'discomfort'

/** Familiarity values that must never be prescribed. */
export const BLOCKING_FAMILIARITY: readonly ExerciseFamiliarity[] = ['avoid', 'discomfort']

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'knee_flexion'
  | 'knee_extension'
  | 'hip_abduction'
  | 'calf'
  | 'core_brace'
  | 'core_flexion'
  | 'rotation'
  | 'carry'
  | 'cardio'

export type MuscleGroup =
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'hip_flexors'
  | 'full_body'

export type EquipmentCategory =
  | 'bodyweight'
  | 'free_weight'
  | 'rack_bench'
  | 'cable'
  | 'machine'
  | 'cardio'
  | 'accessory'

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

/** A limitation the plan must respect. Free text plus optional structure. */
export interface HealthLimitation {
  id: string
  /** What the user called it, in their words. */
  label: string
  /** Movement patterns to suppress, when the user could identify them. */
  affectedPatterns: MovementPattern[]
  notes: string | null
}

export interface AboutChapter {
  preferredName: string | null
  birthYear: number | null
  /** Canonical. Imperial input is converted on entry, never stored as inches. */
  heightCm: number | null
  currentWeightKg: number | null
  calculationSex: CalculationSex | null
  units: UnitPreference | null
  timezone: string | null
  limitations: HealthLimitation[]
  accessibilityNeeds: string | null
}

export interface ActivityChapter {
  activityLevel: ActivityLevel | null
  typicalSteps: number | null
  currentExerciseDaysPerWeek: number | null
  availableTrainingDays: number | null
  sessionMinutes: number | null
  typicalSleepHours: number | null
  stress: 1 | 2 | 3 | 4 | 5 | null
  cardioPreferences: string[]
  scheduleNotes: string | null
}

export interface GoalsChapter {
  primaryGoal: PrimaryGoal | null
  secondaryGoals: string[]
  goalWeightKg: number | null
  pace: GoalPace | null
  priorityAreas: string[]
  targetDate: LocalDate | null
  successDefinition: string | null
}

/** A lift the user already knows their numbers on. */
export interface PreviousPerformance {
  exerciseId: string
  weight: number
  unit: 'kg' | 'lb'
  sets: number
  reps: number
  rir: number | null
  date: LocalDate | null
}

export interface TrainingChapter {
  experience: TrainingExperience | null
  environment: TrainingEnvironment | null
  preferredDays: number[]
  sessionMinutes: number | null
  /** Stable ids from the equipment catalogue. Empty means "not answered yet". */
  equipmentIds: string[]
  /** Stable exercise id → how the user relates to it. */
  familiarity: Record<string, ExerciseFamiliarity>
  previousPerformance: PreviousPerformance[]
  stylesLiked: string[]
  stylesDisliked: string[]
}

export interface FoodChapter {
  dietStyle: string | null
  allergies: string[]
  intolerances: string[]
  foodsLiked: string[]
  foodsAvoided: string[]
  proteinSources: string[]
  mealsPerDay: number | null
  cookingMinutes: number | null
  budget: 'low' | 'moderate' | 'flexible' | null
  culturalPreferences: string[]
  supplements: string[]
  knownDeficiencies: string[]
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/** Where the interview stopped, so it reopens exactly there. */
export interface ResumePosition {
  chapter: ChapterId
  /** Field key within the chapter; null means "start of chapter". */
  questionKey: string | null
}

export interface OnboardingDraft {
  id: 'me'
  version: number
  about: AboutChapter
  activity: ActivityChapter
  goals: GoalsChapter
  training: TrainingChapter
  food: FoodChapter
  /** Chapters the user has explicitly finished, in completion order. */
  completedChapters: ChapterId[]
  resume: ResumePosition
  /** Last proposal generated for this draft. Never itself an activation. */
  proposal: GeneratedProposal | null
  createdAt: Instant
  updatedAt: Instant
}

// ---------------------------------------------------------------------------
// Generated proposal contract
// ---------------------------------------------------------------------------

export type ProposalProvider = 'rules' | 'ai'
export type ProposalConfidence = 'low' | 'medium' | 'high'

/** Inclusive numeric band. Targets are ranges wherever a range is honest. */
export interface Range {
  min: number
  max: number
}

export interface ExercisePrescriptionProposal {
  exerciseId: string
  exerciseName: string
  sets: Range
  reps: Range
  /** Reps in reserve to leave in the tank. */
  rir: number
  restSeconds: Range
  /** Equipment this prescription assumes; must be a subset of what the user has. */
  equipmentIds: string[]
  /** Ordered fallbacks, already filtered for equipment and avoidance. */
  substitutionIds: string[]
  rationale: string
}

export interface TrainingDayProposal {
  /** 0 = Sunday, matching DaySchedule.dow elsewhere in the app. */
  dow: number
  name: string
  focus: MovementPattern[]
  exercises: ExercisePrescriptionProposal[]
}

export interface TrainingSplitProposal {
  name: string
  daysPerWeek: number
  sessionMinutes: number
  days: TrainingDayProposal[]
}

export interface NutritionProposal {
  calories: Range
  proteinG: Range
  carbsG: Range
  fatG: Range
  fiberG: Range
  hydrationMl: Range
  mealsPerDay: number
}

export interface PhaseOutlineProposal {
  name: string
  startWeightKg: number
  targetWeightKg: number
  calories: number
  proteinG: number
  steps: number
  estimatedWeeks: number | null
  notes: string | null
}

export interface GeneratedProposal {
  /** Draft version this was generated from; a stale proposal is detectable. */
  inputVersion: number
  provider: ProposalProvider
  confidence: ProposalConfidence
  /** What the generator had to assume because the user had not said. */
  assumptions: string[]
  missingInformation: string[]
  cautions: string[]
  training: TrainingSplitProposal
  nutrition: NutritionProposal
  phases: PhaseOutlineProposal[]
  /**
   * Always true. Present as a field rather than a convention so that any code
   * consuming a proposal has to acknowledge it, and so a serialized proposal
   * that reaches the activation path still carries the requirement with it.
   */
  requiresConfirmation: true
  generatedAt: Instant
}
