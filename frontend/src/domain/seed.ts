import type { DaySchedule, Exercise, Phase, Settings, UserProfile } from './types'

/**
 * Starting plan, seeded from the Excel tracker. Everything here is editable on
 * the Plan screen — these are defaults, not constants, which is why phases live
 * in the database rather than in code.
 */

const now = () => new Date().toISOString()

/** Mon/Thu upper, Tue/Fri lower, Wed/Sat easy run, Sun long run. */
function schedule(
  shortRunKm: number,
  longRunKm: number,
  includeTempo = false,
): DaySchedule[] {
  return [
    { dow: 0, gym: false, sessionType: 'run', runKm: longRunKm, runType: 'long' },
    { dow: 1, gym: true, sessionType: 'upper', runKm: shortRunKm, runType: 'easy' },
    { dow: 2, gym: true, sessionType: 'lower', runKm: shortRunKm, runType: 'easy' },
    { dow: 3, gym: false, sessionType: 'run', runKm: shortRunKm, runType: includeTempo ? 'tempo' : 'easy' },
    { dow: 4, gym: true, sessionType: 'upper', runKm: shortRunKm, runType: 'easy' },
    { dow: 5, gym: true, sessionType: 'lower', runKm: shortRunKm, runType: 'easy' },
    { dow: 6, gym: false, sessionType: 'run', runKm: shortRunKm, runType: 'easy' },
  ]
}

export function defaultPhases(): Phase[] {
  const spec = [
    { name: 'Phase 1', from: 88, to: 84, kcal: 2050, protein: 165, steps: 11000, short: 2, long: 5, waist: 96 },
    { name: 'Phase 2', from: 84, to: 80, kcal: 2000, protein: 165, steps: 11000, short: 3, long: 6, waist: 92 },
    { name: 'Phase 3', from: 80, to: 77, kcal: 1950, protein: 165, steps: 12000, short: 3, long: 8, waist: 89 },
    { name: 'Phase 4', from: 77, to: 74, kcal: 1900, protein: 170, steps: 12000, short: 4, long: 10, waist: 86 },
    { name: 'Phase 5', from: 74, to: 72, kcal: 1850, protein: 170, steps: 12000, short: 4, long: 10, waist: 84 },
  ]

  return spec.map((s, i) => ({
    id: `phase-${i + 1}`,
    order: i + 1,
    name: s.name,
    startWeightKg: s.from,
    targetWeightKg: s.to,
    targetWaistCm: s.waist,
    calories: s.kcal,
    proteinG: s.protein,
    steps: s.steps,
    sleepHours: 7.5,
    mealsPerDay: 4,
    weeklyRunKmTarget: s.short * 6 + s.long,
    schedule: schedule(s.short, s.long, i >= 2),
    startedOn: null,
    endedOn: null,
    calorieCutsApplied: 0,
    notes: null,
  }))
}

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    calorieFloor: 1700,
    targetLossPerWeekMin: 0.5,
    targetLossPerWeekMax: 0.8,
    fastLossPerWeekThreshold: 1.0,
    plateauLossPerWeekThreshold: 0.3,
    plateauWeeksBeforeCut: 3,
    maxCalorieCutsPerPhase: 2,
    phaseHoldDays: 5,
    minReadingsPerWindow: 4,
    goodCompliancePct: 80,
    manualPhaseOverrideId: null,
    updatedAt: now(),
  }
}

export function defaultProfile(): UserProfile {
  return {
    id: 'me',
    name: null,
    heightCm: null,
    birthYear: null,
    startWeightKg: 88,
    goalWeightKg: 72,
    updatedAt: now(),
  }
}

export function defaultExercises(): Exercise[] {
  const upper: Array<[string, number, number, number, number, number]> = [
    // name, repMin, repMax, sets, targetRir, increment
    ['Barbell Bench Press', 6, 10, 3, 2, 2.5],
    ['Barbell Row', 8, 12, 3, 2, 2.5],
    ['Overhead Press', 6, 10, 3, 2, 2.5],
    ['Lat Pulldown', 8, 12, 3, 2, 2.5],
    ['Dumbbell Curl', 10, 15, 2, 1, 2],
    ['Triceps Pushdown', 10, 15, 2, 1, 2.5],
  ]
  const lower: Array<[string, number, number, number, number, number]> = [
    ['Back Squat', 5, 8, 3, 2, 5],
    ['Romanian Deadlift', 8, 12, 3, 2, 5],
    ['Leg Press', 10, 15, 3, 2, 5],
    ['Leg Curl', 10, 15, 3, 1, 2.5],
    ['Standing Calf Raise', 12, 20, 3, 1, 2.5],
  ]

  const build = (
    rows: Array<[string, number, number, number, number, number]>,
    sessionType: 'upper' | 'lower',
    offset: number,
  ): Exercise[] =>
    rows.map(([name, repRangeMin, repRangeMax, targetSets, targetRir, loadIncrementKg], i) => ({
      id: `ex-${sessionType}-${i + 1}`,
      name,
      sessionType,
      repRangeMin,
      repRangeMax,
      targetSets,
      targetRir,
      loadIncrementKg,
      order: offset + i,
      archived: false,
    }))

  return [...build(upper, 'upper', 0), ...build(lower, 'lower', 100)]
}
