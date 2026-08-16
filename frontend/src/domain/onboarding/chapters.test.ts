import { describe, expect, it } from 'vitest'
import {
  allMissingRequired,
  canGenerateProposal,
  chapterProgress,
  completedChapterIds,
  emptyDraft,
  isChapterComplete,
  missingRequiredFields,
  resumePosition,
} from './chapters'
import type { OnboardingDraft } from './types'

/** A draft with every required field answered, for isolating one variable. */
function fullDraft(): OnboardingDraft {
  const draft = emptyDraft('Asia/Kolkata')
  draft.about = {
    ...draft.about,
    heightCm: 180,
    currentWeightKg: 90,
    birthYear: 1995,
    calculationSex: 'male',
    units: 'metric',
  }
  draft.activity = { ...draft.activity, activityLevel: 'active' }
  draft.goals = { ...draft.goals, primaryGoal: 'fat_loss', pace: 'moderate' }
  draft.training = {
    ...draft.training,
    experience: 'intermediate',
    environment: 'commercial_gym',
    equipmentIds: ['barbell', 'dumbbells'],
  }
  draft.food = { ...draft.food, mealsPerDay: 4 }
  return draft
}

describe('chapter completion', () => {
  it('starts with nothing complete and nothing fabricated', () => {
    const draft = emptyDraft()
    expect(completedChapterIds(draft)).toEqual([])
    expect(canGenerateProposal(draft)).toBe(false)
    expect(draft.about.heightCm).toBeNull()
    expect(draft.training.equipmentIds).toEqual([])
    expect(draft.proposal).toBeNull()
  })

  it('reports exactly which required fields are missing', () => {
    const draft = emptyDraft()
    expect(missingRequiredFields(draft, 'about')).toEqual([
      'heightCm',
      'currentWeightKg',
      'birthYear',
      'calculationSex',
    ])
    expect(missingRequiredFields(draft, 'goals')).toEqual(['primaryGoal', 'pace'])
  })

  it('treats an empty array and a blank string as unanswered', () => {
    const draft = fullDraft()
    draft.training.equipmentIds = []
    expect(isChapterComplete(draft, 'training')).toBe(false)
    expect(missingRequiredFields(draft, 'training')).toEqual(['equipmentIds'])
  })

  it('does not require familiarity, which may legitimately be empty', () => {
    const draft = fullDraft()
    expect(draft.training.familiarity).toEqual({})
    expect(isChapterComplete(draft, 'training')).toBe(true)
  })

  it('completes only when every required field across chapters is answered', () => {
    const draft = fullDraft()
    expect(completedChapterIds(draft)).toEqual(['about', 'activity', 'goals', 'training', 'food'])
    expect(allMissingRequired(draft)).toEqual([])
    expect(canGenerateProposal(draft)).toBe(true)
    expect(chapterProgress(draft)).toEqual({ completed: 5, total: 5, ratio: 1 })
  })
})

describe('resume position', () => {
  it('opens at the first chapter for a brand new draft', () => {
    expect(resumePosition(emptyDraft())).toEqual({ chapter: 'about', questionKey: 'heightCm' })
  })

  it('returns the stored question when it is still unanswered', () => {
    const draft = fullDraft()
    draft.goals.pace = null
    draft.resume = { chapter: 'goals', questionKey: 'pace' }
    expect(resumePosition(draft)).toEqual({ chapter: 'goals', questionKey: 'pace' })
  })

  it('respects a deliberate jump back rather than dragging the user forward', () => {
    const draft = fullDraft()
    // Everything later is done, but they went back to fix their weight.
    draft.about.currentWeightKg = null
    draft.resume = { chapter: 'about', questionKey: 'currentWeightKg' }
    expect(resumePosition(draft)).toEqual({ chapter: 'about', questionKey: 'currentWeightKg' })
  })

  it('moves to the next open question when the stored one was since answered', () => {
    const draft = fullDraft()
    draft.goals.primaryGoal = null
    // Stale pointer: pace has been filled in since it was stored.
    draft.resume = { chapter: 'goals', questionKey: 'pace' }
    expect(resumePosition(draft)).toEqual({ chapter: 'goals', questionKey: 'primaryGoal' })
  })

  it('skips to the first incomplete chapter when the stored one is finished', () => {
    const draft = fullDraft()
    draft.food.mealsPerDay = null
    draft.resume = { chapter: 'about', questionKey: null }
    expect(resumePosition(draft)).toEqual({ chapter: 'food', questionKey: 'mealsPerDay' })
  })

  it('parks on the last chapter for review once everything is answered', () => {
    expect(resumePosition(fullDraft())).toEqual({ chapter: 'food', questionKey: null })
  })
})
