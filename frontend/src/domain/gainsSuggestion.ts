import { evaluateProgression, type ProgressionAdvice, type SessionHistory } from './progression'
import {
  MUSCLE_BUCKETS,
  MUSCLE_BUCKET_LABEL,
  classifyExerciseMuscle,
  type MuscleBucket,
  type MuscleVolume,
} from './muscleVolume'
import type { Exercise } from './types'

/**
 * One suggestion for improving gains, or none.
 *
 * Deliberately one at a time. Six equally-weighted nudges is a list nobody
 * reads, and the whole point is to name the single thing most worth changing
 * this week. Everything is derived from logged sets — nothing is invented, and
 * when the evidence is thin this returns `insufficient_data` and says so
 * rather than dressing a guess up as advice.
 */

export type GainsSuggestionKind =
  | 'insufficient_data'
  | 'balanced'
  | 'add_volume'
  | 'break_plateau'
  | 'deload'
  | 'progress_load'

export interface GainsSuggestion {
  kind: GainsSuggestionKind
  headline: string
  detail: string
  /** The muscle group the suggestion is about, when it is about one. */
  bucket: MuscleBucket | null
  /** Exercises the suggestion refers to, for the Apply action to act on. */
  exerciseIds: string[]
}

/** Sessions in the window below this cannot support a claim about a trend. */
export const MIN_SESSIONS_FOR_ADVICE = 4
/**
 * How far behind the leading muscle group counts as a real gap. Below this,
 * differences are ordinary programme variation rather than neglect — a split
 * is not meant to hit every group identically.
 */
export const IMBALANCE_RATIO = 0.45

export interface GainsInput {
  exercises: Exercise[]
  history: SessionHistory[]
  volume: MuscleVolume
}

function insufficient(detail: string): GainsSuggestion {
  return {
    kind: 'insufficient_data',
    headline: 'Not enough logged training yet',
    detail,
    bucket: null,
    exerciseIds: [],
  }
}

/**
 * Muscle groups the programme actually trains, so an under-trained group is
 * only flagged when the user has exercises for it. Someone with no core work
 * programmed does not need "your core is behind" every week.
 */
function programmedBuckets(exercises: Exercise[]): Set<MuscleBucket> {
  const buckets = new Set<MuscleBucket>()
  for (const exercise of exercises) {
    if (exercise.archived) continue
    const bucket = classifyExerciseMuscle(exercise.name)
    if (bucket) buckets.add(bucket)
  }
  return buckets
}

