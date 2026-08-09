import type { ComplianceReport, MetricKey } from '@/domain/compliance'

/**
 * Three-ring weekly summary.
 *
 * Each ring encodes the four-bucket compliance model directly rather than
 * collapsing it to one percentage:
 *
 *   solid arc  — days logged and hit
 *   faded arc  — days logged and missed (the ring's own hue, dimmed)
 *   grey arc   — days never logged
 *
 * That matters because a ring that filled on hit-rate alone would show a
 * gloriously complete circle for a week you barely tracked. Here an untracked
 * week is visibly full of gaps, which is the honest picture.
 *
 * Colours are validated for CVD separation (emerald/orange/indigo) and every
 * ring is directly labelled below, so identity never rests on colour alone.
 */

const RINGS: Array<{ metric: MetricKey; label: string; color: string }> = [
  { metric: 'calories', label: 'Calories', color: '#34d399' },
  { metric: 'protein', label: 'Protein', color: '#fb923c' },
  { metric: 'steps', label: 'Steps', color: '#818cf8' },
]

const SIZE = 132
const STROKE = 12
const GAP = 4

export function ActivityRings({
  compliance,
  className = '',
}: {
  compliance: ComplianceReport | undefined
  className?: string
}) {
  const center = SIZE / 2

  return (
    <div className={`flex items-center gap-4 sm:gap-5 ${className}`}>
      {/* Rings have no interior text, so scaling the viewBox is lossless. */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-26 w-26 shrink-0 sm:h-33 sm:w-33"
        role="img"
        aria-label="Weekly compliance rings for calories, protein and steps"
      >
        <g transform={`rotate(-90 ${center} ${center})`}>
          {RINGS.map((ring, i) => {
            const radius = center - STROKE / 2 - i * (STROKE + GAP)
            const circumference = 2 * Math.PI * radius
            const m = compliance?.metrics[ring.metric]

            const eligible = m?.eligibleDays ?? 0
            const hit = eligible > 0 ? (m as NonNullable<typeof m>).hitDays / eligible : 0
            const missed = eligible > 0 ? (m as NonNullable<typeof m>).missedDays / eligible : 0
            const unknown = eligible > 0 ? (m as NonNullable<typeof m>).unknownDays / eligible : 1

            const arc = (fraction: number) => fraction * circumference
            const common = {
              cx: center,
              cy: center,
              r: radius,
              fill: 'none',
              strokeWidth: STROKE,
              strokeLinecap: 'butt' as const,
            }

            return (
              <g key={ring.metric}>
                <circle {...common} stroke="rgb(255 255 255 / 0.05)" />

                {/*
                  Unknown days read as a neutral grey span rather than a dashed
                  one: strokeDasharray is already carrying segment placement
                  here, so it cannot also carry a dash texture. Neutral vs the
                  ring's own hue is a clear enough third state.
                */}
                {unknown > 0 ? (
                  <circle
                    {...common}
                    stroke="rgb(255 255 255 / 0.12)"
                    strokeDasharray={`${arc(unknown)} ${circumference}`}
                    strokeDashoffset={-arc(hit + missed)}
                  />
                ) : null}

                {missed > 0 ? (
                  <circle
                    {...common}
                    stroke={ring.color}
                    opacity={0.22}
                    strokeDasharray={`${arc(missed)} ${circumference}`}
                    strokeDashoffset={-arc(hit)}
                  />
                ) : null}

                {hit > 0 ? (
                  <circle
                    {...common}
                    stroke={ring.color}
                    strokeLinecap="round"
                    strokeDasharray={`${arc(hit)} ${circumference}`}
                  />
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>

      <ul className="min-w-0 space-y-2">
        {RINGS.map((ring) => {
          const m = compliance?.metrics[ring.metric]
          return (
            <li key={ring.metric} className="text-[12px] leading-tight">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: ring.color }}
                />
                <span className="text-ink-200">{ring.label}</span>
                <span className="tabular ml-auto pl-3 font-medium text-ink-50">
                  {m?.hitRatePct == null ? '—' : `${Math.round(m.hitRatePct)}%`}
                </span>
              </div>
              <div className="tabular ml-4 text-[11px] text-ink-400">
                {m
                  ? [
                      `${m.hitDays} hit`,
                      `${m.missedDays} missed`,
                      ...(m.unknownDays > 0 ? [`${m.unknownDays} unlogged`] : []),
                    ].join(' · ')
                  : 'no data'}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
