import { addDays, compareDates, daysBetween } from './date'
import type { LocalDate, Run, RunType } from './types'

export type EffortBand = 'easy' | 'moderate' | 'hard' | 'unknown'
export type RunningTrendStatus = 'ok' | 'insufficient_data'

export interface PaceTrend {
  status: RunningTrendStatus
  endDate: LocalDate
  windowDays: number
  averagePaceMinPerKm: number | null
  runs: number
  required: number
}

export interface PaceProgressionSettings {
  windowDays?: number
  minRuns?: number
  noiseFloorSecondsPerKm?: number
}

export interface PaceProgression {
  status: 'improving' | 'holding' | 'slowing' | 'insufficient_data'
  current: PaceTrend
  previous: PaceTrend
  /** Positive means the average easy pace became faster. */
  changeSecondsPerKm: number | null
}

export interface WeeklyVolume {
  totalKm: number
  runs: number
}

export interface VolumeRamp {
  status: 'ok' | 'ramp_too_fast' | 'detraining' | 'insufficient_data'
  currentKm: number
  previousAverageKm: number | null
  changePct: number | null
  priorWeeks: number
  capPct: number
}

export interface LongRunWeek {
  endDate: LocalDate
  longestKm: number | null
}

export interface LongRunProgression {
  status: 'building' | 'holding' | 'reducing' | 'insufficient_data'
  weeks: LongRunWeek[]
  changeKm: number | null
}

export interface DerivedTargetPaces {
  easy: number
  long: number
  tempo: number
  intervals: number
}

const DEFAULT_WINDOW_DAYS = 21
const DEFAULT_MIN_RUNS = 3
const DEFAULT_NOISE_FLOOR_SECONDS = 3

/** Minutes per kilometre. Missing or non-positive inputs have no pace. */
export function paceMinPerKm(
  distanceKm: number | null,
  durationMin: number | null,
): number | null {
  if (distanceKm === null || durationMin === null) return null
  if (distanceKm <= 0 || durationMin <= 0) return null
  return durationMin / distanceKm
}

/**
 * Intended run type establishes the band. RPE only overrides a clear mismatch,
 * so a recovery run is not reclassified because it felt one point harder.
 */
export function effortBand(type: RunType, rpe: number | null): EffortBand {
  if (rpe !== null && (rpe < 1 || rpe > 10)) return 'unknown'
  if (rpe !== null && rpe >= 8) return 'hard'
  if (rpe !== null && rpe <= 4) return 'easy'
  if (type === 'recovery' || type === 'easy' || type === 'long') return 'easy'
  if (type === 'tempo') return 'moderate'
  if (type === 'intervals') return 'hard'
  return 'unknown'
}

function inWindow(date: LocalDate, endDate: LocalDate, windowDays: number): boolean {
  const age = daysBetween(date, endDate)
  return age >= 0 && age < windowDays
}

export function easyPaceTrend(
  runs: Run[],
  endDate: LocalDate,
  windowDays = DEFAULT_WINDOW_DAYS,
  minRuns = DEFAULT_MIN_RUNS,
): PaceTrend {
  const paces = runs.flatMap((run) => {
    if (!inWindow(run.date, endDate, windowDays)) return []
    if (effortBand(run.type, run.rpe) !== 'easy') return []
    const pace = paceMinPerKm(run.distanceKm, run.durationMin)
    return pace === null ? [] : [pace]
  })

  if (paces.length < minRuns) {
    return {
      status: 'insufficient_data',
      endDate,
      windowDays,
      averagePaceMinPerKm: null,
      runs: paces.length,
      required: minRuns,
    }
  }

  return {
    status: 'ok',
    endDate,
    windowDays,
    averagePaceMinPerKm: paces.reduce((sum, pace) => sum + pace, 0) / paces.length,
    runs: paces.length,
    required: minRuns,
  }
}

