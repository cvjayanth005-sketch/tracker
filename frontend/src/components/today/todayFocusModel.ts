import { TOLERANCE, type MetricKey } from '@/domain/compliance'
import type { DailyLog, DaySchedule, Phase } from '@/domain/types'
import type { DayTargetSegment } from './dayTargetRingModel'

export interface TodayFocus {
  eyebrow: string
  title: string
  detail: string
  actionLabel: string | null
  action: { kind: 'workout' } | { kind: 'metric'; metric: MetricKey } | null
}

function segmentFor(segments: DayTargetSegment[], metric: MetricKey): DayTargetSegment | undefined {
  return segments.find((segment) => segment.metric === metric)
}

function needsAttention(segments: DayTargetSegment[], metric: MetricKey): boolean {
  const segment = segmentFor(segments, metric)
  return segment !== undefined && segment.outcome !== 'hit'
}

export function attentionMetricsForToday(
  segments: DayTargetSegment[],
  focus: TodayFocus,
  limit = 3,
): MetricKey[] {
  const focusMetric = focus.action?.kind === 'metric' ? focus.action.metric : null
  return segments
    .filter(
      (segment) =>
        segment.metric !== 'sleep' &&
        segment.metric !== focusMetric &&
        segment.outcome !== 'hit',
    )
    .map((segment) => segment.metric)
    .slice(0, limit)
}

export function buildTodayFocus(
  phase: Phase,
  schedule: DaySchedule | undefined,
  log: DailyLog | undefined,
  segments: DayTargetSegment[],
): TodayFocus {
  if (schedule?.gym && needsAttention(segments, 'gym')) {
    const session = schedule.sessionType === 'full' ? 'full-body' : schedule.sessionType
    return {
      eyebrow: 'Training comes first',
      title: `Complete your ${session} session`,
      detail: 'Your scheduled strength work is the clearest next step for today.',
      actionLabel: 'Start workout',
      action: { kind: 'workout' },
    }
  }

  if (schedule?.runKm && needsAttention(segments, 'run')) {
    return {
      eyebrow: 'Run scheduled',
      title: `${schedule.runKm} km ${schedule.runType ?? 'run'}`,
      detail: 'Complete the planned distance at the prescribed effort. Logging details can wait until the finish.',
      actionLabel: 'Open run',
      action: { kind: 'workout' },
    }
  }

  if (needsAttention(segments, 'steps')) {
    const current = log?.steps ?? null
    const remaining = current === null ? null : Math.max(0, phase.steps - current)
    return {
      eyebrow: 'Movement target',
      title:
        remaining === null
          ? `Reach ${phase.steps.toLocaleString()} steps`
          : `${remaining.toLocaleString()} steps to go`,
      detail:
        remaining === null
          ? 'Log your current count to turn the daily goal into a useful walking recommendation.'
          : `About ${Math.max(1, Math.ceil(remaining / 100))} minutes of easy walking will close the gap.`,
      actionLabel: remaining === null ? 'Log steps' : 'Update steps',
      action: { kind: 'metric', metric: 'steps' },
    }
  }

  if (needsAttention(segments, 'protein')) {
    const current = log?.proteinG ?? null
    const remaining = current === null ? null : Math.max(0, Math.round(phase.proteinG - current))
    return {
      eyebrow: 'Nutrition focus',
      title:
        remaining === null
          ? `Reach at least ${phase.proteinG} g protein`
          : `Add about ${remaining} g protein`,
      detail: 'Prioritize one protein-forward meal or snack before adding more nutrition detail.',
      actionLabel: 'Log protein',
      action: { kind: 'metric', metric: 'protein' },
    }
  }

  if (needsAttention(segments, 'calories')) {
    const lower = Math.round(phase.calories * TOLERANCE.caloriesLower)
    const upper = Math.round(phase.calories * TOLERANCE.caloriesUpper)
    const current = log?.calories ?? null
    const belowRange = current !== null && current < lower
    return {
      eyebrow: 'Energy range',
      title:
        current === null
          ? `${lower.toLocaleString()}-${upper.toLocaleString()} kcal`
          : belowRange
            ? `About ${(lower - current).toLocaleString()} kcal to your range`
            : "Calories are above today's range",
      detail:
        current !== null && current > upper
          ? 'No correction is needed today. Keep the next choice simple and continue normally tomorrow.'
          : 'A useful daily range leaves room for normal meals without turning the target into a pass-or-fail number.',
      actionLabel: current === null ? 'Log calories' : 'Review calories',
      action: { kind: 'metric', metric: 'calories' },
    }
  }

  if (needsAttention(segments, 'meals')) {
    return {
      eyebrow: 'Plan consistency',
      title: `${phase.mealsPerDay} meals on plan`,
      detail: 'Finish the meals you planned, then record the final count once eating is done.',
      actionLabel: 'Log meals',
      action: { kind: 'metric', metric: 'meals' },
    }
  }

  return {
    eyebrow: 'Essentials covered',
    title: 'You are on track today',
    detail: 'Your daytime targets are handled. Keep the rest of the day steady and recover well.',
    actionLabel: null,
    action: null,
  }
}
