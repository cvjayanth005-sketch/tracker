import { addDays, compareDates } from '@/domain/date'
import { outcomeFor } from '@/domain/compliance'
import type { DailyLog, LocalDate, Meal, MealSlot, Phase, UserProfile } from '@/domain/types'

/**
 * The detailed nutrition picture the AI coach reasons over. Pure and
 * dependency-free so it is unit-testable and shared by the coach chat and the
 * Food page hero — both must judge food from exactly the same numbers.
 *
 * Every field follows the domain nullability contract: `null` means "not
 * logged / unknown", never a stand-in zero.
 */

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

export interface MacroSplit {
  proteinPct: number
  carbsPct: number
  fatPct: number
}

export interface MacroTargets {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** Fraction of the calorie budget assigned to dietary fat when deriving targets. */
const FAT_TARGET_KCAL_SHARE = 0.27

/**
 * Ring targets from the two numbers the plan actually sets. Protein and calories
 * come from the phase; fat takes a fixed share of the calorie budget and carbs
 * fill whatever calories remain — a reasonable default for a physique goal that
 * the user can refine later.
 */
export function deriveMacroTargets(calories: number, proteinG: number): MacroTargets {
  const fatG = Math.round((calories * FAT_TARGET_KCAL_SHARE) / 9)
  const carbsKcal = Math.max(0, calories - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat)
  return { calories, proteinG, carbsG: Math.round(carbsKcal / KCAL_PER_G.carbs), fatG }
}

export interface FoodContextMeal {
  slot: MealSlot
  name: string
  time: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
}

export interface FoodContext {
  date: LocalDate
  physiqueGoal: {
    direction: 'lose' | 'gain' | 'maintain'
    startWeightKg: number | null
    goalWeightKg: number | null
    currentWeightKg: number | null
  } | null
  targets: { calories: number; proteinG: number; mealsPerDay: number }
  /** Per-macro gram targets for the daily rings. Carbs/fat are derived. */
  macroTargets: MacroTargets
  today: {
    logged: boolean
    mealCount: number
    calories: number | null
    proteinG: number | null
    carbsG: number | null
    fatG: number | null
    fiberG: number | null
    caloriesRemaining: number | null
    proteinRemaining: number | null
    /** Energy share of each macro, from grams. Null until macros are logged. */
    macroSplitPct: MacroSplit | null
    meals: FoodContextMeal[]
    /** Protein grams by slot, so the coach can see back-loaded protein. */
    proteinBySlot: Record<MealSlot, number | null>
    /** Cheap intake proxies that explain scale moves without a wearable. */
    hydration: {
      waterMl: number | null
      targetMl: number
      sodiumMg: number | null
      alcoholUnits: number | null
      caffeineMg: number | null
    }
    /** Meal-timing span from logged clock times. Null until a timed meal exists. */
    eatingWindow: { firstMealTime: string; lastMealTime: string; windowHours: number } | null
  }
  weekAverages: {
    days: number
    calories: number | null
    proteinG: number | null
    carbsG: number | null
    fatG: number | null
  }
  observations: string[]
}

function round(value: number, dp = 0): number {
  const factor = 10 ** dp
  return Math.round(value * factor) / factor
}

/** Mean of the non-null values, or null when none were logged. */
function meanOf(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null)
  if (known.length === 0) return null
  return round(known.reduce((sum, value) => sum + value, 0) / known.length)
}

function macroSplit(proteinG: number | null, carbsG: number | null, fatG: number | null): MacroSplit | null {
  const p = (proteinG ?? 0) * KCAL_PER_G.protein
  const c = (carbsG ?? 0) * KCAL_PER_G.carbs
  const f = (fatG ?? 0) * KCAL_PER_G.fat
  const total = p + c + f
  if (total <= 0) return null
  return {
    proteinPct: round((p / total) * 100),
    carbsPct: round((c / total) * 100),
    fatPct: round((f / total) * 100),
  }
}

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** ml of water per kg of bodyweight used to size the daily hydration target. */
const WATER_ML_PER_KG = 35
const DEFAULT_WATER_TARGET_ML = 2500

