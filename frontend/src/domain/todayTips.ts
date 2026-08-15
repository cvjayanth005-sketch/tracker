import type { FoodContext } from '@/domain/foodContext'
import type { SleepScore } from '@/domain/sleep'
import type { DailyLog, DaySchedule, Phase } from '@/domain/types'

/**
 * Forward-looking advice for the rest of today.
 *
 * Deliberately different from `foodContext.observations`, which describe what
 * has already happened for the coach to reason over. A tip is something the
 * user can still act on before the day ends, so every rule is gated on the
 * time of day: telling someone at 22:00 to spread their protein across lunch
 * is noise, and telling them at 09:00 that they are behind on water is not.
 *
 * Pure and dependency-free — the clock arrives as `nowMinutes` so the rules are
 * unit-testable at any hour.
 */

export type TipTone = 'do' | 'watch' | 'good'

export interface Tip {
  /** Stable key, so React lists and tests do not depend on ordering. */
  id: string
  /** Short imperative — what to do. */
  title: string
  /** One sentence of why, with the numbers behind it. */
  detail: string
  tone: TipTone
}

export interface TipInputs {
  food: FoodContext
  log: DailyLog | undefined
  phase: Phase
  sleep: SleepScore
  schedule: DaySchedule | undefined
  /** Minutes since local midnight. */
  nowMinutes: number
  /** Kilometres actually run today, from the run log. */
  runKmToday: number | null
}

const MORNING_END = 11 * 60
const AFTERNOON_END = 17 * 60
const EVENING_END = 21 * 60

/** How much of the waking day is left, as a fraction, for pacing advice. */
function dayRemaining(nowMinutes: number): number {
  const wakeEnd = 22 * 60
  const wakeStart = 7 * 60
  if (nowMinutes >= wakeEnd) return 0
  if (nowMinutes <= wakeStart) return 1
  return (wakeEnd - nowMinutes) / (wakeEnd - wakeStart)
}

/** A rough meal suggestion sized to what is left, so the tip is actionable. */
function proteinIdea(grams: number): string {
  if (grams >= 45) return 'a chicken breast and Greek yoghurt covers it'
  if (grams >= 25) return 'a scoop of whey or 150g of cottage cheese covers it'
  return 'an egg or a handful of nuts closes the gap'
}

