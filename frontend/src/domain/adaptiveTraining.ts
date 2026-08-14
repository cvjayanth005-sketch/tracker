import { evaluateProgression, type SessionHistory } from './progression'
import type {
  DailyLog,
  DataConfidence,
  Exercise,
  ExercisePrescription,
  ReadinessBand,
  Rating,
  SessionType,
  WorkoutPrescription,
} from './types'

export interface ReadinessResult {
  score: number | null
  band: ReadinessBand
  confidence: DataConfidence
  loggedSignals: number
  factors: Array<{ key: 'sleep' | 'energy' | 'soreness' | 'stress'; score: number }>
}

interface AdaptiveSessionInput {
  sessionType: Exclude<SessionType, 'rest' | 'run'>
  targetSleepHours: number
  sleepScore?: number | null
  log: DailyLog | undefined
  exercises: Exercise[]
  history: SessionHistory[]
  now?: string
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

function ratingScore(value: Rating, inverse = false): number {
  const score = ((value - 1) / 4) * 100
  return inverse ? 100 - score : score
}

export function calculateReadiness(
  log: DailyLog | undefined,
  targetSleepHours: number,
  sleepScore: number | null = null,
): ReadinessResult {
  const factors: ReadinessResult['factors'] = []
  if (sleepScore != null) {
    factors.push({ key: 'sleep', score: clamp(sleepScore) })
  } else if (log?.sleepHours != null && targetSleepHours > 0) {
    factors.push({ key: 'sleep', score: clamp((log.sleepHours / targetSleepHours) * 100) })
  }
  if (log?.energy != null) factors.push({ key: 'energy', score: ratingScore(log.energy) })
  if (log?.soreness != null) {
    factors.push({ key: 'soreness', score: ratingScore(log.soreness, true) })
  }
  if (log?.stress != null) factors.push({ key: 'stress', score: ratingScore(log.stress, true) })

  if (factors.length === 0) {
    return { score: null, band: 'insufficient', confidence: 'low', loggedSignals: 0, factors }
  }

  const weights = { sleep: 0.35, energy: 0.3, soreness: 0.2, stress: 0.15 } as const
  const totalWeight = factors.reduce((sum, factor) => sum + weights[factor.key], 0)
  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * weights[factor.key], 0) / totalWeight,
  )
  const confidence: DataConfidence =
    factors.length === 4 ? 'high' : factors.length >= 2 ? 'medium' : 'low'
  const scoredBand: ReadinessBand = score >= 75 ? 'ready' : score >= 55 ? 'steady' : 'reduce'
  const band: ReadinessBand = confidence === 'low' && scoredBand === 'ready' ? 'steady' : scoredBand
  return { score, band, confidence, loggedSignals: factors.length, factors }
}

function roundedLoad(value: number, increment: number): number {
  return Math.max(increment, Math.round(value / increment) * increment)
}

function exerciseLimit(minutes: number | null): number {
  if (minutes == null) return Number.POSITIVE_INFINITY
  if (minutes <= 30) return 3
  if (minutes <= 45) return 4
  if (minutes <= 60) return 6
  return Number.POSITIVE_INFINITY
}

export function buildAdaptiveSession(input: AdaptiveSessionInput): WorkoutPrescription {
  const readiness = calculateReadiness(input.log, input.targetSleepHours, input.sleepScore ?? null)
  const available = input.exercises
    .filter(
      (exercise) =>
        !exercise.archived &&
        (input.sessionType === 'full' || exercise.sessionType === input.sessionType),
    )
    .sort((a, b) => a.order - b.order)
    .slice(0, exerciseLimit(input.log?.trainingMinutesAvailable ?? null))

  const constrained = Boolean(input.log?.trainingConstraints?.trim())
  const reduce = readiness.band === 'reduce'
  const steady = readiness.band === 'steady'
  const adjustments: string[] = []
  if (readiness.band === 'insufficient') adjustments.push('Log readiness to improve confidence')
  if (steady) adjustments.push('Hold load increases and leave one extra rep in reserve')
  if (reduce) adjustments.push('Reduce volume and load while recovery is limited')
  if (input.log?.trainingMinutesAvailable != null) {
    adjustments.push(`Fit the session to ${input.log.trainingMinutesAvailable} minutes`)
  }
  if (constrained) adjustments.push('Review each movement against today\'s constraint')

  const exercises: ExercisePrescription[] = available.map((exercise) => {
    const progression = evaluateProgression(exercise, input.history)
    const referenceWeight = progression.suggestedWeightKg ?? progression.lastWorkingWeightKg
    let suggestedWeightKg = referenceWeight
    let targetSets = exercise.targetSets
    let targetRir = exercise.targetRir
    let action: ExercisePrescription['action'] =
      progression.code === 'no_history'
        ? 'establish'
        : progression.code === 'ready_to_increase'
          ? 'increase'
          : progression.code === 'consider_deload'
            ? 'reduce'
            : 'hold'
    let reason = progression.headline

    if (steady) {
      targetSets = Math.max(2, exercise.targetSets - 1)
      targetRir = Math.min(5, exercise.targetRir + 1)
      if (progression.code === 'ready_to_increase') {
        suggestedWeightKg = progression.lastWorkingWeightKg
        action = 'hold'
        reason = 'Progression is ready, but recovery supports holding today'
      }
    }

    if (reduce) {
      targetSets = Math.min(2, exercise.targetSets)
      targetRir = Math.min(5, exercise.targetRir + 2)
      const deloadBase = progression.lastWorkingWeightKg ?? referenceWeight
      suggestedWeightKg =
        deloadBase == null
          ? null
          : roundedLoad(deloadBase * 0.9, exercise.loadIncrementKg)
      action = 'reduce'
      reason = 'Readiness is low; preserve technique and avoid grinding reps'
    }

    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      targetSets,
      repRangeMin: exercise.repRangeMin,
      repRangeMax: exercise.repRangeMax,
      targetRir,
      suggestedWeightKg,
      action,
      reason,
    }
  })

  const headline =
    readiness.band === 'ready'
      ? 'Train as planned'
      : readiness.band === 'steady'
        ? 'Keep the session productive, not maximal'
        : readiness.band === 'reduce'
          ? 'Use a lower-fatigue session today'
          : 'Baseline plan pending readiness data'

  return {
    version: 1,
    generatedAt: input.now ?? new Date().toISOString(),
    sessionType: input.sessionType,
    readinessScore: readiness.score,
    readinessBand: readiness.band,
    confidence: readiness.confidence,
    headline,
    adjustments,
    exercises,
  }
}
