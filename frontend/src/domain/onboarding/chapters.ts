import {
  CHAPTER_IDS,
  ONBOARDING_DRAFT_VERSION,
  type ChapterId,
  type OnboardingDraft,
  type ResumePosition,
} from './types'

/** Matches the local convention in seed.ts and repo.ts. */
const now = () => new Date().toISOString()

/**
 * Chapter completion, validation, and resume.
 *
 * "Required" here means required to generate a *safe* proposal, not required to
 * move on. The interview lets someone skip ahead; what it will not do is
 * produce targets from air. Each chapter therefore declares the fields the
 * deterministic baseline genuinely cannot run without, and everything else is
 * optional by construction.
 */

/** Fields the deterministic baseline cannot substitute a default for. */
const REQUIRED: Record<ChapterId, string[]> = {
  // Mifflin-St Jeor needs all four; without them there is no maintenance
  // estimate and therefore no defensible calorie target.
  about: ['heightCm', 'currentWeightKg', 'birthYear', 'calculationSex'],
  activity: ['activityLevel'],
  goals: ['primaryGoal', 'pace'],
  // Equipment decides which exercises exist at all; environment alone is a
  // label. `familiarity` is deliberately not required — an empty map means
  // "nothing known", which the generator handles by favouring low technical
  // demand rather than by guessing.
  training: ['experience', 'environment', 'equipmentIds'],
  food: ['mealsPerDay'],
}

function chapterRecord(draft: OnboardingDraft, chapter: ChapterId): Record<string, unknown> {
  return draft[chapter] as unknown as Record<string, unknown>
}

/** Treats null, empty string, and empty array alike: nothing was answered. */
function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function missingRequiredFields(draft: OnboardingDraft, chapter: ChapterId): string[] {
  const record = chapterRecord(draft, chapter)
  return REQUIRED[chapter].filter((key) => !isAnswered(record[key]))
}

export function isChapterComplete(draft: OnboardingDraft, chapter: ChapterId): boolean {
  return missingRequiredFields(draft, chapter).length === 0
}

export function completedChapterIds(draft: OnboardingDraft): ChapterId[] {
  return CHAPTER_IDS.filter((chapter) => isChapterComplete(draft, chapter))
}

/** Every required field across every chapter that is still unanswered. */
export function allMissingRequired(draft: OnboardingDraft): Array<{ chapter: ChapterId; field: string }> {
  return CHAPTER_IDS.flatMap((chapter) =>
    missingRequiredFields(draft, chapter).map((field) => ({ chapter, field })),
  )
}

/** A draft can produce a deterministic proposal only when nothing is missing. */
export function canGenerateProposal(draft: OnboardingDraft): boolean {
  return allMissingRequired(draft).length === 0
}

export function chapterProgress(draft: OnboardingDraft): {
  completed: number
  total: number
  ratio: number
} {
  const completed = completedChapterIds(draft).length
  return { completed, total: CHAPTER_IDS.length, ratio: completed / CHAPTER_IDS.length }
}

/**
 * Where to reopen the interview.
 *
 * The stored position wins whenever it still points at unfinished work, so
 * someone who deliberately jumped back to fix an answer lands there rather than
 * being dragged forward. It is only recomputed when that position is stale —
 * the chapter it names has since been completed.
 */
export function resumePosition(draft: OnboardingDraft): ResumePosition {
  const stored = draft.resume
  if (stored && !isChapterComplete(draft, stored.chapter)) {
    const stillMissing = missingRequiredFields(draft, stored.chapter)
    // Keep the exact question when it is still unanswered; otherwise move to
    // the first thing in that chapter that is.
    if (stored.questionKey && stillMissing.includes(stored.questionKey)) return stored
    return { chapter: stored.chapter, questionKey: stillMissing[0] ?? null }
  }

  const nextIncomplete = CHAPTER_IDS.find((chapter) => !isChapterComplete(draft, chapter))
  if (!nextIncomplete) {
    // Everything is answered; park on the last chapter for review.
    return { chapter: CHAPTER_IDS[CHAPTER_IDS.length - 1]!, questionKey: null }
  }
  return {
    chapter: nextIncomplete,
    questionKey: missingRequiredFields(draft, nextIncomplete)[0] ?? null,
  }
}

/**
 * A draft with every field null or empty.
 *
 * Explicitly enumerated rather than built from a loop so that adding a field to
 * a chapter is a type error here until a default is chosen — which is what
 * forces the "null, never a fabricated value" rule to be decided per field.
 */
export function emptyDraft(timezone: string | null = null): OnboardingDraft {
  const stamp = now()
  return {
    id: 'me',
    version: ONBOARDING_DRAFT_VERSION,
    about: {
      preferredName: null,
      birthYear: null,
      heightCm: null,
      currentWeightKg: null,
      calculationSex: null,
      units: null,
      timezone,
      limitations: [],
      accessibilityNeeds: null,
    },
    activity: {
      activityLevel: null,
      typicalSteps: null,
      currentExerciseDaysPerWeek: null,
      availableTrainingDays: null,
      sessionMinutes: null,
      typicalSleepHours: null,
      stress: null,
      cardioPreferences: [],
      scheduleNotes: null,
    },
    goals: {
      primaryGoal: null,
      secondaryGoals: [],
      goalWeightKg: null,
      pace: null,
      priorityAreas: [],
      targetDate: null,
      successDefinition: null,
    },
    training: {
      experience: null,
      environment: null,
      currentSplit: null,
      preferredDays: [],
      sessionMinutes: null,
      equipmentIds: [],
      familiarity: {},
      previousPerformance: [],
      stylesLiked: [],
      stylesDisliked: [],
    },
    food: {
      dietStyle: null,
      allergies: [],
      intolerances: [],
      foodsLiked: [],
      foodsAvoided: [],
      proteinSources: [],
      mealsPerDay: null,
      cookingMinutes: null,
      budget: null,
      culturalPreferences: [],
      supplements: [],
      knownDeficiencies: [],
    },
    completedChapters: [],
    resume: { chapter: 'about', questionKey: null },
    proposal: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}
