import { Link } from 'react-router-dom'
import type { MetricKey } from '@/domain/compliance'
import type { Recommendation } from '@/domain/rules'
import { Card } from '@/components/ui'
import { DayTargetRing } from './DayTargetRing'
import type { DayTargetSegment } from './dayTargetRingModel'
import type { TodayFocus } from './todayFocusModel'

const LABEL: Record<MetricKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  steps: 'Steps',
  run: 'Run',
  gym: 'Gym',
  sleep: 'Sleep',
  meals: 'Meals',
}

export function TodayFocusCard({
  focus,
  segments,
  attentionMetrics,
  recommendation,
  onActivate,
}: {
  focus: TodayFocus
  segments: DayTargetSegment[]
  attentionMetrics: MetricKey[]
  recommendation: Recommendation | null
  onActivate: (metric: MetricKey) => void
}) {
  const metricAction = focus.action?.kind === 'metric' ? focus.action.metric : null
  const action =
    focus.action?.kind === 'workout' ? (
      <Link
        to="/workout"
        className="inline-flex min-h-11 items-center justify-center radius-control bg-accent px-5 text-sm font-semibold text-ink-950 shadow-[0_8px_24px_-8px] shadow-accent/50 active:bg-accent-dim"
      >
        {focus.actionLabel}
      </Link>
    ) : metricAction ? (
      <button
        type="button"
        onClick={() => onActivate(metricAction)}
        className="min-h-11 radius-control bg-accent px-5 text-sm font-semibold text-ink-950 shadow-[0_8px_24px_-8px] shadow-accent/50 active:bg-accent-dim"
      >
        {focus.actionLabel}
      </button>
    ) : null

  return (
    <Card className="overflow-hidden">
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Today&apos;s focus · {focus.eyebrow}
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-[var(--app-ink)] sm:text-3xl">
            {focus.title}
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--app-ink-soft)]">{focus.detail}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>

        <div className="mx-auto sm:mx-0">
          <DayTargetRing compact segments={segments} onActivate={onActivate} />
        </div>
      </div>

      {attentionMetrics.length > 0 || recommendation ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--app-line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          {attentionMetrics.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
              <span className="text-[var(--app-muted)]">Also open</span>
              {attentionMetrics.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  onClick={() => onActivate(metric)}
                  className="min-h-11 text-left font-medium text-[var(--app-ink)] underline decoration-white/15 underline-offset-4 transition-colors hover:text-[var(--app-ink)]"
                >
                  {LABEL[metric]}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {recommendation ? (
            <div className="min-w-0 text-[12px] text-[var(--app-muted)] sm:max-w-[46%] sm:text-right">
              <span className="text-[var(--app-muted)]">Plan signal </span>
              <span className="font-medium text-[var(--app-ink)]">{recommendation.headline}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
