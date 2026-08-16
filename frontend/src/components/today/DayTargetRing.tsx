import { useId } from 'react'
import type { MetricKey } from '@/domain/compliance'
import { Card } from '@/components/ui'
import {
  arcStateForOutcome,
  targetCount,
  type DayTargetOutcome,
  type DayTargetSegment,
} from './dayTargetRingModel'

const LABEL: Record<MetricKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  steps: 'Steps',
  run: 'Run',
  gym: 'Gym',
  sleep: 'Sleep',
  meals: 'Meals on plan',
}

const STATUS: Record<DayTargetOutcome, string> = {
  hit: 'target met',
  missed: 'logged below target',
  unknown: 'not logged',
}

const SIZE = 140
const STROKE = 12
const RADIUS = 52
const GAP = 6

export function DayTargetRing({
  segments,
  onActivate,
  compact = false,
}: {
  segments: DayTargetSegment[]
  onActivate: (metric: MetricKey) => void
  compact?: boolean
}) {
  const patternId = `day-target-hatch-${useId().replaceAll(':', '')}`
  const circumference = 2 * Math.PI * RADIUS
  const segmentLength = segments.length > 0 ? (circumference - GAP * segments.length) / segments.length : 0
  const count = targetCount(segments)

  const graphic = (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            className="-rotate-90"
            aria-label={`${count.hit} of ${count.applicable} targets met today`}
          >
            <defs>
              <pattern
                id={patternId}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="rgb(255 255 255 / 0.04)" />
                <rect width="2" height="6" fill="rgb(255 255 255 / 0.22)" />
              </pattern>
            </defs>
            {segments.map((segment, index) => {
              const state = arcStateForOutcome(segment.outcome)
              const dasharray = `${segmentLength} ${circumference - segmentLength}`
              const dashoffset = -index * (segmentLength + GAP)
              const actionable = state !== 'lit'
              const stroke =
                state === 'lit'
                  ? '#39ff14'
                  : state === 'dim'
                    ? 'rgb(255 255 255 / 0.28)'
                    : `url(#${patternId})`
              const activate = () => {
                if (actionable) onActivate(segment.metric)
              }

              return (
                <g key={segment.metric}>
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={dasharray}
                    strokeDashoffset={dashoffset}
                    style={
                      state === 'lit'
                        ? { filter: 'drop-shadow(0 0 5px rgb(57 255 20 / 0.5))' }
                        : undefined
                    }
                  />
                  {actionable ? (
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="44"
                      strokeDasharray={dasharray}
                      strokeDashoffset={dashoffset}
                      pointerEvents="stroke"
                      role="button"
                      tabIndex={0}
                      aria-label={`${LABEL[segment.metric]}: ${STATUS[segment.outcome]}. Go to log field.`}
                      className="cursor-pointer outline-none focus:stroke-white/10"
                      onClick={activate}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          activate()
                        }
                      }}
                    >
                      <title>{`${LABEL[segment.metric]}: ${STATUS[segment.outcome]}`}</title>
                    </circle>
                  ) : (
                    <title>{`${LABEL[segment.metric]}: ${STATUS[segment.outcome]}`}</title>
                  )}
                </g>
              )
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="tabular-display text-2xl font-semibold leading-none text-ink-50">
              {count.hit}/{count.applicable}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-500">targets</span>
          </div>
    </div>
  )

  if (compact) return graphic

  return (
    <Card>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        {graphic}

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            Today at a glance
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-300">
            Open arcs still need attention. Tap one to jump to the matching log.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] text-ink-400 sm:justify-start">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_7px] shadow-accent/60" /> Hit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/30" /> Logged short
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05),rgba(255,255,255,0.05)_2px,rgba(255,255,255,0.24)_2px,rgba(255,255,255,0.24)_4px)]" /> Not logged
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
