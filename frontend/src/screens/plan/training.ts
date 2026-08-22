import type { DaySchedule } from '@/domain/types'
import type { TrainingSplit } from '@/domain/onboarding/types'

/** Weekday initials, indexed by `DaySchedule.dow` (0 = Sunday). */
export const SPLIT_LABEL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

export const TRAINING_SPLIT_LABEL: Record<TrainingSplit, string> = {
  full_body: 'Full body',
  upper_lower: 'Upper / lower',
  push_pull_legs: 'Push / pull / legs',
  bro_split: 'Body-part split',
  other: 'Something else',
  none: 'Not training yet',
}

export interface ScheduleSummary {
  gymDays: number
  runDays: number
  restDays: number
  weeklyRunKm: string
  /** Plain-language reason the week is shaped this way. */
  rationale: string
}

/**
 * Describes the generated week in the terms someone would use themselves.
 *
 * The rationale is derived from the schedule rather than stored alongside it,
 * so it cannot drift out of sync with the plan it claims to explain — if the
 * schedule changes, the sentence changes with it.
 */
export function describeSchedule(schedule: DaySchedule[]): ScheduleSummary {
  const gymDays = schedule.filter((day) => day.gym).length
  const runDays = schedule.filter((day) => (day.runKm ?? 0) > 0).length
  const restDays = schedule.filter((day) => !day.gym && !(day.runKm ?? 0)).length
  const weeklyRunKm = schedule.reduce((sum, day) => sum + (day.runKm ?? 0), 0)

  const sessionTypes = new Set(
    schedule.filter((day) => day.gym).map((day) => day.sessionType),
  )
  const shape =
    sessionTypes.size <= 1
      ? 'the same session each time'
      : sessionTypes.has('upper') && sessionTypes.has('lower')
        ? 'alternating upper and lower days'
        : 'rotating session types'

  const rationale =
    gymDays === 0
      ? 'No strength sessions are scheduled this phase — the plan is built around movement and nutrition.'
      : `${gymDays} strength ${gymDays === 1 ? 'day' : 'days'} a week, ${shape}, with ${restDays} full rest ${
          restDays === 1 ? 'day' : 'days'
        } to recover in between.${
          runDays > 0 ? ` Running is spread across ${runDays} ${runDays === 1 ? 'day' : 'days'}.` : ''
        }`

  return {
    gymDays,
    runDays,
    restDays,
    weeklyRunKm: weeklyRunKm.toFixed(weeklyRunKm % 1 === 0 ? 0 : 1),
    rationale,
  }
}
