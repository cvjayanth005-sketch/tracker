import type { DailyLog, LocalDate } from './types'

export type SleepScoreConfidence = 'none' | 'low' | 'medium' | 'high'

export interface SleepScore {
  score: number | null
  confidence: SleepScoreConfidence
  label: 'Needs check-in' | 'Low recovery' | 'Compromised' | 'Solid' | 'Restorative'
  durationScore: number | null
  qualityScore: number | null
  consistencyScore: number | null
  awakeningsScore: number | null
}

export interface ScoredSleepNight {
  date: LocalDate
  result: SleepScore
}

const emptyScore = (): SleepScore => ({
  score: null,
  confidence: 'none',
  label: 'Needs check-in',
  durationScore: null,
  qualityScore: null,
  consistencyScore: null,
  awakeningsScore: null,
})

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

function timeToMinutes(value: string | null): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number) as [number, number]
  return hours * 60 + minutes
}

function circularDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % 1_440
  return Math.min(difference, 1_440 - difference)
}

function circularMedian(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((best, candidate) => {
    const bestDistance = values.reduce((sum, value) => sum + circularDistance(best, value), 0)
    const candidateDistance = values.reduce(
      (sum, value) => sum + circularDistance(candidate, value),
      0,
    )
    return candidateDistance < bestDistance ? candidate : best
  })
}

function timingConsistency(log: DailyLog, history: DailyLog[]): number | null {
  const bedtime = timeToMinutes(log.sleepBedtime)
  const wakeTime = timeToMinutes(log.sleepWakeTime)
  if (bedtime == null || wakeTime == null) return null

  const priorTiming = history
    .filter((candidate) => candidate.date < log.date)
    .map((candidate) => ({
      bedtime: timeToMinutes(candidate.sleepBedtime),
      wakeTime: timeToMinutes(candidate.sleepWakeTime),
    }))
    .filter(
      (candidate): candidate is { bedtime: number; wakeTime: number } =>
        candidate.bedtime != null && candidate.wakeTime != null,
    )
    .slice(-7)
  if (priorTiming.length < 3) return null

  const usualBedtime = circularMedian(priorTiming.map((candidate) => candidate.bedtime))
  const usualWakeTime = circularMedian(priorTiming.map((candidate) => candidate.wakeTime))
  if (usualBedtime == null || usualWakeTime == null) return null

  const averageDifference =
    (circularDistance(bedtime, usualBedtime) + circularDistance(wakeTime, usualWakeTime)) / 2
  // A half-hour either side is stable; two hours or more is fully inconsistent.
  return Math.round(clamp(((120 - averageDifference) / 90) * 100))
}

function recoveryLabel(score: number): SleepScore['label'] {
  if (score >= 85) return 'Restorative'
  if (score >= 70) return 'Solid'
  if (score >= 50) return 'Compromised'
  return 'Low recovery'
}

/**
 * A transparent, local recovery signal. Duration and subjective quality are
 * required; timing and awakenings improve the score only when the user logs
 * them, so incomplete data is never silently scored as poor sleep.
 */
export function calculateSleepScore(
  log: DailyLog | undefined,
  targetHours: number,
  history: DailyLog[],
): SleepScore {
  if (!log || log.sleepHours == null || log.sleepQuality == null || targetHours <= 0) {
    return emptyScore()
  }

  const durationScore = Math.round(clamp((log.sleepHours / targetHours) * 100))
  const qualityScore = Math.round(((log.sleepQuality - 1) / 4) * 100)
  const consistencyScore = timingConsistency(log, history)
  const awakeningsScore =
    log.nightAwakenings == null ? null : Math.round(clamp(100 - log.nightAwakenings * 25))

  const components = [
    { value: durationScore, weight: 40 },
    { value: qualityScore, weight: 30 },
    ...(consistencyScore == null ? [] : [{ value: consistencyScore, weight: 20 }]),
    ...(awakeningsScore == null ? [] : [{ value: awakeningsScore, weight: 10 }]),
  ]
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0)
  const score = Math.round(
    components.reduce((sum, component) => sum + component.value * component.weight, 0) /
      totalWeight,
  )
  const optionalSignals = Number(consistencyScore != null) + Number(awakeningsScore != null)
  const confidence: SleepScoreConfidence =
    optionalSignals === 2 ? 'high' : optionalSignals === 1 ? 'medium' : 'low'

  return {
    score,
    confidence,
    label: recoveryLabel(score),
    durationScore,
    qualityScore,
    consistencyScore,
    awakeningsScore,
  }
}

export function scoreSleepNights(logs: DailyLog[], targetHours: number): ScoredSleepNight[] {
  return logs.map((log) => ({
    date: log.date,
    result: calculateSleepScore(log, targetHours, logs),
  }))
}
