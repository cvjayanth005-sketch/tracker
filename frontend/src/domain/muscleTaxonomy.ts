/**
 * Fine-grained body-part grouping for browsing and organizing the exercise
 * library — a different job than `muscleVolume.ts`'s six-bucket classifier,
 * which exists to fit a radial chart without overlapping labels. Someone
 * looking for "an exercise for lower chest" wants the angle distinction; the
 * volume wheel doesn't need it. Kept as a separate module rather than
 * widening the six-bucket one, so the tested volume/gains-suggestion code
 * path is untouched by this.
 *
 * Same name-based approach as the six-bucket classifier and for the same
 * reason: exercises are keyed by their own ids, not the onboarding
 * catalogue's, so there's nothing to join a stored muscle tag against — a
 * custom exercise typed in by hand has no catalogue entry at all. Matching on
 * the name is the only classifier that works for both.
 */

export type BodyPartGroup = 'chest' | 'back' | 'shoulders' | 'triceps' | 'biceps' | 'legs' | 'core'

export const BODY_PART_GROUPS: readonly BodyPartGroup[] = [
  'chest',
  'back',
  'shoulders',
  'triceps',
  'biceps',
  'legs',
  'core',
]

export const BODY_PART_LABEL: Record<BodyPartGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  legs: 'Legs',
  core: 'Core',
}

/** Sub-region key per group, in the display order they should appear. */
export const SUBREGIONS: Partial<Record<BodyPartGroup, readonly string[]>> = {
  chest: ['upper', 'mid', 'lower', 'general'],
  back: ['lats', 'upper', 'mid', 'lower'],
  legs: ['quads', 'hamstrings', 'calves', 'shins'],
}

export const SUBREGION_LABEL: Record<string, string> = {
  upper: 'Upper',
  mid: 'Mid',
  lower: 'Lower',
  general: 'Full chest',
  lats: 'Lats',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  shins: 'Shins',
}

export interface BodyPartClassification {
  group: BodyPartGroup
  /** Only set for groups with a defined SUBREGIONS list. */
  subregion: string | null
}

function classifyChest(n: string): BodyPartClassification {
  if (/incline/.test(n)) return { group: 'chest', subregion: 'upper' }
  if (/decline/.test(n)) return { group: 'chest', subregion: 'lower' }
  return { group: 'chest', subregion: n.includes('fly') || n.includes('flye') ? 'mid' : 'general' }
}

function classifyBack(n: string): BodyPartClassification {
  if (/\blat\b|pulldown|pull[- ]?up|chin[- ]?up/.test(n)) return { group: 'back', subregion: 'lats' }
  if (/shrug|\btrap\b/.test(n)) return { group: 'back', subregion: 'upper' }
  if (/back extension|hyperextension|good morning/.test(n)) return { group: 'back', subregion: 'lower' }
  if (/\brow\b/.test(n)) return { group: 'back', subregion: 'mid' }
  return { group: 'back', subregion: null }
}

function classifyLegs(n: string): BodyPartClassification {
  if (/shin|tibialis|tib raise/.test(n)) return { group: 'legs', subregion: 'shins' }
  if (/calf/.test(n)) return { group: 'legs', subregion: 'calves' }
  if (
    /hamstring|leg curl|deadlift|\brdl\b|good morning|hip thrust|glute bridge|\bglute\b|hip abduction/.test(n)
  ) {
    return { group: 'legs', subregion: 'hamstrings' }
  }
  if (/squat|leg press|leg extension|lunge|\bquad\b|step[- ]?up/.test(n)) {
    return { group: 'legs', subregion: 'quads' }
  }
  return { group: 'legs', subregion: null }
}

/**
 * Classifies an exercise into one of the seven browsing groups from its
 * name. Order matters throughout: leg movements are checked before the bare
 * "curl"/"extension" match that would otherwise catch "leg curl" and "leg
 * extension" into biceps/legs confusion, and deadlift variants are treated as
 * a leg movement (posterior chain) rather than back, matching the existing
 * six-bucket classifier's convention so the two systems do not disagree on
 * the exercises they share.
 */
export interface PreciseMuscleTarget {
  group: BodyPartGroup
  targetArea: string
}

/**
 * Exact-name overrides sourced from a hand-curated exercise/muscle-target
 * list (not derived from regex) — more precise than the classifier below,
 * and authoritative where the two disagree (e.g. Face Pulls: the regex
 * classifier reads it as shoulders, this table says back/rhomboids).
 */