/** Minutes since midnight for an `HH:mm` string, or null if unparseable. */
function minutesOfDay(time: string | null): number | null {
  if (!time) return null
  const [hour = '', minute = ''] = time.split(':')
  const h = Number(hour)
  const m = Number(minute)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export interface EatingWindow {
  firstMealTime: string
  lastMealTime: string
  windowHours: number
}

/** Hydration target in ml for a given bodyweight (or the default when unknown). */
export function waterTargetForWeight(weightKg: number | null | undefined): number {
  return weightKg ? Math.round(weightKg * WATER_ML_PER_KG) : DEFAULT_WATER_TARGET_ML
}

export function computeEatingWindow(meals: Meal[]): EatingWindow | null {
  const timed = meals
    .map((meal) => ({ time: meal.time, minutes: minutesOfDay(meal.time) }))
    .filter((entry): entry is { time: string; minutes: number } => entry.minutes !== null)
  if (timed.length < 2) {
    // A single timed meal still tells us when eating started/ended.
    if (timed.length === 1) {
      return { firstMealTime: timed[0]!.time, lastMealTime: timed[0]!.time, windowHours: 0 }
    }
    return null
  }
  const sorted = [...timed].sort((a, b) => a.minutes - b.minutes)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  return {
    firstMealTime: first.time,
    lastMealTime: last.time,
    windowHours: round((last.minutes - first.minutes) / 60, 1),
  }
}

export type ConsistencyStatus = 'on' | 'off' | 'none'
export interface ConsistencyDay {
  date: LocalDate
  status: ConsistencyStatus
}
export interface ConsistencyStrip {
  days: ConsistencyDay[]
  streak: number
}

/**
 * Per-day nutrition adherence over a trailing window, plus the current streak.
 * A day is `on` when both calories and protein hit target, `off` when logged but
 * short, `none` when no food was recorded. The streak counts consecutive `on`
 * days ending at the most recent one, without penalizing an unlogged today.
 */
export function buildConsistencyStrip(
  today: LocalDate,
  logs: DailyLog[],
  phase: Phase,
  windowDays = 14,
): ConsistencyStrip {
  const byDate = new Map(logs.map((log) => [log.date, log]))
  const days: ConsistencyDay[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const log = byDate.get(date)
    const cal = outcomeFor('calories', log, phase, date)
    const pro = outcomeFor('protein', log, phase, date)
    const status: ConsistencyStatus =
      cal === 'hit' && pro === 'hit' ? 'on' : cal === 'unknown' && pro === 'unknown' ? 'none' : 'off'
    days.push({ date, status })
  }

  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const status = days[i]!.status
    if (i === days.length - 1 && status === 'none') continue // today may just be incomplete
    if (status === 'on') streak += 1
    else break
  }
  return { days, streak }
}

export function buildFoodContext(
  today: LocalDate,
  phase: Phase,
  profile: UserProfile | undefined,
  logs: DailyLog[],
  todayMeals: Meal[],
): FoodContext {
  const todayLog = logs.find((log) => log.date === today)

  // 7-day window ending today, using rolled-up daily macro totals.
  const weekStart = addDays(today, -6)
  const weekLogs = logs.filter(
    (log) => compareDates(log.date, weekStart) >= 0 && compareDates(log.date, today) <= 0,
  )

  const proteinBySlot = Object.fromEntries(
    SLOTS.map((slot) => {
      const slotMeals = todayMeals.filter((meal) => meal.slot === slot)
      const known = slotMeals.flatMap((meal) => (meal.proteinG === null ? [] : [meal.proteinG]))
      return [slot, known.length === 0 ? null : round(known.reduce((sum, g) => sum + g, 0))]
    }),
  ) as Record<MealSlot, number | null>

  const calories = todayLog?.calories ?? null
  const proteinG = todayLog?.proteinG ?? null
  const carbsG = todayLog?.carbsG ?? null
  const fatG = todayLog?.fatG ?? null

  const currentWeight = todayLog?.weightKg ?? profile?.startWeightKg ?? null
  const waterTargetMl = waterTargetForWeight(currentWeight)
  const eatingWindow = computeEatingWindow(todayMeals)

  const goalDirection = ((): 'lose' | 'gain' | 'maintain' | null => {
    const start = profile?.startWeightKg ?? null
    const goal = profile?.goalWeightKg ?? null
    if (start === null || goal === null) return null
    if (goal < start - 0.5) return 'lose'
    if (goal > start + 0.5) return 'gain'
    return 'maintain'
  })()

  const context: FoodContext = {
    date: today,
    physiqueGoal:
      goalDirection === null
        ? null
        : {
            direction: goalDirection,
            startWeightKg: profile?.startWeightKg ?? null,
            goalWeightKg: profile?.goalWeightKg ?? null,
            currentWeightKg: todayLog?.weightKg ?? null,
          },
    targets: { calories: phase.calories, proteinG: phase.proteinG, mealsPerDay: phase.mealsPerDay },
    macroTargets: deriveMacroTargets(phase.calories, phase.proteinG),
    today: {
      logged: todayMeals.length > 0 || calories !== null || proteinG !== null,
      mealCount: todayMeals.length,
      calories,
      proteinG,
      carbsG,
      fatG,
      fiberG: todayLog?.fiberG ?? null,
      caloriesRemaining: calories === null ? null : round(phase.calories - calories),
      proteinRemaining: proteinG === null ? null : round(phase.proteinG - proteinG),
      macroSplitPct: macroSplit(proteinG, carbsG, fatG),
      meals: todayMeals.map((meal) => ({
        slot: meal.slot,
        name: meal.name,
        time: meal.time,
        calories: meal.calories,
        proteinG: meal.proteinG,
        carbsG: meal.carbsG,
        fatG: meal.fatG,
        fiberG: meal.fiberG,
      })),
      proteinBySlot,
      hydration: {
        waterMl: todayLog?.waterMl ?? null,
        targetMl: waterTargetMl,
        sodiumMg: todayLog?.sodiumMg ?? null,
        alcoholUnits: todayLog?.alcoholUnits ?? null,
        caffeineMg: todayLog?.caffeineMg ?? null,
      },
      eatingWindow,
    },
    weekAverages: {
      days: weekLogs.length,
      calories: meanOf(weekLogs.map((log) => log.calories)),
      proteinG: meanOf(weekLogs.map((log) => log.proteinG)),
      carbsG: meanOf(weekLogs.map((log) => log.carbsG)),
      fatG: meanOf(weekLogs.map((log) => log.fatG)),
    },
    observations: [],
  }

  context.observations = deriveObservations(context)
  return context
}

