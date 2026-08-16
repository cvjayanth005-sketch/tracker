import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatShort } from '@/domain/date'
import type { TrendPoint } from '@/domain/trend'
import type { LocalDate } from '@/domain/types'

/**
 * Weight over time.
 *
 * Two layers, deliberately unequal: raw weigh-ins are recessive gray dots
 * (context, not signal) and the trailing average is the one prominent line —
 * because the trend is the only series any decision is allowed to read. They
 * differ by mark type as well as colour, so the distinction survives CVD and
 * grayscale printing.
 *
 * The SVG is measured and drawn at 1 unit = 1 CSS pixel rather than using a
 * fixed viewBox stretched to fit. A fixed viewBox scales its own text, so the
 * same chart rendered in a phone card and a full-width desktop panel would
 * have wildly different label sizes.
 */

const PAD = { top: 14, right: 12, bottom: 22, left: 40 }
const PAD_COMPACT = { top: 4, right: 2, bottom: 4, left: 2 }

export function TrendChart({
  series,
  targetKg,
  phaseStarts,
  compact = false,
  height = 180,
  className = '',
}: {
  series: TrendPoint[]
  targetKg?: number | null
  /** Dates a new phase began, marked on the axis so trend shifts have context. */
  phaseStarts?: Array<{ date: LocalDate; name: string }>
  /**
   * Sparkline mode: the shape of the trend without the apparatus around it.
   * Axis labels, ticks, dots and the hover readout all go, because at 48px they
   * would be unreadable and the point here is the silhouette, not the values —
   * those are already stated next to it.
   */
  compact?: boolean
  height?: number
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(host)
    setWidth(host.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Clear any hover state if the pointer leaves via a scroll rather than a move.
  useEffect(() => {
    const clear = () => setActive(null)
    window.addEventListener('scroll', clear, { passive: true })
    return () => window.removeEventListener('scroll', clear)
  }, [])

  // A zero width means the chart has not been measured yet — it mounts inside a
  // collapsed <details> — not that there is nothing to draw. Reporting that as
  // "no weigh-ins" blames the user for a layout timing detail.
  const measured = width > 0

  const hasData = useMemo(
    () => series.some((p) => p.rawKg !== null || p.trendKg !== null),
    [series],
  )

  const PADDING = compact ? PAD_COMPACT : PAD

  const model = useMemo(() => {
    if (width <= 0) return null

    const values: number[] = []
    for (const p of series) {
      if (p.rawKg !== null) values.push(p.rawKg)
      if (p.trendKg !== null) values.push(p.trendKg)
    }
    /*
     * The target is part of the y-range on the full chart, because the distance
     * to it is the point. A sparkline is the opposite: it shows the shape of
     * recent movement, and including a target eight kilos away flattens that
     * shape into a straight line.
     */
    if (targetKg != null && !compact) values.push(targetKg)
    if (values.length === 0) return null

    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const pad = Math.max(0.4, (rawMax - rawMin) * 0.12)
    const min = rawMin - pad
    const max = rawMax + pad
    const span = max - min || 1

    const innerW = Math.max(1, width - PADDING.left - PADDING.right)
    const innerH = Math.max(1, height - PADDING.top - PADDING.bottom)
    const x = (i: number) =>
      PADDING.left + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW)
    const y = (v: number) => PADDING.top + innerH - ((v - min) / span) * innerH

    /*
     * Phase boundaries, placed by matching the date to its index in the series.
     * A phase change usually moves calories, so an inflection in the trend right
     * after one is expected rather than alarming — without the marker the reader
     * has no way to tell a deliberate change from a stall.
     */
    const marks = (phaseStarts ?? []).flatMap((p) => {
      const index = series.findIndex((point) => point.date === p.date)
      // Silently drop boundaries outside the visible window rather than
      // clamping them to an edge, which would imply a change that is not there.
      return index <= 0 ? [] : [{ x: x(index), name: p.name }]
    })

    // Break the trend path wherever data is missing, rather than bridging a gap
    // with a straight line that implies readings we never took.
    const segments: string[] = []
    let current: string[] = []
    series.forEach((p, i) => {
      if (p.trendKg === null) {
        if (current.length > 1) segments.push(current.join(' '))
        current = []
        return
      }
      current.push(
        `${current.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.trendKg).toFixed(1)}`,
      )
    })
    if (current.length > 1) segments.push(current.join(' '))

    // Area under the trend line, for a soft glass-friendly fill.
    const lastSegment = segments.at(-1)
    let area: string | null = null
    const firstTrendIndex = series.findIndex((p) => p.trendKg !== null)
    if (lastSegment && firstTrendIndex >= 0) {
      const startX = x(firstTrendIndex)
      const endX = x(series.length - 1)
      const baseY = PADDING.top + innerH
      area = `${segments.join(' ')} L${endX.toFixed(1)},${baseY} L${startX.toFixed(1)},${baseY} Z`
    }

    const ticks = [min + span * 0.15, min + span * 0.5, min + span * 0.85]

    return { x, y, segments, area, ticks, innerW, marks }
  }, [series, targetKg, phaseStarts, width, height, PADDING, compact])

  const point = active === null ? null : series[active]

  const handlePointer = (clientX: number, svg: SVGSVGElement) => {
    if (!model) return
    const rect = svg.getBoundingClientRect()
    const ratio = (clientX - rect.left - PADDING.left) / model.innerW
    const index = Math.round(ratio * (series.length - 1))
    setActive(Math.max(0, Math.min(series.length - 1, index)))
  }

  return (
    <div ref={hostRef} className={className}>
      {!model ? (
        <div
          className="glass-inset flex items-center justify-center radius-control type-caption text-[var(--app-muted)]"
          style={{ height }}
        >
          {!measured ? '' : hasData ? 'Preparing chart…' : 'No weigh-ins yet'}
        </div>
      ) : (
        <>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block touch-none"
            role="img"
            aria-label="Body weight over time with trailing average"
            onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget)}
            onMouseLeave={() => setActive(null)}
            onTouchStart={(e) => {
              const t = e.touches[0]
              if (t) handlePointer(t.clientX, e.currentTarget)
            }}
            onTouchMove={(e) => {
              const t = e.touches[0]
              if (t) handlePointer(t.clientX, e.currentTarget)
            }}
            onTouchEnd={() => setActive(null)}
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--app-blue)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--app-blue)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {(compact ? [] : model.ticks).map((value) => (
              <g key={value}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={model.y(value)}
                  y2={model.y(value)}
                  stroke="var(--app-line)"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 8}
                  y={model.y(value) + 3.5}
                  textAnchor="end"
                  className="tabular"
                  fontSize={10}
                  fill="var(--app-muted)"
                >
                  {value.toFixed(1)}
                </text>
              </g>
            ))}

            {/*
              Drawn before the data so a boundary never obscures the line it is
              meant to explain.
            */}
            {(compact ? [] : model.marks).map((mark) => (
              <g key={`${mark.name}-${mark.x}`}>
                <line
                  x1={mark.x}
                  x2={mark.x}
                  y1={PADDING.top}
                  y2={height - PADDING.bottom}
                  stroke="var(--app-line-strong)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <text
                  x={mark.x + 3}
                  y={PADDING.top + 9}
                  fontSize={9}
                  fill="var(--app-muted)"
                >
                  {mark.name}
                </text>
              </g>
            ))}

            {model.area ? <path d={model.area} fill="url(#trend-fill)" /> : null}

            {targetKg != null && !compact ? (
              <g>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={model.y(targetKg)}
                  y2={model.y(targetKg)}
                  stroke="var(--app-warm-neutral)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
                <text
                  x={width - PADDING.right}
                  y={model.y(targetKg) - 5}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--app-warm-neutral)"
                >
                  target {targetKg}
                </text>
              </g>
            ) : null}

            {(compact ? [] : series).map((p, i) =>
              p.rawKg === null ? null : (
                <circle
                  key={p.date}
                  cx={model.x(i)}
                  cy={model.y(p.rawKg)}
                  r={2}
                  fill="var(--app-muted)"
                  opacity={0.45}
                />
              ),
            )}

            {model.segments.map((path) => (
              <path
                key={path.slice(0, 24)}
                d={path}
                fill="none"
                stroke="var(--app-blue)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {active !== null && point ? (
              <g>
                <line
                  x1={model.x(active)}
                  x2={model.x(active)}
                  y1={PADDING.top}
                  y2={height - PADDING.bottom}
                  stroke="var(--app-line-strong)"
                  strokeWidth={1}
                />
                {point.trendKg !== null ? (
                  <circle
                    cx={model.x(active)}
                    cy={model.y(point.trendKg)}
                    r={4}
                    fill="var(--app-blue)"
                    stroke="var(--app-canvas-pure)"
                    strokeWidth={2}
                  />
                ) : null}
              </g>
            ) : null}

            {compact ? null : (
              <>
                <text x={PADDING.left} y={height - 6} fontSize={10} fill="var(--app-muted)">
                  {series[0] ? formatShort(series[0].date) : ''}
                </text>
                <text
                  x={width - PADDING.right}
                  y={height - 6}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--app-muted)"
                >
                  {series.at(-1) ? formatShort(series.at(-1)!.date) : ''}
                </text>
              </>
            )}
          </svg>

          {compact ? null : (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 type-caption">
            <span className="flex items-center gap-3 text-[var(--app-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-accent" />
                7-day average
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300/50" />
                daily
              </span>
            </span>
            {point ? (
              <span className="tabular text-[var(--app-ink)]">
                {formatShort(point.date)} ·{' '}
                {point.trendKg !== null ? `${point.trendKg.toFixed(2)} kg` : 'no trend'}
                {point.rawKg !== null ? ` · raw ${point.rawKg.toFixed(1)}` : ''}
              </span>
            ) : null}
          </div>
          )}
        </>
      )}
    </div>
  )
}
