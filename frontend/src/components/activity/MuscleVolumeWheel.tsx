import { useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  MUSCLE_BUCKETS,
  MUSCLE_BUCKET_LABEL,
  MUSCLE_METRIC_LABEL,
  MUSCLE_METRIC_UNIT,
  type MuscleMetricMode,
  type MuscleMetrics,
} from '@/domain/muscleVolume'

/**
 * Six-axis volume radar, one point per muscle bucket.
 *
 * The shape is the message: an even hexagon means balanced programming, a
 * pulled-in vertex means a bucket has been quietly skipped. That reads faster
 * than six separate bars, which is why this exists instead of a bar chart —
 * this is comparison of six numbers against each other, not against a target.
 *
 * Each vertex carries its own value-over-label pair rather than a separate
 * legend below the chart, so the number that explains a dent in the hexagon
 * sits right where the dent is. The header doubles as a mode switch: the same
 * sets read as tonnage, frequency, or total reps depending on what someone
 * actually wants to know this glance.
 */

const SIZE = 320
const CENTER = SIZE / 2
const MAX_RADIUS = 78
// Where the value/label pair sits, as a fraction of the ring's own radius —
// far enough out that it never touches the outermost ring.
const LABEL_RADIUS_FRACTION = 1.34
const AXES = MUSCLE_BUCKETS.length
const MODES: MuscleMetricMode[] = ['volume', 'frequency', 'load']
// Five rings rather than three: a sparser grid reads as a flat hexagon, where
// this density is what gives the small diamond-shaped facets between rings
// and spokes their faceted, almost cut-gem look.
const RINGS = [0.2, 0.4, 0.6, 0.8, 1]

function pointAt(index: number, radiusFraction: number): { x: number; y: number } {
  // Start at the top (12 o'clock) and go clockwise.
  const angle = (Math.PI * 2 * index) / AXES - Math.PI / 2
  const r = MAX_RADIUS * radiusFraction
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) }
}

function ringPath(radiusFraction: number): string {
  return (
    MUSCLE_BUCKETS.map((_, i) => {
      const { x, y } = pointAt(i, radiusFraction)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ') + ' Z'
  )
}

export function MuscleVolumeWheel({ metrics, windowLabel }: { metrics: MuscleMetrics; windowLabel: string }) {
  const [mode, setMode] = useState<MuscleMetricMode>('volume')
  const [menuOpen, setMenuOpen] = useState(false)
  const volume = metrics[mode]
  const unit = MUSCLE_METRIC_UNIT[mode]

  const max = Math.max(1, ...MUSCLE_BUCKETS.map((b) => volume[b]))
  const hasAnyVolume = max > 1

  const shapePath = hasAnyVolume
    ? MUSCLE_BUCKETS.map((bucket, i) => {
        const fraction = volume[bucket] / max
        const { x, y } = pointAt(i, fraction)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      }).join(' ') + ' Z'
    : ''

  return (
    <div className="w-full">
      <div className="relative flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="motion-press flex items-center gap-1.5 type-caption font-semibold text-[var(--app-ink)]"
        >
          <Icon name="workout" className="h-4 w-4 text-[var(--app-muted)]" />
          {MUSCLE_METRIC_LABEL[mode]}
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div
              role="menu"
              className="absolute right-0 top-7 z-20 w-48 radius-inset border border-[var(--app-line)] bg-[var(--app-canvas-pure)] p-1.5 shadow-[var(--app-shadow-raised)]"
            >
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m === mode}
                  onClick={() => {
                    setMode(m)
                    setMenuOpen(false)
                  }}
                  className="motion-press flex w-full items-center gap-2 radius-control px-2.5 py-2 text-left type-caption text-[var(--app-ink)] hover:bg-[var(--app-inset)]"
                >
                  <span className="w-4 shrink-0 text-[var(--app-blue)]">{m === mode ? '✓' : ''}</span>
                  {MUSCLE_METRIC_LABEL[m]}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="relative mx-auto mt-3" style={{ width: '100%', maxWidth: SIZE, aspectRatio: '1 / 1' }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${MUSCLE_METRIC_LABEL[mode]} by muscle group`}
          className="absolute inset-0 h-full w-full"
        >
          {RINGS.map((r, i) => (
            <path
              key={r}
              d={ringPath(r)}
              fill="none"
              stroke={i === RINGS.length - 1 ? 'var(--app-line-strong)' : 'var(--app-line)'}
              strokeWidth={1}
            />
          ))}
          {MUSCLE_BUCKETS.map((_, i) => {
            const outer = pointAt(i, 1)
            return (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={outer.x}
                y2={outer.y}
                stroke="var(--app-line)"
                strokeWidth={1}
              />
            )
          })}
          <circle cx={CENTER} cy={CENTER} r={2} fill="var(--app-muted)" />

          {hasAnyVolume ? (
            <path
              d={shapePath}
              fill="var(--app-blue)"
              fillOpacity={0.18}
              stroke="var(--app-blue)"
              strokeWidth={1.75}
              strokeLinejoin="round"
            />
          ) : null}

          {hasAnyVolume
            ? MUSCLE_BUCKETS.map((bucket, i) => {
                const fraction = volume[bucket] / max
                const { x, y } = pointAt(i, fraction)
                return <circle key={bucket} cx={x} cy={y} r={3} fill="var(--app-blue)" />
              })
            : null}
        </svg>

        {MUSCLE_BUCKETS.map((bucket, i) => {
          const { x, y } = pointAt(i, LABEL_RADIUS_FRACTION)
          return (
            <div
              key={bucket}
              className="absolute flex flex-col items-center text-center"
              style={{
                left: `${(x / SIZE) * 100}%`,
                top: `${(y / SIZE) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: '5.5rem',
              }}
            >
              <span className="type-caption font-semibold tabular-nums text-[var(--app-ink)]">
                {Math.round(volume[bucket]).toLocaleString()} {unit}
              </span>
              <span className="type-micro text-[var(--app-muted)]">{MUSCLE_BUCKET_LABEL[bucket]}</span>
            </div>
          )
        })}
      </div>

      {!hasAnyVolume ? (
        <p className="mt-2 text-center type-caption text-[var(--app-muted)]">
          No strength sessions {windowLabel} — values fill in as you log workouts.
        </p>
      ) : null}
    </div>
  )
}
