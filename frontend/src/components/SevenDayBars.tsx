import { addDays, formatShort } from '@/domain/date'
import type { LocalDate } from '@/domain/types'

export interface SevenDayPoint {
  date: LocalDate
  value: number | null
  target?: number | null
}

export function lastSevenDates(today: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6))
}

export function SevenDayBars({
  points,
  tone = 'bg-accent',
  unit,
}: {
  points: SevenDayPoint[]
  tone?: string
  unit?: string
}) {
  const known = points.filter((point) => point.value !== null)
  const maxValue = Math.max(
    1,
    ...points.map((point) => point.value ?? 0),
    ...points.map((point) => point.target ?? 0),
  )

  return (
    <div className="grid grid-cols-7 items-end gap-2">
      {points.slice(0, 7).map((point) => {
        const pct = point.value === null ? 0 : Math.max(10, Math.min(100, (point.value / maxValue) * 100))
        const hit = point.value !== null && point.target != null && point.value >= point.target
        return (
          <div key={point.date} className="min-w-0">
            <div className="relative flex h-24 items-end radius-control bg-[var(--app-inset)] px-1.5 pb-1.5 ring-1 ring-inset ring-[var(--app-line)]">
              {point.target ? (
                <span
                  className="absolute inset-x-1.5 h-px bg-[var(--app-inset)]"
                  style={{ bottom: `${Math.max(8, Math.min(92, (point.target / maxValue) * 100))}%` }}
                  aria-hidden="true"
                />
              ) : null}
              {point.value === null ? (
                <span className="mx-auto mb-1 h-1.5 w-1.5 rounded-full bg-[var(--app-inset)]" />
              ) : (
                <span
                  className={`w-full rounded-full ${tone} ${hit ? 'shadow-[0_0_16px_-4px_rgba(57,255,20,0.85)]' : ''}`}
                  style={{ height: `${pct}%` }}
                  title={`${formatShort(point.date)} · ${Math.round(point.value).toLocaleString()}${unit ? ` ${unit}` : ''}`}
                />
              )}
            </div>
            <div className="mt-1 truncate text-center text-[9px] font-medium text-[var(--app-muted)]">
              {formatShort(point.date).slice(0, 5)}
            </div>
          </div>
        )
      })}
      {known.length === 0 ? (
        <div className="col-span-7 mt-2 text-center text-[11px] text-[var(--app-muted)]">No logs yet</div>
      ) : null}
    </div>
  )
}