const PRECISE_MUSCLE_TARGETS: Record<string, PreciseMuscleTarget> = {
  // Keyed by the lower-cased catalogue name (see onboarding/catalog/exercises.ts).
  // CSV-name variants are aliased alongside so a hand-typed exercise matching
  // the sheet the user gave still resolves.
  // Shoulders
  'front dumbbell raise': { group: 'shoulders', targetArea: 'Anterior Deltoid' },
  'overhead press': { group: 'shoulders', targetArea: 'Anterior Deltoid' },
  'barbell overhead press': { group: 'shoulders', targetArea: 'Anterior Deltoid' },
  'dumbbell shoulder press': { group: 'shoulders', targetArea: 'Anterior Deltoid' },
  'lateral raise': { group: 'shoulders', targetArea: 'Lateral Deltoid' },
  'dumbbell lateral raise': { group: 'shoulders', targetArea: 'Lateral Deltoid' },
  'reverse fly': { group: 'shoulders', targetArea: 'Posterior Deltoid' },
  'reverse pec deck fly': { group: 'shoulders', targetArea: 'Posterior Deltoid' },
  'face pull': { group: 'back', targetArea: 'Rhomboids' },
  'face pulls': { group: 'back', targetArea: 'Rhomboids' },
  // Chest
  'incline barbell press': { group: 'chest', targetArea: 'Upper Pecs' },
  'incline dumbbell press': { group: 'chest', targetArea: 'Upper Pecs' },
  'barbell bench press': { group: 'chest', targetArea: 'Middle Pecs' },
  'flat bench press': { group: 'chest', targetArea: 'Middle Pecs' },
  'dumbbell bench press': { group: 'chest', targetArea: 'Middle Pecs' },
  'decline dumbbell press': { group: 'chest', targetArea: 'Lower Pecs' },
  // Back
  'pull-up': { group: 'back', targetArea: 'Lats' },
  'barbell shrug': { group: 'back', targetArea: 'Traps' },
  // Arms — biceps
  'incline dumbbell curl': { group: 'biceps', targetArea: 'Biceps (Long Head)' },
  'concentration curl': { group: 'biceps', targetArea: 'Biceps (Short Head)' },
  // Arms — triceps
  'triceps pushdown': { group: 'triceps', targetArea: 'Triceps (Lateral Head)' },
  'overhead triceps extension': { group: 'triceps', targetArea: 'Triceps (Long Head)' },
  // Legs
  'back squat': { group: 'legs', targetArea: 'Quads' },
  'barbell back squat': { group: 'legs', targetArea: 'Quads' },
  'romanian deadlift': { group: 'legs', targetArea: 'Hamstrings' },
  'hip thrust': { group: 'legs', targetArea: 'Glutes' },
  'standing calf raise': { group: 'legs', targetArea: 'Calves' },
  // Core
  'cable crunch': { group: 'core', targetArea: 'Rectus Abdominis' },
  crunches: { group: 'core', targetArea: 'Rectus Abdominis' },
  'russian twist': { group: 'core', targetArea: 'Obliques' },
  'russian twists': { group: 'core', targetArea: 'Obliques' },
  'dead bug': { group: 'core', targetArea: 'Transverse Abdominis' },
}

export function preciseMuscleTarget(name: string): PreciseMuscleTarget | null {
  return PRECISE_MUSCLE_TARGETS[name.trim().toLowerCase()] ?? null
}

/** The broad group an exercise belongs to, preferring the precise table over the regex classifier. */
export function muscleGroupFor(name: string): BodyPartGroup | null {
  return preciseMuscleTarget(name)?.group ?? classifyBodyPart(name)?.group ?? null
}

/** Display-ready "Group · Target area" tag, preferring the precise table over the regex classifier. */
export function muscleDisplayTag(name: string): string | null {
  const precise = preciseMuscleTarget(name)
  if (precise) return `${BODY_PART_LABEL[precise.group]} · ${precise.targetArea}`
  const c = classifyBodyPart(name)
  if (!c) return null
  const group = BODY_PART_LABEL[c.group]
  if (!c.subregion) return group
  return `${group} · ${SUBREGION_LABEL[c.subregion] ?? c.subregion}`
}

export function classifyBodyPart(name: string): BodyPartClassification | null {
  const n = name.toLowerCase()

  if (
    /\bleg\b|squat|lunge|calf|hip thrust|glute|quad|hamstring|shin|tibialis|deadlift|good morning|step[- ]?up|hip abduction/.test(
      n,
    )
  ) {
    return classifyLegs(n)
  }
  if (/bench|chest|fly|flye|dip|push[- ]?up|pec|incline|decline/.test(n)) return classifyChest(n)
  if (/\brow\b|pulldown|pull[- ]?up|chin[- ]?up|\blat\b|shrug|\btrap\b|back extension|hyperextension/.test(n)) {
    return classifyBack(n)
  }
  if (/overhead press|shoulder press|lateral raise|front raise|rear delt|face pull|arnold/.test(n)) {
    return { group: 'shoulders', subregion: null }
  }
  if (/tricep|pushdown|skull ?crusher|kickback|close[- ]?grip/.test(n)) {
    return { group: 'triceps', subregion: null }
  }
  if (/bicep|curl/.test(n)) return { group: 'biceps', subregion: null }
  if (/plank|crunch|sit[- ]?up|\bab\b|abs|core|twist|hanging raise|dead bug|pallof/.test(n)) {
    return { group: 'core', subregion: null }
  }

  return null
}