export function paceProgression(
  runs: Run[],
  endDate: LocalDate,
  settings: PaceProgressionSettings = {},
): PaceProgression {
  const windowDays = settings.windowDays ?? DEFAULT_WINDOW_DAYS
  const minRuns = settings.minRuns ?? DEFAULT_MIN_RUNS
  const noiseFloor = settings.noiseFloorSecondsPerKm ?? DEFAULT_NOISE_FLOOR_SECONDS
  const current = easyPaceTrend(runs, endDate, windowDays, minRuns)
  const previous = easyPaceTrend(runs, addDays(endDate, -windowDays), windowDays, minRuns)

  if (
    current.status !== 'ok' ||
    previous.status !== 'ok' ||
    current.averagePaceMinPerKm === null ||
    previous.averagePaceMinPerKm === null
  ) {
    return { status: 'insufficient_data', current, previous, changeSecondsPerKm: null }
  }

  const changeSecondsPerKm =
    (previous.averagePaceMinPerKm - current.averagePaceMinPerKm) * 60
  const status =
    changeSecondsPerKm >= noiseFloor
      ? 'improving'
      : changeSecondsPerKm <= -noiseFloor
        ? 'slowing'
        : 'holding'
  return { status, current, previous, changeSecondsPerKm }
}

function volumeInWindow(runs: Run[], endDate: LocalDate, windowDays: number): WeeklyVolume {
  const included = runs.filter(
    (run) => inWindow(run.date, endDate, windowDays) && run.distanceKm !== null,
  )
  return {
    totalKm: included.reduce((sum, run) => sum + (run.distanceKm ?? 0), 0),
    runs: included.length,
  }
}

export function weeklyRunVolume(runs: Run[], endDate: LocalDate): WeeklyVolume {
  return volumeInWindow(runs, endDate, 7)
}

export function volumeRamp(runs: Run[], endDate: LocalDate, capPct = 10): VolumeRamp {
  const current = weeklyRunVolume(runs, endDate)
  const previous = [1, 2, 3].map((weeksBack) =>
    weeklyRunVolume(runs, addDays(endDate, -7 * weeksBack)),
  )
  const known = previous.filter((week) => week.runs > 0)
  if (known.length < 2) {
    return {
      status: 'insufficient_data',
      currentKm: current.totalKm,
      previousAverageKm: null,
      changePct: null,
      priorWeeks: known.length,
      capPct,
    }
  }

  const previousAverageKm =
    known.reduce((sum, week) => sum + week.totalKm, 0) / known.length
  const changePct =
    previousAverageKm > 0
      ? ((current.totalKm - previousAverageKm) / previousAverageKm) * 100
      : current.totalKm > 0
        ? Number.POSITIVE_INFINITY
        : 0
  const status =
    changePct > capPct
      ? 'ramp_too_fast'
      : changePct < -30
        ? 'detraining'
        : 'ok'
  return {
    status,
    currentKm: current.totalKm,
    previousAverageKm,
    changePct,
    priorWeeks: known.length,
    capPct,
  }
}

export function longRunProgression(runs: Run[], endDate: LocalDate): LongRunProgression {
  const weeks = [3, 2, 1, 0].map((weeksBack) => {
    const weekEnd = addDays(endDate, -7 * weeksBack)
    const distances = runs
      .filter(
        (run) =>
          run.type === 'long' &&
          inWindow(run.date, weekEnd, 7) &&
          run.distanceKm !== null,
      )
      .map((run) => run.distanceKm as number)
    return {
      endDate: weekEnd,
      longestKm: distances.length > 0 ? Math.max(...distances) : null,
    }
  })
  const known = weeks.filter(
    (week): week is LongRunWeek & { longestKm: number } => week.longestKm !== null,
  )
  if (known.length < 2) return { status: 'insufficient_data', weeks, changeKm: null }

  const changeKm = known.at(-1)!.longestKm - known[0]!.longestKm
  const status = changeKm > 0 ? 'building' : changeKm < 0 ? 'reducing' : 'holding'
  return { status, weeks, changeKm }
}

export function derivedTargetPaces(trend: PaceTrend): DerivedTargetPaces | null {
  if (trend.status !== 'ok' || trend.averagePaceMinPerKm === null) return null
  return {
    easy: trend.averagePaceMinPerKm,
    long: trend.averagePaceMinPerKm + 10 / 60,
    tempo: trend.averagePaceMinPerKm - 45 / 60,
    intervals: trend.averagePaceMinPerKm - 90 / 60,
  }
}

export function runsBetweenDates(runs: Run[], from: LocalDate, to: LocalDate): Run[] {
  return runs.filter(
    (run) => compareDates(run.date, from) >= 0 && compareDates(run.date, to) <= 0,
  )
}
