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

/**
 * One row per local calendar date, upserted throughout the day — morning weight
 * and evening activity write to the same record.
 */
export interface DailyLog {
  date: LocalDate
  weightKg: number | null
  calories: number | null
  proteinG: number | null
  steps: number | null
  runKm: number | null
  /** Null = unknown whether a session happened; false = confirmed no session. */
  gymDone: boolean | null
  mealsOnPlan: number | null
  sleepHours: number | null
  energy: Rating | null
  hunger: Rating | null
  soreness: Rating | null
  notes: string | null
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