export function buildTodayTips(inputs: TipInputs): Tip[] {
  const { food, log, phase, sleep, schedule, nowMinutes, runKmToday } = inputs
  const tips: Tip[] = []
  const remaining = dayRemaining(nowMinutes)
  const today = food.today

  // --- Recovery first: it changes how hard the rest of the day should be. ---
  const sleptHours = log?.sleepHours ?? null
  if (sleptHours !== null && sleptHours < phase.sleepHours - 1.5 && nowMinutes < EVENING_END) {
    tips.push({
      id: 'sleep-debt',
      title: 'Keep today easy',
      detail: `You slept ${sleptHours}h against a ${phase.sleepHours}h target. Short nights blunt strength and raise appetite — hold intensity back and protect tonight's bedtime.`,
      tone: 'watch',
    })
  } else if (sleptHours === null && nowMinutes > MORNING_END) {
    tips.push({
      id: 'sleep-missing',
      title: 'Log last night',
      detail: 'Sleep is still blank for today. It is the single biggest input to how the plan reads your energy and hunger.',
      tone: 'do',
    })
  } else if (sleep.score !== null && sleep.score >= 80) {
    tips.push({
      id: 'sleep-good',
      title: 'Good night behind you',
      detail: `Sleep scored ${sleep.score}. This is the day to push the hard session if one is scheduled.`,
      tone: 'good',
    })
  }

  // --- Fuel: what is still on the table, framed as something to eat. ---
  const kcalLeft = today.caloriesRemaining
  const proteinLeft = today.proteinRemaining

  if (proteinLeft !== null && proteinLeft > 20 && nowMinutes < EVENING_END) {
    tips.push({
      id: 'protein-left',
      title: `${proteinLeft}g of protein still to go`,
      detail: `Target is ${food.targets.proteinG}g and ${proteinIdea(proteinLeft)}. Protein is what keeps muscle while the deficit does its work.`,
      tone: 'do',
    })
  }

  if (kcalLeft !== null && kcalLeft < -200) {
    const over = Math.abs(kcalLeft)
    tips.push({
      id: 'calories-over',
      title: `${over} kcal over for today`,
      detail:
        nowMinutes < AFTERNOON_END
          ? 'Still early — lean on protein and vegetables for the rest of the day rather than skipping a meal outright.'
          : 'One day does not undo a week. Close the kitchen, and let tomorrow run to plan instead of cutting hard to compensate.',
      tone: 'watch',
    })
  } else if (kcalLeft !== null && kcalLeft > 500 && remaining < 0.3) {
    tips.push({
      id: 'calories-under',
      title: `${kcalLeft} kcal still unlogged`,
      detail:
        'Either the day is genuinely light or meals are missing from the log. Under-eating this far below target is not a faster route down — it costs muscle and sleep.',
      tone: 'watch',
    })
    // Only worth saying when what is left is actually a meal. A 50 kcal
    // remainder is a rounding error, not a dinner.
  } else if (kcalLeft !== null && kcalLeft >= 250 && kcalLeft <= 500 && nowMinutes >= AFTERNOON_END) {
    tips.push({
      id: 'calories-room',
      title: `${kcalLeft} kcal left for dinner`,
      detail: `That is a real meal, not a scrap — build it around protein and you land the day on ${food.targets.calories}.`,
      tone: 'good',
    })
  }

  // --- Hydration: only worth saying while there is still time to drink. ---
  const { waterMl, targetMl } = today.hydration
  if (nowMinutes < EVENING_END) {
    const drunk = waterMl ?? 0
    const expected = targetMl * (1 - remaining)
    if (waterMl === null && nowMinutes > MORNING_END) {
      tips.push({
        id: 'water-missing',
        title: 'No water logged yet',
        detail: `Aim for about ${(targetMl / 1000).toFixed(1)}L across the day. Tap the water buttons as you go — thirst lags behind actual need.`,
        tone: 'do',
      })
    } else if (waterMl !== null && drunk < expected * 0.65 && targetMl - drunk > 400) {
      const short = Math.round((targetMl - drunk) / 250)
      tips.push({
        id: 'water-behind',
        title: `About ${short} more glass${short === 1 ? '' : 'es'} of water`,
        detail: `You are at ${drunk}ml of ${targetMl}ml. Being under holds water weight and reads as a stall on the scale even when fat loss is on track.`,
        tone: 'do',
      })
    }
  }

  // --- Movement: steps and the scheduled session. ---
  const steps = log?.steps ?? null
  if (steps !== null && remaining > 0.15) {
    const short = phase.steps - steps
    if (short > 2000) {
      tips.push({
        id: 'steps-short',
        title: `${short.toLocaleString()} steps to target`,
        detail: `A ${Math.round(short / 110)}-minute walk closes it. Steps are the cheapest deficit you have — they cost nothing in recovery.`,
        tone: 'do',
      })
    }
  }

  if (schedule?.gym && log?.gymDone == null && nowMinutes < EVENING_END) {
    tips.push({
      id: 'gym-pending',
      title: `${schedule.sessionType} session is on for today`,
      detail: 'Still unlogged. Mark it done or skipped when you know — an honest miss is more useful to the plan than a blank.',
      tone: 'do',
    })
  }

  if (schedule?.runKm && (runKmToday ?? 0) < schedule.runKm && nowMinutes < EVENING_END) {
    const done = runKmToday ?? 0
    tips.push({
      id: 'run-pending',
      title: `${schedule.runKm} km ${schedule.runType} run scheduled`,
      detail: done > 0 ? `${done.toFixed(1)} km logged so far.` : 'Nothing logged yet today.',
      tone: 'do',
    })
  }

  // --- Weigh-in: only nags in the morning, when it is still the right time. ---
  if (log?.weightKg == null && nowMinutes < AFTERNOON_END) {
    tips.push({
      id: 'weigh-in',
      title: 'Step on the scale',
      detail: 'A morning weigh-in is what drives the trend line. One reading means little; the string of them is what moves your targets.',
      tone: 'do',
    })
  }

  // --- Things already logged that will distort tomorrow's reading. ---
  const { alcoholUnits, sodiumMg } = today.hydration
  if (alcoholUnits !== null && alcoholUnits >= 2) {
    tips.push({
      id: 'alcohol-logged',
      title: 'Expect a scale bump tomorrow',
      detail: `${alcoholUnits} units logged. The rise you see in the morning is water and glycogen, not fat — do not react to it.`,
      tone: 'watch',
    })
  } else if (sodiumMg !== null && sodiumMg > 3500) {
    tips.push({
      id: 'sodium-logged',
      title: 'Salty day — read the scale loosely',
      detail: `${sodiumMg}mg of sodium holds water for a day or two. Drink normally rather than cutting back to compensate.`,
      tone: 'watch',
    })
  }

  // --- Everything green: say so rather than inventing a chore. ---
  if (tips.length === 0) {
    tips.push({
      id: 'on-track',
      title: 'Today is on plan',
      detail: 'Fuel, movement, and recovery all line up with the targets. Nothing to fix — just finish the day the way you started it.',
      tone: 'good',
    })
  }

  return tips
}
