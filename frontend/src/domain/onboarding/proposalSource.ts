import { buildBaselineProposal } from './baseline'
import { validateProposal } from './guards'
import type { GeneratedProposal, OnboardingDraft } from './types'

/**
 * Chooses between the AI and rules providers.
 *
 * The deterministic proposal is the product, and AI is an optional improvement
 * on it. So this never fails: every path that does not end in a validated AI
 * proposal ends in the rules one, and the user is told which they got rather
 * than being shown an error for a plan the app could always have produced.
 *
 * The rate-limit memory is the reason this is a module rather than a function.
 * A 429 means "stop asking", and retrying on the next keystroke turns one
 * throttled request into a stream of them — so the cooldown is remembered
 * across calls and the AI path is skipped outright while it holds.
 */

/** How long to leave a rate-limited endpoint alone. */
export const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000

export class RateLimitedError extends Error {
  constructor(message = 'The AI provider is rate limited.') {
    super(message)
    this.name = 'RateLimitedError'
  }
}

/** Shared so a 429 from one part of the interview silences the rest. */
let cooldownUntil = 0

export function isRateLimited(nowMs: number = Date.now()): boolean {
  return nowMs < cooldownUntil
}

/** Exposed for tests and for a manual "try AI again" affordance. */
export function resetRateLimit(): void {
  cooldownUntil = 0
}

export function markRateLimited(nowMs: number = Date.now()): void {
  cooldownUntil = nowMs + RATE_LIMIT_COOLDOWN_MS
}

export type ProposalOutcome =
  | { status: 'ok'; proposal: GeneratedProposal }
  | { status: 'insufficient'; missing: string }

export interface RequestProposalOptions {
  /**
   * Calls the AI endpoint. Injected rather than imported so the decision logic
   * is testable without a network, and so the caller owns the transport.
   * Should throw `RateLimitedError` on a 429.
   */
  fetchAiProposal?: (draft: OnboardingDraft) => Promise<GeneratedProposal>
  now?: () => number
}

/**
 * Produce a proposal, preferring AI but never depending on it.
 *
 * Order of preference:
 *   1. A validated AI proposal.
 *   2. The deterministic baseline, with a caution explaining the downgrade.
 *
 * An AI proposal that fails the guard is discarded rather than repaired: a
 * partially corrected plan is one nobody designed, and the rules proposal is
 * already known-good.
 */
export async function requestProposal(
  draft: OnboardingDraft,
  options: RequestProposalOptions = {},
): Promise<ProposalOutcome> {
  const nowMs = (options.now ?? Date.now)()
  const baseline = buildBaselineProposal(draft)

  // Without the required answers there is nothing to propose from, and asking
  // a model to fill them in is exactly the "invent missing health information"
  // failure the product rules forbid.
  if (!baseline) {
    return { status: 'insufficient', missing: 'Required answers are incomplete.' }
  }

  const canTryAi = options.fetchAiProposal !== undefined && !isRateLimited(nowMs)
  if (!canTryAi) {
    return {
      status: 'ok',
      proposal: isRateLimited(nowMs) ? withCaution(baseline, RATE_LIMIT_NOTE) : baseline,
    }
  }

  try {
    const candidate = await options.fetchAiProposal!(draft)
    const validation = validateProposal(candidate, draft)
    if (!validation.ok) {
      return {
        status: 'ok',
        proposal: withCaution(
          baseline,
          `A personalized plan was generated but did not meet the safety rules (${validation.violations
            .map((v) => v.code)
            .join(', ')}), so the standard plan is shown instead.`,
        ),
      }
    }
    // Provenance must survive: a validated AI plan still needs confirmation.
    return {
      status: 'ok',
      proposal: { ...candidate, provider: 'ai', requiresConfirmation: true },
    }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      markRateLimited(nowMs)
      return { status: 'ok', proposal: withCaution(baseline, RATE_LIMIT_NOTE) }
    }
    return { status: 'ok', proposal: withCaution(baseline, OFFLINE_NOTE) }
  }
}

const RATE_LIMIT_NOTE =
  'Personalization is briefly unavailable, so this plan was built from the standard rules.'
const OFFLINE_NOTE =
  'Personalization could not be reached, so this plan was built from the standard rules.'

function withCaution(proposal: GeneratedProposal, note: string): GeneratedProposal {
  return {
    ...proposal,
    provider: 'rules',
    // A downgraded plan is less tailored, and saying so is more useful than a
    // confident-looking one the user cannot distinguish from the real thing.
    confidence: proposal.confidence === 'high' ? 'medium' : proposal.confidence,
    cautions: [...proposal.cautions, note],
  }
}
