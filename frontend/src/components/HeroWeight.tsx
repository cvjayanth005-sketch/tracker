import { useEffect, useRef, useState } from 'react'
import { addDays, formatShort } from '@/domain/date'
import type { LocalDate } from '@/domain/types'
import type { LogIndex } from '@/domain/trend'

/**
 * The morning weigh-in, given its own oversized field.
 *
 * This is the one number that gets typed every single day, usually half-awake,
 * so it is a zero-scroll target at the top of Today rather than the first row
 * of a long form.
 */
export function HeroWeight({
  today,
  index,
  value,
  onCommit,
  trendKg,
}: {
  today: LocalDate
  index: LogIndex
  value: number | null
  onCommit: (next: number | null) => void
  trendKg: number | null
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    if (dirty.current) return
    setText(value === null ? '' : String(value))
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed !== '' && Number.isNaN(Number(trimmed))) return
    dirty.current = false
    onCommit(trimmed === '' ? null : Number(trimmed))
  }

  // Nearest previous weigh-in, for a plain "since last time" read.
  let previous: { date: LocalDate; kg: number } | null = null
  for (let i = 1; i <= 14; i++) {
    const date = addDays(today, -i)
    const kg = index.get(date)?.weightKg
    if (kg !== null && kg !== undefined) {
      previous = { date, kg }
      break
    }
  }

  const delta = value !== null && previous ? value - previous.kg : null
  const vsTrend = value !== null && trendKg !== null ? value - trendKg : null

  return (
    <div className="glass rounded-3xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          Morning weight
        </span>
        {value !== null ? (
          <span className="text-[11px] text-accent">saved</span>
        ) : (
          <span className="text-[11px] text-ink-400">not logged</span>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={text}
          placeholder="—"
          aria-label="Morning weight in kilograms"
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            dirty.current = true
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => commit(raw), 500)
          }}
          onBlur={(e) => {
            window.clearTimeout(timer.current)
            commit(e.target.value)
          }}
          className="tabular w-full min-w-0 bg-transparent text-5xl font-semibold tracking-tight text-ink-50 outline-none placeholder:text-ink-700 sm:text-6xl"
        />
        <span className="pb-1.5 text-lg font-medium text-ink-400">kg</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
        {delta !== null && previous ? (
          <span>
            <span className={delta <= 0 ? 'text-accent' : 'text-warn'}>
              {delta > 0 ? '+' : ''}
              {delta.toFixed(1)} kg
            </span>{' '}
            since {formatShort(previous.date)}
          </span>
        ) : (
          <span>Fasted, after the bathroom, before food</span>
        )}
        {vsTrend !== null ? (
          <span className="text-ink-300/70">
            {vsTrend > 0 ? '+' : ''}
            {vsTrend.toFixed(2)} vs 7-day trend
          </span>
        ) : null}
      </div>
    </div>
  )
}
