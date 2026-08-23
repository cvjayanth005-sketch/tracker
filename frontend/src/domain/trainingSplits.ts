import type { BodyPartGroup } from '@/domain/muscleTaxonomy'
import type { Exercise } from '@/domain/types'

/**
 * A single day within a split — what a lifter would call "push day" or
 * "back & biceps." `muscleGroups` drives which catalogue exercises get
 * suggested for it; `bucket` maps it onto the app's existing upper/lower/full
 * workout-rotation bucket (Exercise.sessionType, the weekly schedule, the
 * adaptive-training engine) so none of that machinery needs to know splits
 * exist at all. `key` is what gets stored on Exercise.splitDayKey.
 */
export interface SplitDay {
  key: string
  label: string
  muscleGroups: BodyPartGroup[]
  bucket: Exclude<Exercise['sessionType'], never>
}

export interface TrainingSplitPlan {
  id: string
  name: string
  emoji: string
  frequency: string
  goodFor: string
  description: string
  /** True only for the user-defined split — its days are built at pick time, not fixed here. */
  isCustom?: boolean
  days: SplitDay[]
}

const ALL_UPPER: BodyPartGroup[] = ['chest', 'back', 'shoulders', 'triceps', 'biceps']
const ALL_LOWER: BodyPartGroup[] = ['legs', 'core']
const ALL_GROUPS: BodyPartGroup[] = [...ALL_UPPER, ...ALL_LOWER]

