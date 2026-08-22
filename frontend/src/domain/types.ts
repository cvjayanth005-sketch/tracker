/**
 * Domain types. Pure data — no IO, no React, no Dexie.
 *
 * Nullability contract, applied everywhere in this file:
 *   `null`      = the value is genuinely UNKNOWN (not logged).
 *   `0`         = a real, logged zero (e.g. actually walked 0 steps).
 *   `undefined` = never used for metrics; reserved for optional record fields.
 *
 * Every average, rate and compliance figure in the app must skip `null`
 * rather than coerce it to 0, and must say so in its denominator rule.
 */

/** A local calendar date, `YYYY-MM-DD`. Never a UTC timestamp. */
export type LocalDate = string & { readonly __brand: 'LocalDate' }

/** An ISO-8601 instant, used only for record bookkeeping, never for "which day". */
export type Instant = string

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

// ---------------------------------------------------------------------------
// Profile, phases, settings
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: 'me'
  name: string | null
  heightCm: number | null
  birthYear: number | null
  startWeightKg: number | null
  goalWeightKg: number | null
  updatedAt: Instant
}

export type SessionType = 'upper' | 'lower' | 'full' | 'run' | 'rest'
export type RunType = 'recovery' | 'easy' | 'long' | 'tempo' | 'intervals'

/**
 * What a given weekday is supposed to contain. Drives compliance denominators:
 * a missed gym day only counts against you if the day was scheduled.
 */
export interface DaySchedule {
  dow: DayOfWeek
  gym: boolean
  sessionType: SessionType
  runKm: number | null
  runType: RunType | null
}

/**
 * A phase of the plan. Targets are versioned by phase (and by the phase's
 * effective date range) so that recomputing an old week uses the targets that
 * were live *then*, not today's.
 */
export interface Phase {
  id: string
  order: number
  name: string
  /** Entry/exit weights in kg. Exit is the trend-weight threshold to review at. */
  startWeightKg: number
  targetWeightKg: number
  targetWaistCm: number | null
  calories: number
  proteinG: number
  steps: number
  sleepHours: number
  mealsPerDay: number
  weeklyRunKmTarget: number | null
  schedule: DaySchedule[]
  /** Set when the phase actually became active / was left. Null = not yet. */
  startedOn: LocalDate | null
  endedOn: LocalDate | null
  /** Cumulative calorie cuts recommended *within this phase*. Resets per phase. */
  calorieCutsApplied: number
  notes: string | null
}

export interface Settings {
  id: 'settings'
  timezone: string
  /** First day of the user's plan. Required before the dashboard opens. */
  planStartDate: LocalDate | null
  /** New accounts stay in AI onboarding until a reviewed plan is accepted. */
  onboardingCompleted: boolean
  /** Hard lower bound on any recommended calorie target. */
  calorieFloor: number
  /** Target weekly loss band, kg/week, both positive numbers. */
  targetLossPerWeekMin: number
  targetLossPerWeekMax: number
  /** Above this weekly loss rate the plan is too aggressive. */
  fastLossPerWeekThreshold: number
  /** Below this, a compliant week counts as a plateau. */
  plateauLossPerWeekThreshold: number
  /** Consecutive plateau weeks before a cut is suggested. */
  plateauWeeksBeforeCut: number
  /** Max cuts suggested per phase before switching to an adherence review. */
  maxCalorieCutsPerPhase: number
  /** Days trend weight must hold under target before offering phase review. */
  phaseHoldDays: number
  /** Minimum non-null readings in a 7-day window for an average to be valid. */
  minReadingsPerWindow: number
  /** Compliance at or above this counts as "good adherence". */
  goodCompliancePct: number
  manualPhaseOverrideId: string | null
  updatedAt: Instant
}

// ---------------------------------------------------------------------------
// Daily facts
// ---------------------------------------------------------------------------

/** Subjective 1-5 scales. Null = not rated. */
export type Rating = 1 | 2 | 3 | 4 | 5
/** `4` is displayed as 4+ in the morning sleep check-in. */
export type NightAwakenings = 0 | 1 | 2 | 3 | 4

