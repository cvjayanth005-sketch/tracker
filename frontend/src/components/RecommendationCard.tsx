import { buildCoachSummary, type PhaseReview, type Recommendation } from '@/domain/rules'
import { getCoachNote } from '@/ai/coachNote'
import { useDashboard } from '@/hooks/useDashboard'
import { useState } from 'react'
import { Button, Card, Pill } from './ui'

export function RecommendationCard({
  recommendation,
  review,
}: {
  recommendation: Recommendation
  review?: PhaseReview | undefined
}) {
  const dash = useDashboard()
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<'groq' | 'rules' | null>(null)

  const tone =
    recommendation.severity === 'action'
      ? 'warn'
      : recommendation.severity === 'warn'
        ? 'bad'
        : 'info'

  const loadNote = async () => {
    if (!dash.phase || !review) return
    setLoading(true)
    const result = await getCoachNote(buildCoachSummary(dash.today, dash.phase, recommendation, review))
    setLoading(false)
    if (result.status === 'cached' || result.status === 'fresh') {
      setNote(result.note)
      setProvider(result.provider)
    }
    else setNote(`Coach note unavailable: ${result.reason}`)
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Pill tone={tone}>{recommendation.code.replaceAll('_', ' ')}</Pill>
          <h2 className="mt-2 text-base font-semibold leading-tight text-ink-50">
            {recommendation.headline}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" onClick={() => void loadNote()} disabled={loading}>
            {loading ? 'Thinking…' : 'Coach'}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-300">{recommendation.detail}</p>
      {recommendation.proposedCalories !== null ? (
        <div className="mt-3 rounded-xl bg-ink-900 px-3 py-2 text-[13px] text-ink-300">
          Suggested target:{' '}
          <span className="font-semibold text-ink-50">{recommendation.proposedCalories} kcal</span>
        </div>
      ) : null}
      {note ? (
        <div className="mt-3 border-t border-white/7 pt-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">
            {provider === 'groq' ? 'AI coach' : 'Rules coach'}
          </div>
          <p className="text-[13px] leading-relaxed text-info">{note}</p>
        </div>
      ) : null}
    </Card>
  )
}
