import { outcomeFor, type MetricKey } from '@/domain/compliance'
import type { DailyLog, DaySchedule, LocalDate, Phase } from '@/domain/types'
import { bandFloor, buildTodayTargets, type TodayTarget } from './todayTargets'

/**
 * "What should I do today?" — at most three answers.
 *
 * One per lane: training, nutrition, and movement or recovery. Capping at three
 * is the point rather than a limitation; a list of nine equally-weighted nudges
 * is a list nobody reads, and the screen has to be understandable in about five
 * seconds.
 *
 * Every action is derived from the plan and the day's log. Nothing is invented,
 * and an action is only ever raised for something the user can actually do
 * something about before the day ends.
 */

export type ActionLane = 'training' | 'nutrition' | 'movement'
export type ActionStatus = 'done' | 'todo' | 'attention' | 'rest'

export interface TodayAction {
  lane: ActionLane
  status: ActionStatus
  /** The instruction itself, e.g. "Log your upper session". */
  title: string
  /** Why it is being asked, in one short clause. */
  reason: string
  /** The single control this action offers. Null when nothing is actionable. */
  command: { label: string; kind: 'workout' } | { label: string; kind: 'metric'; metric: MetricKey } | null
}

function target(targets: TodayTarget[], metric: MetricKey): TodayTarget | undefined {
  return targets.find((entry) => entry.metric === metric)
}

/** Training: the scheduled session, or an explicit rest day. */
function trainingAction(
  schedule: DaySchedule | undefined,
  log: DailyLog | undefined,
  phase: Phase,
  date: LocalDate,
): TodayAction {
  const gymScheduled = Boolean(schedule?.gym)
  const runKm = schedule?.runKm ?? null

  if (!gymScheduled && !runKm) {
    return {
      lane: 'training',
      status: 'rest',
      title: 'Rest day',
      // Stated rather than left blank: on a plan built around recovery, a rest
      // day is an instruction, and an empty slot reads as a bug.
      reason: 'Nothing scheduled. Recovery is part of the plan.',
      command: null,
    }
  }

  if (gymScheduled) {
    const outcome = outcomeFor('gym', log, phase, date)
    if (outcome === 'hit') {
      return {
        lane: 'training',
        status: 'done',
        title: 'Session done',
        reason: `${schedule?.sessionType ?? 'Training'} session logged.`,
        command: null,
      }
    }
    if (log?.gymDone === false) {
      return {
        lane: 'training',
        status: 'attention',
        title: 'Session skipped',
        reason: 'Marked skipped. An honest miss is more useful than a blank.',
        command: null,
      }
    }
    return {
      lane: 'training',
      status: 'todo',
      title: `${schedule?.sessionType ?? 'Training'} session`,
      reason: 'Scheduled for today and not yet logged.',
      command: { label: 'Open workout', kind: 'workout' },
    }
  }

  const done = log?.runKm ?? null
  const outcome = outcomeFor('run', log, phase, date)
  if (outcome === 'hit') {
    return {
      lane: 'training',
      status: 'done',
      title: 'Run done',
      reason: `${done?.toFixed(1) ?? '—'} km logged.`,
      command: null,
    }
  }
  return {
    lane: 'training',
    status: 'todo',
    title: `${runKm} km run`,
    reason: done === null ? 'Scheduled for today.' : `${done.toFixed(1)} km logged so far.`,
    command: { label: 'Open workout', kind: 'workout' },
  }
}

/**
 * Nutrition: whichever of calories or protein most needs attention.
 *
 * Only one is raised. Both at once would use two of the three slots on the same
 * lane and crowd out movement entirely.
 */
function nutritionAction(targets: TodayTarget[]): TodayAction {
  const calories = target(targets, 'calories')
  const protein = target(targets, 'protein')

  if (calories?.outcome === 'missed' && calories.band.kind === 'range' && calories.actual !== null) {
    const over = calories.actual > calories.band.max
    return {
      lane: 'nutrition',
      status: 'attention',
      title: over ? 'Over your calorie range' : 'Under your calorie range',
      reason: calories.hint ?? 'Today sits outside the planned range.',
      command: { label: 'Log food', kind: 'metric', metric: 'calories' },
    }
  }

  if (protein && protein.outcome !== 'hit') {
    const remaining =
      protein.actual === null ? null : Math.max(0, Math.round(bandFloor(protein.band) - protein.actual))
    return {
      lane: 'nutrition',
      status: protein.actual === null ? 'todo' : 'attention',
      title: remaining === null ? 'Log your protein' : `${remaining}g of protein to go`,
      reason:
        protein.actual === null
          ? 'Nothing logged yet today.'
          : 'Protein is what holds muscle while the deficit does its work.',
      command: { label: 'Log protein', kind: 'metric', metric: 'protein' },
    }
  }

  if (calories?.outcome === 'unknown') {
    return {
      lane: 'nutrition',
      status: 'todo',
      title: 'Log what you have eaten',
      reason: 'No food recorded yet today.',
      command: { label: 'Log food', kind: 'metric', metric: 'calories' },
    }
  }

  return {
    lane: 'nutrition',
    status: 'done',
    title: 'Nutrition on track',
    reason: 'Calories and protein are both inside target.',
    command: null,
  }
}

/**
 * Movement or recovery, whichever is the more useful thing to say.
 *
 * Sleep wins when it was short, because a poor night changes how hard the rest
 * of the day should be, and no number of steps offsets it.
 */
function movementAction(targets: TodayTarget[], phase: Phase, log: DailyLog | undefined): TodayAction {
  const sleep = target(targets, 'sleep')
  const steps = target(targets, 'steps')
  const slept = log?.sleepHours ?? null

  if (slept !== null && slept < phase.sleepHours - 1.5) {
    return {
      lane: 'movement',
      status: 'attention',
      title: 'Keep today easy',
      reason: `${slept}h of sleep against a ${phase.sleepHours}h target. Hold intensity back.`,
      command: null,
    }
  }

  if (steps && steps.outcome !== 'hit' && steps.hint) {
    return {
      lane: 'movement',
      status: steps.actual === null ? 'todo' : 'attention',
      title: 'Get your steps in',
      reason: steps.hint,
      command: { label: 'Log steps', kind: 'metric', metric: 'steps' },
    }
  }

  if (sleep?.outcome === 'unknown') {
    return {
      lane: 'movement',
      status: 'todo',
      title: 'Log last night',
      reason: 'Sleep drives how the plan reads your energy and hunger.',
      command: { label: 'Log sleep', kind: 'metric', metric: 'sleep' },
    }
  }

  return {
    lane: 'movement',
    status: 'done',
    title: 'Movement on track',
    reason: 'Steps and recovery are both where they should be.',
    command: null,
  }
}

/** Rank so unfinished work sorts above finished, without dropping anything. */
const STATUS_WEIGHT: Record<ActionStatus, number> = {
  attention: 0,
  todo: 1,
  rest: 2,
  done: 3,
}

export function buildTodayActions(
  phase: Phase,
  schedule: DaySchedule | undefined,
  log: DailyLog | undefined,
  date: LocalDate,
): TodayAction[] {
  const targets = buildTodayTargets(phase, log, date)
  return [
    trainingAction(schedule, log, phase, date),
    nutritionAction(targets),
    movementAction(targets, phase, log),
  ].sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status])
}

/** True when nothing on the day still needs doing. */
export function allActionsSettled(actions: TodayAction[]): boolean {
  return actions.every((action) => action.status === 'done' || action.status === 'rest')
}