/**
 * One row per local calendar date, upserted throughout the day — morning weight
 * and evening activity write to the same record.
 */
export interface DailyLog {
  date: LocalDate
  weightKg: number | null
  /**
   * Macro totals for the day. When the day has `Meal` rows these are rolled up
   * from them (see `rollUpMealTotals`); otherwise they hold a manually entered
   * daily figure. Either way the dashboard reads only these fields, so meal-level
   * logging and the older single-number entry stay interchangeable.
   */
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  /** Micronutrient totals rolled up from the day's meals. See `Meal.micros`. */
  micros: Record<string, number> | null
  /**
   * Water is a running daily total. Sodium, alcohol, and caffeine are manual
   * additions; FoodContext combines them with the values attached to logged
   * meals so the displayed daily total stays attributable and editable.
   */
  waterMl: number | null
  sodiumMg: number | null
  alcoholUnits: number | null
  caffeineMg: number | null
  /**
   * User's "done eating for the day" flag. `true` = the food log is final and
   * safe to judge; `null` = still in progress. Lets the coach avoid mistaking a
   * half-logged day for a genuinely low-calorie one.
   */
  foodComplete: boolean | null
  steps: number | null
  runKm: number | null
  /** Null = unknown whether a session happened; false = confirmed no session. */
  gymDone: boolean | null
  mealsOnPlan: number | null
  sleepHours: number | null
  /** Morning-rated sleep quality, where 1 is poor and 5 is excellent. */
  sleepQuality: Rating | null
  /** Local bedtime in HH:mm. Kept as entered so no timezone conversion can drift it. */
  sleepBedtime: string | null
  /** Local wake time in HH:mm, recorded against the wake date. */
  sleepWakeTime: string | null
  /** 4 represents four or more awakenings. */
  nightAwakenings: NightAwakenings | null
  energy: Rating | null
  hunger: Rating | null
  soreness: Rating | null
  stress: Rating | null
  trainingMinutesAvailable: number | null
  trainingConstraints: string | null
  notes: string | null
  createdAt: Instant
  updatedAt: Instant
}

/** Which part of the day a meal belongs to. Drives the timeline ordering. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/**
 * One eaten meal. Many rows per date, unlike the single-row `DailyLog`. This is
 * the detailed food record the AI coach reads to reason about physique: named
 * dishes, per-meal macros, and how they were captured. Individual meals roll up
 * into the day's `DailyLog` macro totals (see `rollUpMealTotals`).
 */
export interface Meal {
  id: string
  date: LocalDate
  slot: MealSlot
  /** Free-text description of the dish(es), e.g. "Chicken rice bowl + yogurt". */
  name: string
  /** Local clock time `HH:mm`, or null when not recorded. */
  time: string | null
  /**
   * Portion the macros describe — amount plus a free unit (`g`, `ml`, `piece`,
   * `cup`, `serving`…). Recorded so a portion the coach or user changes has a
   * basis, and so the AI estimate is anchored to a real quantity instead of a
   * blind guess. Descriptive only; macros are not auto-scaled from it.
   */
  quantity: number | null
  unit: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  /** Quality sub-macros: sugar (of the carbs) and saturated fat (of the fat). */
  sugarG: number | null
  satFatG: number | null
  /**
   * Micronutrients as a flexible map keyed by `<name><Unit>` (e.g. `potassiumMg`,
   * `vitaminDMcg`). A map rather than fixed columns so any nutrient the parser
   * knows can be captured without a schema change. Null = none recorded.
   */
  micros: Record<string, number> | null
  /** Meal-derived extras, rolled into Food context with any manual daily additions. */
  caffeineMg: number | null
  sodiumMg: number | null
  alcoholUnits: number | null
  notes: string | null
  /** How the macros were captured: hand-entered, or estimated by the AI parser. */
  source: 'manual' | 'ai'
  /**
   * Foods saved together (one Estimate / Save) share this so the timeline can
   * show one meal with components. Absent on rows logged before grouping.
   */
  groupId?: string
  createdAt: Instant
  updatedAt: Instant
}

