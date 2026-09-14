import type { DailyLog, DaySchedule, LocalDate, Phase } from './types'

export interface BestNextAction {
  id: string
  title: string
  reason: string
  label: string
  href: string
}

/** One explainable next step. Missing readings are unknown, not failures. */
export function bestNextAction(phase: Phase, schedule: DaySchedule | undefined,
  log: DailyLog | undefined, today: LocalDate): BestNextAction {
  const day = `/calendar/${today}`
  if (log?.sleepHours == null) return {
    id: 'sleep', title: 'Start with last night’s sleep',
    reason: 'Your sleep is not logged yet. Add it so today’s training review has more context.',
    label: 'Log sleep', href: day,
  }
  const pendingGym = schedule?.gym && log.gymDone == null
  const pendingRun = (schedule?.runKm ?? 0) > 0 && (log.runKm ?? 0) < (schedule?.runKm ?? 0)
  if ((pendingGym || pendingRun) && ((log.soreness ?? 0) >= 4 || log.sleepHours < phase.sleepHours - 1.5)) return {
    id: 'readiness', title: 'Check how you feel before training',
    reason: (log.soreness ?? 0) >= 4
      ? `You logged soreness at ${log.soreness}/5. Review your readiness before starting today’s session.`
      : `You logged ${log.sleepHours} hours of sleep against your ${phase.sleepHours}-hour target. Review today’s session first.`,
    label: 'Review training', href: '/activity',
  }
  if (pendingGym) return { id: 'workout', title: `Your ${schedule.sessionType === 'full' ? 'full-body' : schedule.sessionType} session is next`,
    reason: 'It is scheduled for today and has not been marked complete.', label: 'Open workout', href: '/workout' }
  if (pendingRun) return { id: 'run', title: `Your ${schedule?.runKm} km run is next`,
    reason: `${log.runKm ?? 0} km logged toward today’s planned distance.`, label: 'Open run', href: '/workout' }
  if (log.foodComplete !== true && (log.proteinG == null || log.proteinG < phase.proteinG)) return {
    id: 'food', title: log.proteinG == null ? 'Log what you’ve eaten' : `${Math.ceil(phase.proteinG - log.proteinG)} g protein to your target`,
    reason: log.proteinG == null ? 'Your food log is still open. Start with your most recent meal.' : `${log.proteinG} g logged toward your ${phase.proteinG} g protein target.`,
    label: 'Open food log', href: '/food',
  }
  if (log.steps == null || log.steps < phase.steps) return {
    id: 'steps', title: log.steps == null ? 'Check your step count' : `${Math.max(0, phase.steps - log.steps).toLocaleString()} steps to your target`,
    reason: log.steps == null ? 'Add your current count to see your progress today.' : `${log.steps.toLocaleString()} steps logged toward ${phase.steps.toLocaleString()}.`,
    label: 'Update steps', href: day,
  }
  if (log.waterMl == null) return { id: 'water', title: 'Check in on hydration',
    reason: 'No water has been logged today. Add what you’ve had in the food log.', label: 'Open food log', href: '/food' }
  return { id: 'review', title: 'Take a moment to review your day',
    reason: 'Your next step is a quick check of your logs. You can update anything you missed.', label: 'Review today', href: day }
}