export function buildGainsSuggestion(input: GainsInput): GainsSuggestion {
  const active = input.exercises.filter((exercise) => !exercise.archived)
  if (active.length === 0) {
    return insufficient('Add exercises to your plan and log a few sessions to get suggestions.')
  }
  if (input.history.length < MIN_SESSIONS_FOR_ADVICE) {
    const remaining = MIN_SESSIONS_FOR_ADVICE - input.history.length
    return insufficient(
      `Log ${remaining} more session${remaining === 1 ? '' : 's'} and Formara can suggest where to push.`,
    )
  }

  const advice = new Map<string, ProgressionAdvice>()
  for (const exercise of active) {
    advice.set(exercise.id, evaluateProgression(exercise, input.history))
  }

  // A lift stuck at the same load with no headroom is the clearest signal
  // available, so deloads are raised before anything else — training through a
  // stall is how people stay stuck for months.
  const deloads = active.filter((e) => advice.get(e.id)?.code === 'consider_deload')
  if (deloads.length > 0) {
    const names = deloads.slice(0, 2).map((e) => e.name)
    return {
      kind: 'deload',
      headline: `Back off on ${names[0]}`,
      detail:
        deloads.length === 1
          ? `${names[0]} has been too heavy for its rep range. Drop the load about 10% and build back up — that usually beats grinding.`
          : `${names.join(' and ')} are both too heavy for their rep ranges. Drop each about 10% and build back up.`,
      bucket: classifyExerciseMuscle(deloads[0]!.name),
      exerciseIds: deloads.map((e) => e.id),
    }
  }

  // Under-trained muscle group, but only among groups actually programmed.
  const programmed = programmedBuckets(active)
  const candidates = MUSCLE_BUCKETS.filter((b) => programmed.has(b))
  if (candidates.length >= 2) {
    const ranked = [...candidates].sort((a, b) => input.volume[b] - input.volume[a])
    const leader = ranked[0]!
    const trailer = ranked[ranked.length - 1]!
    const leadVolume = input.volume[leader]
    const trailVolume = input.volume[trailer]
    if (leadVolume > 0 && trailVolume / leadVolume < IMBALANCE_RATIO) {
      const trailingExercises = active.filter((e) => classifyExerciseMuscle(e.name) === trailer)
      return {
        kind: 'add_volume',
        headline: `${MUSCLE_BUCKET_LABEL[trailer]} is behind the rest`,
        detail: `${MUSCLE_BUCKET_LABEL[trailer]} volume is well under ${MUSCLE_BUCKET_LABEL[
          leader
        ].toLowerCase()}. Adding a set to each ${MUSCLE_BUCKET_LABEL[
          trailer
        ].toLowerCase()} exercise would even the programme out.`,
        bucket: trailer,
        exerciseIds: trailingExercises.map((e) => e.id),
      }
    }
  }

  // Everything progressing and nothing stalled: name the lifts that have
  // earned more load, since that is the actionable good news.
  const ready = active.filter((e) => advice.get(e.id)?.code === 'ready_to_increase')
  if (ready.length > 0) {
    const first = ready[0]!
    const suggestion = advice.get(first.id)
    return {
      kind: 'progress_load',
      headline:
        ready.length === 1
          ? `${first.name} is ready for more`
          : `${ready.length} lifts are ready for more`,
      detail:
        suggestion?.suggestedWeightKg != null
          ? `${first.name} has hit the top of its rep range. Take it to ${suggestion.suggestedWeightKg} kg next session.`
          : `${first.name} has hit the top of its rep range — add ${first.loadIncrementKg} kg next session.`,
      bucket: classifyExerciseMuscle(first.name),
      exerciseIds: ready.map((e) => e.id),
    }
  }

  // Nothing stalled, nothing ready: everything is mid-progression.
  const building = active.filter((e) => advice.get(e.id)?.code === 'keep_building')
  if (building.length > 0) {
    return {
      kind: 'balanced',
      headline: 'Everything is progressing',
      detail:
        'No lift is stalled and volume is spread evenly. Keep the current loads and add reps before adding weight.',
      bucket: null,
      exerciseIds: [],
    }
  }

  return insufficient('Log complete sets — weight and reps — so progression can be read.')
}

/**
 * Grouped progression status for the whole programme, for the Activity card.
 * Separate from the single suggestion above: this is the full picture, that is
 * the one thing to do about it.
 */
export interface ProgressionGroups {
  ready: Array<{ exercise: Exercise; advice: ProgressionAdvice }>
  building: Array<{ exercise: Exercise; advice: ProgressionAdvice }>
  stalled: Array<{ exercise: Exercise; advice: ProgressionAdvice }>
  untracked: Array<{ exercise: Exercise; advice: ProgressionAdvice }>
}

export function groupProgression(exercises: Exercise[], history: SessionHistory[]): ProgressionGroups {
  const groups: ProgressionGroups = { ready: [], building: [], stalled: [], untracked: [] }
  for (const exercise of exercises) {
    if (exercise.archived) continue
    const advice = evaluateProgression(exercise, history)
    const entry = { exercise, advice }
    if (advice.code === 'ready_to_increase') groups.ready.push(entry)
    else if (advice.code === 'keep_building') groups.building.push(entry)
    else if (advice.code === 'consider_deload') groups.stalled.push(entry)
    else groups.untracked.push(entry)
  }
  return groups
}
