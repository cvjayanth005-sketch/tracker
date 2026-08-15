import { outcomeFor, type MetricKey } from '@/domain/compliance'
import type { DailyLog, LocalDate, Phase } from '@/domain/types'

export type DayTargetOutcome = 'hit' | 'missed' | 'unknown'
export type DayTargetArcState = 'lit' | 'dim' | 'ghost'

export interface DayTargetSegment {
  metric: MetricKey
  outcome: DayTargetOutcome
}

export function arcStateForOutcome(outcome: DayTargetOutcome): DayTargetArcState {
  if (outcome === 'hit') return 'lit'
  if (outcome === 'missed') return 'dim'
  return 'ghost'
}

export function targetSegmentsForDay(
  metrics: MetricKey[],
  log: DailyLog | undefined,
  phase: Phase,
  date: LocalDate,
): DayTargetSegment[] {
  return metrics.flatMap((metric) => {
    const outcome = outcomeFor(metric, log, phase, date)
    return outcome === 'notScheduled' ? [] : [{ metric, outcome }]
  })
}

export function targetCount(segments: DayTargetSegment[]): { hit: number; applicable: number } {
  return {
    hit: segments.filter((segment) => segment.outcome === 'hit').length,
    applicable: segments.length,
  }
}