/**
 * A reusable food the user has saved to their library. Logging from a saved
 * food copies these macros verbatim into a `Meal`, so the same dish reads the
 * same every time — which is what makes repeated days comparable and the coach's
 * averages trustworthy. `useCount`/`lastUsedAt` drive the "recent"/"favourite"
 * ordering.
 */
export interface SavedFood {
  id: string
  name: string
  /** Remembered default slot, so a saved breakfast lands in breakfast. */
  defaultSlot: MealSlot | null
  /** Remembered default portion, carried onto each logged repeat. */
  quantity: number | null
  unit: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  micros: Record<string, number> | null
  caffeineMg: number | null
  sodiumMg: number | null
  alcoholUnits: number | null
  useCount: number
  lastUsedAt: Instant | null
  createdAt: Instant
  updatedAt: Instant
}

export interface BodyMeasurement {
  date: LocalDate
  waistCm: number | null
  chestCm: number | null
  hipsCm: number | null
  thighCm: number | null
  armCm: number | null
  updatedAt: Instant
}

/**
 * The human context behind a week of training. These signals are intentionally
 * separate from daily metrics so the coach can distinguish a data trend from
 * the reason training felt easy or difficult.
 */
export type WeeklyIntent = 'build' | 'maintain' | 'recover'

export interface WeeklyCheckIn {
  id: string
  weekStart: LocalDate
  win: string | null
  friction: string | null
  intent: WeeklyIntent | null
  updatedAt: Instant
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string
  name: string
  /** Which session template it belongs to. */
  sessionType: Exclude<SessionType, 'rest' | 'run'>
  /** Double-progression rep range, inclusive. */
  repRangeMin: number
  repRangeMax: number
  targetSets: number
  /** Reps in reserve to stay at; a set at or below this counts as hard enough. */
  targetRir: number
  /** kg added when progression triggers. */
  loadIncrementKg: number
  order: number
  archived: boolean
}

export interface Workout {
  id: string
  date: LocalDate
  sessionType: Exclude<SessionType, 'rest'>
  startedAt: Instant | null
  finishedAt: Instant | null
  notes: string | null
  prescription: WorkoutPrescription | null
}

export type ReadinessBand = 'ready' | 'steady' | 'reduce' | 'insufficient'
export type DataConfidence = 'high' | 'medium' | 'low'

export interface ExercisePrescription {
  exerciseId: string
  exerciseName: string
  targetSets: number
  repRangeMin: number
  repRangeMax: number
  targetRir: number
  suggestedWeightKg: number | null
  action: 'increase' | 'hold' | 'reduce' | 'establish'
  reason: string
}

/** A reviewed, executable recommendation. Free-form chat never mutates this. */
export interface WorkoutPrescription {
  version: 1
  generatedAt: Instant
  sessionType: Exclude<SessionType, 'rest' | 'run'>
  readinessScore: number | null
  readinessBand: ReadinessBand
  confidence: DataConfidence
  headline: string
  adjustments: string[]
  exercises: ExercisePrescription[]
}

export interface WorkoutSet {
  id: string
  workoutId: string
  exerciseId: string
  /** 1-based index within the exercise for this workout. */
  setNumber: number
  weightKg: number | null
  reps: number | null
  rir: number | null
  /** Warm-ups are excluded from progression maths. */
  isWarmup: boolean
  createdAt: Instant
}

export interface Run {
  id: string
  date: LocalDate
  type: RunType
  distanceKm: number | null
  durationMin: number | null
  /** Subjective effort from 1-10. Null means it was not rated. */
  rpe: number | null
  avgHr: number | null
  notes: string | null
  createdAt: Instant
  updatedAt: Instant
}

// ---------------------------------------------------------------------------
// AI note cache
// ---------------------------------------------------------------------------

/**
 * Cached coaching note. `hash` covers the state summary *and* the prompt and
 * rules versions, so editing either invalidates every cached note.
 */
export interface AiNote {
  hash: string
  promptVersion: string
  rulesVersion: string
  summaryJson: string
  note: string
  createdAt: Instant
}