export const TRAINING_SPLITS: TrainingSplitPlan[] = [
  {
    id: 'full-body',
    name: 'Full Body',
    emoji: '🌐',
    frequency: '2–4 days/week',
    goodFor: 'Beginners, general health, fat loss',
    description: 'All muscle groups in each session.',
    days: [{ key: 'full', label: 'Full Body', muscleGroups: ALL_GROUPS, bucket: 'full' }],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    emoji: '⬆️',
    frequency: '4 days/week',
    goodFor: 'Strength & hypertrophy balance',
    description: 'Upper body and lower body, alternating.',
    days: [
      { key: 'upper', label: 'Upper Body', muscleGroups: ALL_UPPER, bucket: 'upper' },
      { key: 'lower', label: 'Lower Body', muscleGroups: ALL_LOWER, bucket: 'lower' },
    ],
  },
  {
    id: 'ppl',
    name: 'Push Pull Legs',
    emoji: '🔁',
    frequency: '3–6 days/week',
    goodFor: 'Progressive overload, intermediates',
    description: 'Push = chest/shoulders/triceps. Pull = back/biceps. Legs = quads/hamstrings/glutes.',
    days: [
      { key: 'push', label: 'Push', muscleGroups: ['chest', 'shoulders', 'triceps'], bucket: 'upper' },
      { key: 'pull', label: 'Pull', muscleGroups: ['back', 'biceps'], bucket: 'upper' },
      { key: 'legs', label: 'Legs', muscleGroups: ['legs', 'core'], bucket: 'lower' },
    ],
  },
  {
    id: 'bro-split',
    name: 'Bro Split',
    emoji: '💥',
    frequency: '5 days/week',
    goodFor: 'Bodybuilding aesthetics',
    description: 'One muscle group per day.',
    days: [
      { key: 'chest', label: 'Chest', muscleGroups: ['chest'], bucket: 'upper' },
      { key: 'back', label: 'Back', muscleGroups: ['back'], bucket: 'upper' },
      { key: 'shoulders', label: 'Shoulders', muscleGroups: ['shoulders'], bucket: 'upper' },
      { key: 'arms', label: 'Arms', muscleGroups: ['triceps', 'biceps'], bucket: 'upper' },
      { key: 'legs', label: 'Legs', muscleGroups: ['legs', 'core'], bucket: 'lower' },
    ],
  },
  {
    id: 'phul',
    name: 'PHUL',
    emoji: '⚡',
    frequency: '4 days/week',
    goodFor: 'Intermediate lifters',
    description: 'Power (heavy lifts) + Hypertrophy (volume work), upper and lower.',
    days: [
      { key: 'upper-power', label: 'Upper Power', muscleGroups: ALL_UPPER, bucket: 'upper' },
      { key: 'lower-power', label: 'Lower Power', muscleGroups: ALL_LOWER, bucket: 'lower' },
      { key: 'upper-hypertrophy', label: 'Upper Hypertrophy', muscleGroups: ALL_UPPER, bucket: 'upper' },
      { key: 'lower-hypertrophy', label: 'Lower Hypertrophy', muscleGroups: ALL_LOWER, bucket: 'lower' },
    ],
  },
  {
    id: 'phat',
    name: 'PHAT',
    emoji: '🔥',
    frequency: '5–6 days/week',
    goodFor: 'Advanced athletes',
    description: 'Power Hypertrophy Adaptive Training — combines strength and high-volume work.',
    days: [
      { key: 'lower-power', label: 'Lower Power', muscleGroups: ALL_LOWER, bucket: 'lower' },
      { key: 'upper-power', label: 'Upper Power', muscleGroups: ALL_UPPER, bucket: 'upper' },
      { key: 'back-shoulders', label: 'Back & Shoulders', muscleGroups: ['back', 'shoulders'], bucket: 'upper' },
      { key: 'lower-hypertrophy', label: 'Lower Hypertrophy', muscleGroups: ALL_LOWER, bucket: 'lower' },
      { key: 'chest-arms', label: 'Chest & Arms', muscleGroups: ['chest', 'triceps', 'biceps'], bucket: 'upper' },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold Split',
    emoji: '🏆',
    frequency: '6 days/week (repeats)',
    goodFor: 'High-volume growth',
    description: 'Chest/Back, Shoulders/Arms, Legs — repeated twice a week.',
    days: [
      { key: 'chest-back', label: 'Chest & Back', muscleGroups: ['chest', 'back'], bucket: 'upper' },
      { key: 'shoulders-arms', label: 'Shoulders & Arms', muscleGroups: ['shoulders', 'triceps', 'biceps'], bucket: 'upper' },
      { key: 'legs', label: 'Legs', muscleGroups: ['legs', 'core'], bucket: 'lower' },
    ],
  },
  {
    id: 'min-max',
    name: 'Full Body Min-Max Hybrid',
    emoji: '🎚️',
    frequency: '3–6 days/week',
    goodFor: 'Intermediate/advanced recovery balance',
    description: 'Alternates MIN (light/recovery) and MAX (intense) full-body days.',
    days: [
      { key: 'min', label: 'MIN Day', muscleGroups: ALL_GROUPS, bucket: 'full' },
      { key: 'max', label: 'MAX Day', muscleGroups: ALL_GROUPS, bucket: 'full' },
    ],
  },
  {
    id: 'uplh',
    name: 'Upper/Push/Lower/Pull Hybrid',
    emoji: '🔀',
    frequency: '4–5 days/week',
    goodFor: 'Lifters bored of standard splits',
    description: 'A mix of movement-focused and region-focused sessions.',
    days: [
      { key: 'upper', label: 'Upper', muscleGroups: ALL_UPPER, bucket: 'upper' },
      { key: 'push', label: 'Push', muscleGroups: ['chest', 'shoulders', 'triceps'], bucket: 'upper' },
      { key: 'lower', label: 'Lower', muscleGroups: ALL_LOWER, bucket: 'lower' },
      { key: 'pull', label: 'Pull', muscleGroups: ['back', 'biceps'], bucket: 'upper' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Split',
    emoji: '🛠️',
    frequency: 'You decide',
    goodFor: 'Anyone who wants to name their own days',
    description: 'Choose your own body parts and frequency.',
    isCustom: true,
    days: [],
  },
]

export function findSplit(id: string | null): TrainingSplitPlan | undefined {
  return TRAINING_SPLITS.find((s) => s.id === id)
}
