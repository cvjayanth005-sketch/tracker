import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft } from './chapters'
import { buildBaselineProposal } from './baseline'
import {
  RATE_LIMIT_COOLDOWN_MS,
  RateLimitedError,
  isRateLimited,
  requestProposal,
  resetRateLimit,
} from './proposalSource'
import type { GeneratedProposal, OnboardingDraft } from './types'

function baseDraft(): OnboardingDraft {
  const d = emptyDraft('UTC')
  d.about = {
    ...d.about,
    heightCm: 180, currentWeightKg: 90, birthYear: 1995,
    calculationSex: 'male', units: 'metric',
  }
  d.activity = { ...d.activity, activityLevel: 'active', availableTrainingDays: 4 }
  d.goals = { ...d.goals, primaryGoal: 'fat_loss', pace: 'moderate', goalWeightKg: 80 }
  d.training = {
    ...d.training,
    experience: 'intermediate', environment: 'commercial_gym',
    equipmentIds: ['barbell', 'dumbbells', 'squat_rack', 'flat_bench', 'cable_machine', 'lat_pulldown'],
    preferredDays: [1, 2, 4, 5],
  }
  d.food = { ...d.food, mealsPerDay: 4 }
  return d
}

/** A valid AI response: the rules plan relabelled, as a good model would return. */
function goodAiProposal(draft: OnboardingDraft): GeneratedProposal {
  return { ...buildBaselineProposal(draft)!, provider: 'ai', confidence: 'high' }
}

beforeEach(() => resetRateLimit())

describe('rate limiting', () => {
  it('falls back to the rules plan on a 429 rather than surfacing an error', async () => {
    const draft = baseDraft()
    const fetchAiProposal = vi.fn(async () => {
      throw new RateLimitedError()
    })

    const outcome = await requestProposal(draft, { fetchAiProposal })

    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') throw new Error('expected a proposal')
    expect(outcome.proposal.provider).toBe('rules')
    expect(outcome.proposal.training.days.length).toBeGreaterThan(0)
    expect(outcome.proposal.requiresConfirmation).toBe(true)
  })

  it('does not re-attempt a rate-limited endpoint on the next call', async () => {
    const draft = baseDraft()
    const fetchAiProposal = vi.fn(async () => {
      throw new RateLimitedError()
    })

    await requestProposal(draft, { fetchAiProposal })
    await requestProposal(draft, { fetchAiProposal })
    await requestProposal(draft, { fetchAiProposal })

    // One throttled request must not become a stream of them.
    expect(fetchAiProposal).toHaveBeenCalledTimes(1)
    expect(isRateLimited()).toBe(true)
  })

  it('tries again once the cooldown has elapsed', async () => {
    const draft = baseDraft()
    const fetchAiProposal = vi
      .fn<(d: OnboardingDraft) => Promise<GeneratedProposal>>()
      .mockRejectedValueOnce(new RateLimitedError())
      .mockResolvedValueOnce(goodAiProposal(draft))

    const start = 1_000_000
    await requestProposal(draft, { fetchAiProposal, now: () => start })
    await requestProposal(draft, { fetchAiProposal, now: () => start + 1000 })
    expect(fetchAiProposal).toHaveBeenCalledTimes(1)

    const after = await requestProposal(draft, {
      fetchAiProposal,
      now: () => start + RATE_LIMIT_COOLDOWN_MS + 1,
    })
    expect(fetchAiProposal).toHaveBeenCalledTimes(2)
    if (after.status !== 'ok') throw new Error('expected a proposal')
    expect(after.proposal.provider).toBe('ai')
  })

  it('explains the downgrade instead of silently degrading', async () => {
    const draft = baseDraft()
    const outcome = await requestProposal(draft, {
      fetchAiProposal: async () => {
        throw new RateLimitedError()
      },
    })

    if (outcome.status !== 'ok') throw new Error('expected a proposal')
    expect(outcome.proposal.cautions.some((c) => /standard rules/i.test(c))).toBe(true)
    // A downgraded plan should not also look maximally confident.
    expect(outcome.proposal.confidence).not.toBe('high')
  })
})

describe('other AI failures', () => {
  it('falls back when the provider is unreachable', async () => {
    const draft = baseDraft()
    const outcome = await requestProposal(draft, {
      fetchAiProposal: async () => {
        throw new Error('network down')
      },
    })

    if (outcome.status !== 'ok') throw new Error('expected a proposal')
    expect(outcome.proposal.provider).toBe('rules')
    // A generic failure is not a rate limit, so the next call may still try.
    expect(isRateLimited()).toBe(false)
  })

  it('discards an AI proposal that fails the guard rather than repairing it', async () => {
    const draft = baseDraft()
    const outcome = await requestProposal(draft, {
      fetchAiProposal: async () => {
        const bad = goodAiProposal(draft)
        bad.nutrition.calories = { min: 800, max: 900 }
        return bad
      },
    })

    if (outcome.status !== 'ok') throw new Error('expected a proposal')
    expect(outcome.proposal.provider).toBe('rules')
    // The reason is named, so a reviewer can see which rule the model broke.
    expect(outcome.proposal.cautions.some((c) => c.includes('calories_below_floor'))).toBe(true)
    // And the returned plan is the known-good one, not a patched-up hybrid.
    expect(outcome.proposal.nutrition.calories.min).toBeGreaterThanOrEqual(1500)
  })

  it('keeps a validated AI proposal and still requires confirmation', async () => {
    const draft = baseDraft()
    const outcome = await requestProposal(draft, {
      fetchAiProposal: async () => goodAiProposal(draft),
    })

    if (outcome.status !== 'ok') throw new Error('expected a proposal')
    expect(outcome.proposal.provider).toBe('ai')
    expect(outcome.proposal.requiresConfirmation).toBe(true)
  })
})

describe('without an AI provider at all', () => {
  it('returns the deterministic plan with no caution or downgrade', async () => {
    const outcome = await requestProposal(baseDraft())

    if (outcome.status !== 'ok') throw new Error('expected a proposal')
    expect(outcome.proposal.provider).toBe('rules')
    // Offline-by-design is the normal path, not a degraded one.
    expect(outcome.proposal.cautions.some((c) => /standard rules/i.test(c))).toBe(false)
  })

  it('reports insufficient answers rather than asking a model to invent them', async () => {
    const outcome = await requestProposal(emptyDraft(), {
      fetchAiProposal: async () => {
        throw new Error('should never be called')
      },
    })

    expect(outcome.status).toBe('insufficient')
  })
})
