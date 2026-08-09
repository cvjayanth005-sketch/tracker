import { db } from '@/db/database'
import { API_BASE } from '@/sync/client'
import { RULES_VERSION, type CoachStateSummary } from '@/domain/rules'
import type { AiNote } from '@/domain/types'

/**
 * Cached coaching note.
 *
 * The cache key covers the state summary AND the prompt/rules versions. Keying
 * on the summary alone means editing the prompt or a rule leaves every cached
 * note permanently stale — the note would keep describing decisions the engine
 * no longer makes.
 */

export const PROMPT_VERSION = '1.1.0'

/** Stable stringify: key order must not change the hash. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}

export async function summaryHash(summary: CoachStateSummary): Promise<string> {
  const payload = stable({ summary, PROMPT_VERSION, RULES_VERSION })
  const bytes = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type CoachNoteResult =
  | { status: 'cached'; note: string; provider: 'groq' }
  | { status: 'fresh'; note: string; provider: 'groq' | 'rules'; model?: string }
  | { status: 'unavailable'; reason: string }

/**
 * Returns a note only if one is already cached or the endpoint answers.
 * The dashboard must render fully without this — the rules already decided
 * everything; the note is commentary.
 */
export async function getCoachNote(
  summary: CoachStateSummary,
  { allowNetwork = true }: { allowNetwork?: boolean } = {},
): Promise<CoachNoteResult> {
  const hash = await summaryHash(summary)
  const cached = await db.aiNotes.get(hash)
  if (cached) return { status: 'cached', note: cached.note, provider: 'groq' }

  if (!allowNetwork) return { status: 'unavailable', reason: 'not generated yet' }
  if (!API_BASE) return { status: 'unavailable', reason: 'no coach endpoint configured' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { status: 'unavailable', reason: 'offline' }
  }

  try {
    const res = await fetch(`${API_BASE}/api/coach-note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        summary,
        promptVersion: PROMPT_VERSION,
        rulesVersion: RULES_VERSION,
      }),
    })
    if (!res.ok) return { status: 'unavailable', reason: `coach endpoint ${res.status}` }
    const payload = (await res.json()) as {
      note: string
      provider?: 'groq' | 'rules'
      model?: string | null
    }
    const provider = payload.provider ?? 'rules'

    // Cache only genuine AI narration. A deterministic fallback should be
    // retried after the user adds a key or a transient provider outage ends.
    if (provider === 'groq') {
      const record: AiNote = {
        hash,
        promptVersion: PROMPT_VERSION,
        rulesVersion: RULES_VERSION,
        summaryJson: stable(summary),
        note: payload.note,
        createdAt: new Date().toISOString(),
      }
      await db.aiNotes.put(record)
      await pruneNotes()
    }
    return {
      status: 'fresh',
      note: payload.note,
      provider,
      ...(payload.model ? { model: payload.model } : {}),
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getCoachAudio(summary: CoachStateSummary): Promise<string> {
  if (!API_BASE) throw new Error('No voice endpoint configured.')
  const res = await fetch(`${API_BASE}/api/coach-note/audio`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      summary,
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
    }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { detail?: string } | null
    throw new Error(payload?.detail ?? `Voice endpoint ${res.status}`)
  }
  const payload = (await res.json()) as { audio_url: string }
  return payload.audio_url.startsWith('http') ? payload.audio_url : `${API_BASE}${payload.audio_url}`
}

/** Keep the cache small; old notes describe states that no longer exist. */
async function pruneNotes(keep = 100): Promise<void> {
  const count = await db.aiNotes.count()
  if (count <= keep) return
  const all = await db.aiNotes.orderBy('createdAt').toArray()
  const stale = all.slice(0, count - keep)
  await db.aiNotes.bulkDelete(stale.map((n) => n.hash))
}
