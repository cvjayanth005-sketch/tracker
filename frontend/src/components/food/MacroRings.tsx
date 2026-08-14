import type { MacroTargets } from '@/domain/foodContext'
import { MACRO, type MacroKey } from './palette'

export interface MacroTotals {
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

/** Outer → inner ring order. */
const RING_ORDER: Array<{ macro: MacroKey; total: keyof MacroTotals; target: keyof MacroTargets }> = [
  { macro: 'calories', total: 'calories', target: 'calories' },
  { macro: 'protein', total: 'proteinG', target: 'proteinG' },
  { macro: 'carbs', total: 'carbsG', target: 'carbsG' },
  { macro: 'fat', total: 'fatG', target: 'fatG' },
]

/**
 * Concentric activity-style rings — one per macro — each filling toward its
 * target. An over-target ring turns red. Pure SVG so it scales cleanly from the
 * large "today" hero down to the compact history cards.
 */
export function MacroRings({
  totals,
  targets,
  size = 180,
  stroke = 12,
  gap = 4,
  center,
}: {
  totals: MacroTotals
  targets: MacroTargets
  size?: number
  stroke?: number
  gap?: number
  center?: React.ReactNode
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        {RING_ORDER.map(({ macro, total, target }, i) => {
          const radius = size / 2 - stroke / 2 - i * (stroke + gap)
          if (radius <= 0) return null
          const circumference = 2 * Math.PI * radius
          const value = totals[total]
          const goal = targets[target]
          const ratio = value === null || goal <= 0 ? 0 : value / goal
          const over = ratio > 1.02
          const color = over ? '#ff5470' : MACRO[macro].color
          return (
            <g key={macro}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgb(255 255 255 / 0.07)"
                strokeWidth={stroke}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference * Math.min(1, ratio)} ${circumference}`}
                style={{ transition: 'stroke-dasharray 0.6s ease-out', filter: `drop-shadow(0 0 5px ${MACRO[macro].glow})` }}
              />
            </g>
          )
        })}
      </svg>
      {center !== undefined ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
      ) : null}
    </div>
  )
}

/** Legend row: colored dot, label, consumed / target grams (kcal for calories). */
export function MacroLegend({ totals, targets }: { totals: MacroTotals; targets: MacroTargets }) {
  return (
    <div className="space-y-2.5">
      {RING_ORDER.map(({ macro, total, target }) => {
        const meta = MACRO[macro]
        const value = totals[total]
        const goal = targets[target]
        const over = value !== null && value > goal * 1.02
        return (
          <div key={macro} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] font-medium text-ink-200">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.glow}` }} />
              {meta.label}
            </span>
            <span className="tabular text-[12px] text-ink-400">
              <span className={`font-semibold ${over ? 'text-alert' : 'text-ink-50'}`}>
                {value === null ? '—' : Math.round(value)}
              </span>
              <span className="text-ink-500"> / {Math.round(goal)} {meta.unit}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
