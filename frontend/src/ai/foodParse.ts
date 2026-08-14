import { authHeader } from '@/auth/session'
import { API_BASE } from '@/sync/client'
import type { MealSlot } from '@/domain/types'

/**
 * AI meal intake. The user describes what they ate in plain language and the
 * backend estimates it into structured meal drafts (never saved directly — the
 * user reviews and edits, then commits via the repo). When the AI provider is
 * unavailable the backend still returns one draft per described item with blank
 * macros, so the manual half of the flow keeps working offline.
 */

/** A parsed meal the user reviews before saving. All macros may be null. */
export type EstimateConfidence = 'low' | 'medium' | 'high'

export interface MealDraft {
  slot: MealSlot
  name: string
  time: string | null
  quantity: number | null
  unit: string | null
  calories: number | null
  /** Model's self-reported certainty and a plausible calorie band, review-only. */
  confidence: EstimateConfidence | null
  caloriesLow: number | null
  caloriesHigh: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  notes: string | null
}

export interface FoodParseResult {
  meals: MealDraft[]
  summary: string | null
  provider: 'groq' | 'rules'
  /** True when nothing could be estimated — prompt the user to fill macros in. */
  needsManual: boolean
  model?: string | null
  fallback?: boolean
  fallbackReason?: string
}

async function apiError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === 'string') return new Error(payload.detail)
  } catch {
    // Proxies sometimes return non-JSON failure pages.
  }
  return new Error(`Meal parsing failed (${response.status})`)
}

export async function parseMeals(
  text: string,
  defaultSlot: MealSlot,
): Promise<FoodParseResult> {
  if (!API_BASE) throw new Error('Meal parsing needs the backend.')
  const response = await fetch(`${API_BASE}/api/food/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader() },
    body: JSON.stringify({ text, defaultSlot }),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as FoodParseResult
}