/** Short, plain-language nudges the model can lean on or ignore. */
function deriveObservations(ctx: FoodContext): string[] {
  const notes: string[] = []
  const { today, targets } = ctx

  if (today.proteinRemaining !== null && today.proteinRemaining > 25) {
    notes.push(`${today.proteinRemaining}g short of the ${targets.proteinG}g protein target so far today.`)
  }
  if (today.caloriesRemaining !== null && today.caloriesRemaining < -150) {
    notes.push(`${Math.abs(today.caloriesRemaining)} kcal over the ${targets.calories} target so far today.`)
  }
  if (today.macroSplitPct && today.macroSplitPct.proteinPct < 25 && (today.calories ?? 0) > 400) {
    notes.push(`Protein is only ${today.macroSplitPct.proteinPct}% of today's calories — low for a physique goal.`)
  }

  const { proteinBySlot } = today
  const earlyProtein = (proteinBySlot.breakfast ?? 0) + (proteinBySlot.lunch ?? 0)
  const dinnerProtein = proteinBySlot.dinner ?? 0
  if (today.mealCount >= 2 && dinnerProtein > earlyProtein * 2 && dinnerProtein > 30) {
    notes.push('Protein is back-loaded onto dinner; spreading it earlier supports muscle retention.')
  }

  if (ctx.weekAverages.days >= 3 && ctx.weekAverages.proteinG !== null && ctx.weekAverages.proteinG < targets.proteinG * 0.85) {
    notes.push(
      `7-day protein averages ${ctx.weekAverages.proteinG}g vs the ${targets.proteinG}g target — a consistent gap.`,
    )
  }

  const { hydration, eatingWindow } = today
  if (hydration.waterMl !== null && hydration.waterMl < hydration.targetMl * 0.6) {
    notes.push(
      `Hydration is low — ${hydration.waterMl}ml of about ${hydration.targetMl}ml. Under-drinking can hold water and hide fat loss on the scale.`,
    )
  }
  if (hydration.alcoholUnits !== null && hydration.alcoholUnits >= 2) {
    notes.push(
      `${hydration.alcoholUnits} alcohol units logged — a scale bump over the next day is water, not fat, and it blunts recovery.`,
    )
  }
  if (hydration.sodiumMg !== null && hydration.sodiumMg > 3500) {
    notes.push(`Sodium is high today (${hydration.sodiumMg}mg); expect a temporary water-weight jump, not real gain.`)
  }
  if (eatingWindow && eatingWindow.windowHours > 14) {
    notes.push(`Meals span ${eatingWindow.windowHours}h today — a tighter eating window often helps appetite control.`)
  }
  if (eatingWindow) {
    const lastHour = Number(eatingWindow.lastMealTime.split(':')[0])
    if (Number.isFinite(lastHour) && lastHour >= 22) {
      notes.push(`Last meal was at ${eatingWindow.lastMealTime} — late eating can cost sleep quality and recovery.`)
    }
  }

  return notes
}
