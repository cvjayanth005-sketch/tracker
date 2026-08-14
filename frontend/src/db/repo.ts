import { db, markDirty } from './database'
import { addDays, compareDates } from '@/domain/date'
import type {
  BodyMeasurement,
  DaySchedule,
  DailyLog,
  Exercise,
  LocalDate,
  Meal,
  MealSlot,
  Phase,
  Run,
  RunType,
  Settings,
  Workout,
  WorkoutSet,
} from '@/domain/types'

/**
 * Repository layer. Everything the UI needs from storage goes through here so
 * that write semantics (upsert-by-date, dirty marking, phase resolution) live
 * in one place rather than being re-implemented per screen.
 */

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

function blankLog(date: LocalDate): DailyLog {
  const stamp = now()
  return {
    date,
    weightKg: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    steps: null,
    runKm: null,
    gymDone: null,
    mealsOnPlan: null,
    sleepHours: null,
    energy: null,
    hunger: null,
    soreness: null,
    notes: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export async function getLog(date: LocalDate): Promise<DailyLog | undefined> {
  return db.dailyLogs.get(date)
}

/**
 * Upsert by local date. The morning weigh-in and the evening food/steps entry
 * write to the same row — there is no "submit the day" action to get wrong.
 */
export async function upsertLog(
  date: LocalDate,
  patch: Partial<Omit<DailyLog, 'date' | 'createdAt'>>,
): Promise<DailyLog> {
  const existing = await db.dailyLogs.get(date)
  const next: DailyLog = {
    ...(existing ?? blankLog(date)),
    ...patch,
    date,
    updatedAt: now(),
  }
  await db.dailyLogs.put(next)
  await markDirty()
  return next
}

export async function deleteLog(date: LocalDate): Promise<void> {
  await db.dailyLogs.delete(date)
  await markDirty()
}

export async function allLogs(): Promise<DailyLog[]> {
  const logs = await db.dailyLogs.toArray()
  return logs.sort((a, b) => compareDates(a.date, b.date))
}

/** Logs in an inclusive date range, oldest first. */
export async function logsBetween(from: LocalDate, to: LocalDate): Promise<DailyLog[]> {
  const logs = await db.dailyLogs.where('date').between(from, to, true, true).toArray()
  return logs.sort((a, b) => compareDates(a.date, b.date))
}

/** The window every dashboard read needs: enough history for a 4-week lookback. */
export async function logsForAnalysis(endDate: LocalDate, days = 120): Promise<DailyLog[]> {
  return logsBetween(addDays(endDate, -(days - 1)), endDate)
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

const MEAL_SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
}

/** Meals eaten on a date, ordered by clock time then slot then entry order. */
export async function mealsForDate(date: LocalDate): Promise<Meal[]> {
  const rows = await db.meals.where('date').equals(date).toArray()
  return rows.sort(
    (a, b) =>
      (a.time ?? '').localeCompare(b.time ?? '') ||
      MEAL_SLOT_ORDER[a.slot] - MEAL_SLOT_ORDER[b.slot] ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

export async function mealsBetween(from: LocalDate, to: LocalDate): Promise<Meal[]> {
  const rows = await db.meals.where('date').between(from, to, true, true).toArray()
  return rows.sort(
    (a, b) => compareDates(a.date, b.date) || a.createdAt.localeCompare(b.createdAt),
  )
}

/**
 * Fold the date's meals into its `DailyLog` macro totals. Mirrors
 * `rollUpRunDistance`: a macro is the sum of the meals that recorded it, or
 * null when none did, so an unlogged macro stays "unknown" rather than a fake 0.
 * Only ever called from meal mutations, so purely-manual food days are untouched.
 */
async function rollUpMealTotals(date: LocalDate): Promise<void> {
  const meals = await db.meals.where('date').equals(date).toArray()
  const sum = (pick: (meal: Meal) => number | null): number | null => {
    const known = meals.flatMap((meal) => {
      const value = pick(meal)
      return value === null ? [] : [value]
    })
    return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
  }
  const existing = await db.dailyLogs.get(date)
  await db.dailyLogs.put({
    ...(existing ?? blankLog(date)),
    calories: sum((meal) => meal.calories),
    proteinG: sum((meal) => meal.proteinG),
    carbsG: sum((meal) => meal.carbsG),
    fatG: sum((meal) => meal.fatG),
    fiberG: sum((meal) => meal.fiberG),
    mealsOnPlan: meals.length === 0 ? null : meals.length,
    updatedAt: now(),
  })
}

export async function addMeal(
  date: LocalDate,
  slot: MealSlot,
  partial: Partial<Omit<Meal, 'id' | 'date' | 'slot' | 'createdAt' | 'updatedAt'>> = {},
  source: Meal['source'] = 'manual',
): Promise<Meal> {
  const stamp = now()
  const meal: Meal = {
    id: uid(),
    date,
    slot,
    name: '',
    time: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    notes: null,
    source,
    createdAt: stamp,
    updatedAt: stamp,
    ...partial,
  }
  await db.transaction('rw', db.meals, db.dailyLogs, async () => {
    await db.meals.put(meal)
    await rollUpMealTotals(date)
  })
  await markDirty()
  return meal
}

export async function updateMeal(
  id: string,
  patch: Partial<Omit<Meal, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = await db.meals.get(id)
  if (!existing) return
  const next: Meal = { ...existing, ...patch, id, updatedAt: now() }
  await db.transaction('rw', db.meals, db.dailyLogs, async () => {
    await db.meals.put(next)
    await rollUpMealTotals(existing.date)
    if (next.date !== existing.date) await rollUpMealTotals(next.date)
  })
  await markDirty()
}

export async function deleteMeal(id: string): Promise<void> {
  const existing = await db.meals.get(id)
  if (!existing) return
  await db.transaction('rw', db.meals, db.dailyLogs, async () => {
    await db.meals.delete(id)
    await rollUpMealTotals(existing.date)
  })
  await markDirty()
}

/** Save a batch of AI-parsed meals for one date in a single version bump. */
export async function addMeals(
  date: LocalDate,
  drafts: Array<Pick<Meal, 'slot'> & Partial<Omit<Meal, 'id' | 'date' | 'createdAt' | 'updatedAt'>>>,
  source: Meal['source'] = 'ai',
): Promise<Meal[]> {
  if (drafts.length === 0) return []
  const stamp = now()
  const meals: Meal[] = drafts.map((draft) => ({
    id: uid(),
    date,
    name: '',
    time: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    notes: null,
    source,
    ...draft,
    createdAt: stamp,
    updatedAt: stamp,
  }))
  await db.transaction('rw', db.meals, db.dailyLogs, async () => {
    await db.meals.bulkPut(meals)
    await rollUpMealTotals(date)
  })
  await markDirty()
  return meals
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

export async function upsertMeasurement(
  date: LocalDate,
  patch: Partial<Omit<BodyMeasurement, 'date'>>,
): Promise<void> {
  const existing = await db.measurements.get(date)
  await db.measurements.put({
    date,
    waistCm: null,
    chestCm: null,
    hipsCm: null,
    thighCm: null,
    armCm: null,
    ...existing,
    ...patch,
    updatedAt: now(),
  })
  await markDirty()
}

export async function allMeasurements(): Promise<BodyMeasurement[]> {
  const rows = await db.measurements.toArray()
  return rows.sort((a, b) => compareDates(a.date, b.date))
}

export async function getMeasurement(date: LocalDate): Promise<BodyMeasurement | undefined> {
  return db.measurements.get(date)
}

// ---------------------------------------------------------------------------
// Settings and phases
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('settings')
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const existing = await db.settings.get('settings')
  if (!existing) return
  await db.settings.put({ ...existing, ...patch, id: 'settings', updatedAt: now() })
  await markDirty()
}

export interface OnboardingPlanDraft {
  profile: {
    name: string | null
    birthYear: number | null
    heightCm: number | null
    startWeightKg: number
    goalWeightKg: number
  }
  planStartDate: LocalDate
  targets: {
    calories: number
    proteinG: number
    steps: number
    sleepHours: number
    gymDaysPerWeek: number
    weeklyRunKmTarget: number | null
  }
  phases: Array<{
    name: string
    startWeightKg: number
    targetWeightKg: number
    calories: number
    proteinG: number
    steps: number
    weeklyRunKmTarget: number | null
    notes: string | null
  }>
}

function weeklySchedule(gymDaysPerWeek: number, weeklyRunKmTarget: number | null): DaySchedule[] {
  const gymDays = gymDaysPerWeek >= 4 ? [1, 2, 4, 5] : gymDaysPerWeek === 3 ? [1, 3, 5] : [1, 4]
  const runDays = [0, 3, 6]
  const runKm = weeklyRunKmTarget && weeklyRunKmTarget > 0 ? Math.max(1, Math.round((weeklyRunKmTarget / runDays.length) * 10) / 10) : null
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((dow) => {
    const gym = gymDays.includes(dow)
    const run = runDays.includes(dow)
    return {
      dow,
      gym,
      sessionType: gym ? (dow === 2 || dow === 5 ? 'lower' : 'upper') : run ? 'run' : 'rest',
      runKm: run ? runKm : null,
      runType: run ? (dow === 0 ? 'long' : 'easy') : null,
    }
  })
}

export async function applyOnboardingPlan(draft: OnboardingPlanDraft): Promise<void> {
  const stamp = now()
  const schedule = weeklySchedule(
    draft.targets.gymDaysPerWeek,
    draft.targets.weeklyRunKmTarget,
  )
  const phases: Phase[] = draft.phases.map((phase, index) => ({
    id: `phase-${index + 1}`,
    order: index + 1,
    name: phase.name || `Phase ${index + 1}`,
    startWeightKg: phase.startWeightKg,
    targetWeightKg: phase.targetWeightKg,
    targetWaistCm: null,
    calories: phase.calories,
    proteinG: phase.proteinG,
    steps: phase.steps,
    sleepHours: draft.targets.sleepHours,
    mealsPerDay: 4,
    weeklyRunKmTarget: phase.weeklyRunKmTarget,
    schedule,
    startedOn: index === 0 ? draft.planStartDate : null,
    endedOn: null,
    calorieCutsApplied: 0,
    notes: phase.notes,
  }))
  await db.transaction('rw', db.profile, db.settings, db.phases, async () => {
    await db.profile.put({
      id: 'me',
      name: draft.profile.name,
      heightCm: draft.profile.heightCm,
      birthYear: draft.profile.birthYear,
      startWeightKg: draft.profile.startWeightKg,
      goalWeightKg: draft.profile.goalWeightKg,
      updatedAt: stamp,
    })
    const existing = await db.settings.get('settings')
    if (!existing) throw new Error('Settings are not initialized.')
    await db.settings.put({
      ...existing,
      planStartDate: draft.planStartDate,
      onboardingCompleted: true,
      calorieFloor: Math.min(existing.calorieFloor, Math.max(1200, draft.targets.calories - 350)),
      updatedAt: stamp,
    })
    await db.phases.clear()
    await db.phases.bulkPut(phases)
  })
  await markDirty()
}

export async function allPhases(): Promise<Phase[]> {
  const phases = await db.phases.toArray()
  return phases.sort((a, b) => a.order - b.order)
}

/**
 * The phase in effect today: a manual override if one is set, otherwise the
 * lowest-order phase that has not been marked ended.
 */
export function resolveActivePhase(
  phases: Phase[],
  settings: Settings | undefined,
): Phase | undefined {
  const ordered = [...phases].sort((a, b) => a.order - b.order)
  if (settings?.manualPhaseOverrideId) {
    const forced = ordered.find((p) => p.id === settings.manualPhaseOverrideId)
    if (forced) return forced
  }
  return ordered.find((p) => p.endedOn === null) ?? ordered[ordered.length - 1]
}

/**
 * The phase that was in effect on a past date, so recomputing an old week uses
 * the targets that were live then rather than today's.
 *
 * Falls back to the earliest phase for dates before any phase was started —
 * imported history predates the app itself.
 */
export function resolvePhaseForDate(phases: Phase[], date: LocalDate): Phase | undefined {
  const ordered = [...phases].sort((a, b) => a.order - b.order)
  const first = ordered[0]
  const match = ordered.find((p) => {
    if (p.startedOn && compareDates(date, p.startedOn) < 0) return false
    // `endedOn` is the first day the next phase is active, so the old phase's
    // range is end-exclusive. Phase 1 has an open beginning for imported data.
    if (p.endedOn && compareDates(date, p.endedOn) >= 0) return false
    return p.startedOn !== null || p.id === first?.id
  })
  if (match) return match
  return ordered.find((p) => p.endedOn === null) ?? ordered[0]
}

/** Merge imported facts by date and bump the document version once. */
export async function importDailyLogs(rows: DailyLog[]): Promise<number> {
  if (rows.length === 0) return 0
  await db.transaction('rw', db.dailyLogs, async () => {
    for (const incoming of rows) {
      const existing = await db.dailyLogs.get(incoming.date)
      await db.dailyLogs.put({
        ...(existing ?? blankLog(incoming.date)),
        ...Object.fromEntries(
          Object.entries(incoming).filter(([, value]) => value !== null),
        ),
        date: incoming.date,
        createdAt: existing?.createdAt ?? incoming.createdAt,
        updatedAt: now(),
      })
    }
  })
  await markDirty()
  return rows.length
}

export async function updatePhase(id: string, patch: Partial<Phase>): Promise<void> {
  const existing = await db.phases.get(id)
  if (!existing) return
  await db.phases.put({ ...existing, ...patch, id })
  await markDirty()
}

/**
 * Apply a recommended calorie target. Separate from `updatePhase` because it
 * also increments the per-phase cut counter — the counter must only move when
 * a cut is actually accepted, never when the engine merely suggests one.
 */
export async function applyCalorieChange(
  phaseId: string,
  newCalories: number,
): Promise<void> {
  const phase = await db.phases.get(phaseId)
  if (!phase) return
  const isCut = newCalories < phase.calories
  await db.phases.put({
    ...phase,
    calories: newCalories,
    calorieCutsApplied: isCut ? phase.calorieCutsApplied + 1 : phase.calorieCutsApplied,
  })
  await markDirty()
}

/** Close the current phase and open the next one. Only ever user-initiated. */
export async function advancePhase(currentId: string, today: LocalDate): Promise<void> {
  const phases = await allPhases()
  const current = phases.find((p) => p.id === currentId)
  if (!current) return
  const next = phases.find((p) => p.order === current.order + 1)
  await db.transaction('rw', db.phases, db.settings, async () => {
    await db.phases.put({ ...current, endedOn: today })
    if (next) await db.phases.put({ ...next, startedOn: today })
    const settings = await db.settings.get('settings')
    if (settings?.manualPhaseOverrideId) {
      await db.settings.put({ ...settings, manualPhaseOverrideId: null, updatedAt: now() })
    }
  })
  await markDirty()
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export async function allExercises(): Promise<Exercise[]> {
  const rows = await db.exercises.toArray()
  return rows.filter((e) => !e.archived).sort((a, b) => a.order - b.order)
}

export async function upsertExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise)
  await markDirty()
}

export async function getWorkoutForDate(date: LocalDate): Promise<Workout | undefined> {
  const rows = await db.workouts.where('date').equals(date).toArray()
  return rows[0]
}

export async function startWorkout(
  date: LocalDate,
  sessionType: Workout['sessionType'],
): Promise<Workout> {
  const existing = await getWorkoutForDate(date)
  if (existing) return existing
  const workout: Workout = {
    id: uid(),
    date,
    sessionType,
    startedAt: now(),
    finishedAt: null,
    notes: null,
  }
  await db.workouts.put(workout)
  await markDirty()
  return workout
}

export async function updateWorkout(id: string, patch: Partial<Workout>): Promise<void> {
  const existing = await db.workouts.get(id)
  if (!existing) return
  await db.workouts.put({ ...existing, ...patch, id })
  await markDirty()
}

export async function setsForWorkout(workoutId: string): Promise<WorkoutSet[]> {
  const rows = await db.workoutSets.where('workoutId').equals(workoutId).toArray()
  return rows.sort((a, b) => a.setNumber - b.setNumber)
}

export async function addSet(
  workoutId: string,
  exerciseId: string,
  partial: Partial<WorkoutSet> = {},
): Promise<WorkoutSet> {
  const existing = await db.workoutSets
    .where('workoutId')
    .equals(workoutId)
    .and((s) => s.exerciseId === exerciseId)
    .toArray()
  const set: WorkoutSet = {
    id: uid(),
    workoutId,
    exerciseId,
    setNumber: existing.length + 1,
    weightKg: null,
    reps: null,
    rir: null,
    isWarmup: false,
    createdAt: now(),
    ...partial,
  }
  await db.workoutSets.put(set)
  await markDirty()
  return set
}

export async function updateSet(id: string, patch: Partial<WorkoutSet>): Promise<void> {
  const existing = await db.workoutSets.get(id)
  if (!existing) return
  await db.workoutSets.put({ ...existing, ...patch, id })
  await markDirty()
}

export async function deleteSet(id: string): Promise<void> {
  const set = await db.workoutSets.get(id)
  if (!set) return
  await db.workoutSets.delete(id)
  // Renumber what is left so set numbers stay 1..n for the exercise.
  const remaining = await db.workoutSets
    .where('workoutId')
    .equals(set.workoutId)
    .and((s) => s.exerciseId === set.exerciseId)
    .toArray()
  remaining.sort((a, b) => a.setNumber - b.setNumber)
  await Promise.all(
    remaining.map((s, i) => db.workoutSets.update(s.id, { setNumber: i + 1 })),
  )
  await markDirty()
}

/** Recent sessions with their sets, newest first — the input to progression. */
export async function recentSessions(limit = 40) {
  const workouts = (await db.workouts.toArray()).sort((a, b) =>
    compareDates(b.date, a.date),
  )
  const slice = workouts.slice(0, limit)
  const sets = await db.workoutSets
    .where('workoutId')
    .anyOf(slice.map((w) => w.id))
    .toArray()
  return slice.map((workout) => ({
    workout,
    sets: sets.filter((s) => s.workoutId === workout.id),
  }))
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

async function rollUpRunDistance(date: LocalDate): Promise<void> {
  const runs = await db.runs.where('date').equals(date).toArray()
  const known = runs.flatMap((run) =>
    run.distanceKm === null ? [] : [run.distanceKm],
  )
  const runKm = known.length === 0 ? null : known.reduce((sum, km) => sum + km, 0)
  const existing = await db.dailyLogs.get(date)
  await db.dailyLogs.put({
    ...(existing ?? blankLog(date)),
    runKm,
    updatedAt: now(),
  })
}

export async function addRun(
  date: LocalDate,
  type: RunType,
  partial: Partial<Pick<Run, 'distanceKm' | 'durationMin' | 'rpe' | 'avgHr' | 'notes'>> = {},
): Promise<Run> {
  const stamp = now()
  const run: Run = {
    id: uid(),
    date,
    type,
    distanceKm: null,
    durationMin: null,
    rpe: null,
    avgHr: null,
    notes: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...partial,
  }
  await db.transaction('rw', db.runs, db.dailyLogs, async () => {
    await db.runs.put(run)
    await rollUpRunDistance(date)
  })
  await markDirty()
  return run
}

export async function updateRun(id: string, patch: Partial<Omit<Run, 'id' | 'createdAt'>>): Promise<void> {
  const existing = await db.runs.get(id)
  if (!existing) return
  const next: Run = { ...existing, ...patch, id, updatedAt: now() }
  await db.transaction('rw', db.runs, db.dailyLogs, async () => {
    await db.runs.put(next)
    await rollUpRunDistance(existing.date)
    if (next.date !== existing.date) await rollUpRunDistance(next.date)
  })
  await markDirty()
}

export async function deleteRun(id: string): Promise<void> {
  const existing = await db.runs.get(id)
  if (!existing) return
  await db.transaction('rw', db.runs, db.dailyLogs, async () => {
    await db.runs.delete(id)
    await rollUpRunDistance(existing.date)
  })
  await markDirty()
}

export async function runsBetween(from: LocalDate, to: LocalDate): Promise<Run[]> {
  const rows = await db.runs.where('date').between(from, to, true, true).toArray()
  return rows.sort((a, b) =>
    compareDates(a.date, b.date) || a.createdAt.localeCompare(b.createdAt),
  )
}

export async function runsForDate(date: LocalDate): Promise<Run[]> {
  return runsBetween(date, date)
}

export async function recentRuns(limit = 80): Promise<Run[]> {
  const rows = await db.runs.orderBy('date').reverse().limit(limit).toArray()
  return rows.sort((a, b) =>
    compareDates(a.date, b.date) || a.createdAt.localeCompare(b.createdAt),
  )
}
