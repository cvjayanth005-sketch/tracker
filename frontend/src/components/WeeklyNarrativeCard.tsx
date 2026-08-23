import { useEffect, useState } from 'react'
import { askCoach } from '@/ai/coachChat'
import {
  buildWeeklyNarrativeContext,
  hasEnoughDataForNarrative,
  weeklyNarrativePrompt,
} from '@/domain/weeklyNarrative'
import type { ComplianceReport } from '@/domain/compliance'
import type { LocalDate } from '@/domain/types'

/**
 * One AI-written paragraph summarizing the week, cached per week so opening
 * Today doesn't re-spend an AI call on every visit — only the first open of a
 * given week, or an explicit refresh, actually asks.
 *
 * Degrades in three honest stages, matching how little the data or the
 * network can be trusted at each point: not enough logged yet → says so, no
 * AI call. AI unreachable → says so, offers retry, no fabricated summary.
 * Otherwise → the paragraph.
 */

interface CacheEntry {
  weekStart: LocalDate
  text: string
}

const CACHE_KEY = 'formara-weekly-narrative'

function readCache(weekStart: LocalDate): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    return entry.weekStart === weekStart ? entry.text : null
  } catch {
    return null
  }
}

function writeCache(weekStart: LocalDate, text: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ weekStart, text } satisfies CacheEntry))
  } catch {
    // Best-effort; a failed cache write just means asking again next visit.
  }
}

export function WeeklyNarrativeCard({
  today,
  compliance,
  loggedDays,
  trendWeightChangeKg,
}: {
  today: LocalDate
  compliance: ComplianceReport
  loggedDays: number
  trendWeightChangeKg: number | null
}) {
  const context = buildWeeklyNarrativeContext(today, compliance, loggedDays, trendWeightChangeKg)
  const [text, setText] = useState<string | null>(() => readCache(context.weekStart))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enough = hasEnoughDataForNarrative(loggedDays)

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await askCoach(weeklyNarrativePrompt(), { weeklyNarrative: context }, [])
      setText(response.answer)
      writeCache(context.weekStart, response.answer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the coach.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!enough || text !== null) return
    void generate()
    // Only re-run when the week or the underlying numbers actually change —
    // not on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.weekStart, enough])

  if (!enough) {
    return (
      <div className="app-panel p-4 sm:p-5">
        <p className="app-eyebrow">This week</p>
        <p className="mt-1.5 type-caption text-[var(--app-ink-soft)]">
          Log a couple more days and Formara can summarize how the week went.
        </p>
      </div>
    )
  }

  return (
    <div className="app-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="app-eyebrow">This week</p>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="type-micro font-semibold text-[var(--app-blue)] disabled:opacity-50"
        >
          {busy ? 'Thinking…' : 'Refresh'}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 type-caption text-[var(--app-strain)]">
          {error} <button type="button" onClick={() => void generate()} className="underline">Try again</button>
        </p>
      ) : text ? (
        <p className="mt-1.5 type-caption leading-relaxed text-[var(--app-ink)]">{text}</p>
      ) : (
        <p className="mt-1.5 type-caption text-[var(--app-ink-soft)]">Putting the week together…</p>
      )}
    </div>
  )
}
