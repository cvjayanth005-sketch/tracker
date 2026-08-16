import type { MetricKey } from '@/domain/compliance'
import { targetCount, type DayTargetSegment } from './dayTargetRingModel'
import {
  INSIGHT_LABEL,
  formatActual,
  formatBand,
  type Insight,
  type TodayTarget,
} from './todayTargets'

/**
 * Daily progress: secondary to the action list by design.
 *
 * The ring answers "how much of today is settled", the tiles answer "where
 * exactly", and both stay compact so they never compete with the three actions
 * above. Each tile is a real button that scrolls its logger into view, so the
 * ring is a navigation aid rather than an ornament.
 */

const OUTCOME_CLASS: Record<string, string> = {
  hit: 'today-outcome-hit',
  missed: 'today-outcome-missed',
  unknown: 'today-outcome-unknown',
  notScheduled: 'today-outcome-not-scheduled',
}

const OUTCOME_LABEL: Record<string, string> = {
  hit: 'On target',
  missed: 'Off target',
  unknown: 'Not logged',
  notScheduled: 'Not scheduled',
}

/**
 * Segmented ring, one arc per applicable target.
 *
 * Drawn with stroke-dasharray on a rotated circle so each arc is a genuine
 * segment rather than a stacked overlay — an unlogged target has to look
 * different from a failed one, and layering opacity cannot express that.
 */
function TargetRing({ segments, size = 96 }: { segments: DayTargetSegment[]; size?: number }) {
  const { hit, applicable } = targetCount(segments)
  const stroke = 8
  const radius = size / 2 - stroke / 2
  const circumference = 2 * Math.PI * radius
  // `targetSegmentsForDay` already drops not-scheduled metrics, so every
  // segment here is one the day actually asked for.
  const shown = segments
  const gap = 3
  const arc = shown.length > 0 ? circumference / shown.length - gap : 0

  const colorFor = (outcome: string): string => {
    if (outcome === 'hit') return 'var(--app-success)'
    if (outcome === 'missed') return 'var(--app-energy)'
    return 'var(--app-line-strong)'
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        {shown.map((segment, index) => (
          <circle
            key={segment.metric}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colorFor(segment.outcome)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0, arc)} ${circumference}`}
            strokeDashoffset={-(index * (circumference / Math.max(1, shown.length)))}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="today-numeral text-lg font-semibold leading-none text-[var(--app-ink)]">
          {hit}/{applicable}
        </span>
        <span className="app-eyebrow mt-0.5 text-[9px]">targets</span>
      </div>
    </div>
  )
}

export function TodayProgress({
  segments,
  targets,
  insight,
  onFocusMetric,
}: {
  segments: DayTargetSegment[]
  targets: TodayTarget[]
  insight: Insight
  onFocusMetric: (metric: MetricKey) => void
}) {
  return (
    <section className="app-panel p-4 sm:p-5" aria-labelledby="today-progress-heading">
      <div className="flex items-center gap-4">
        <TargetRing segments={segments} />
        <div className="min-w-0">
          <h2 id="today-progress-heading" className="app-eyebrow">
            Today&apos;s progress
          </h2>
          {/*
            Plain language rather than a percentage: a bare "68%" tells nobody
            whether to change anything, and the averages behind it are already
            in the logger.
          */}
          <div className="mt-1 text-[15px] font-semibold text-[var(--app-ink)]">
            {INSIGHT_LABEL[insight.verdict]}
          </div>
          <p className="app-copy mt-1 text-[13px] leading-relaxed">{insight.summary}</p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {targets.map((target) => (
          <li key={target.metric}>
            <button
              type="button"
              className="today-metric w-full p-3"
              onClick={() => onFocusMetric(target.metric)}
              aria-label={`${target.label}: ${OUTCOME_LABEL[target.outcome] ?? 'unknown'}. Jump to its logger.`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="app-eyebrow">{target.label}</span>
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                    OUTCOME_CLASS[target.outcome] ?? 'today-outcome-unknown'
                  }`}
                >
                  {OUTCOME_LABEL[target.outcome] ?? 'Not logged'}
                </span>
              </span>

              <span className="mt-1.5 flex items-baseline gap-1">
                <span className="today-numeral text-lg font-semibold leading-none text-[var(--app-ink)]">
                  {formatActual(target.actual, target.metric)}
                </span>
                <span className="app-copy text-[11px]">
                  / {formatBand(target.band)} {target.unit}
                </span>
              </span>

              <span className="today-bar mt-2 block">
                <span
                  className={`today-bar-fill block ${
                    target.outcome === 'hit'
                      ? 'today-bar-fill--hit'
                      : target.outcome === 'missed'
                        ? 'today-bar-fill--missed'
                        : ''
                  }`}
                  // Zero-width when unknown, so the track still reads as a bar.
                  style={{ width: `${Math.round((target.progress ?? 0) * 100)}%` }}
                />
              </span>

              {target.hint ? (
                <span className="app-copy mt-1.5 block text-[11px] leading-snug">{target.hint}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
