import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, formatShort } from '@/domain/date'
import type { Projection } from '@/domain/projection'
import { TrendChart } from '@/components/TrendChart'
import type { TrendPoint } from '@/domain/trend'
import type { LocalDate } from '@/domain/types'
import type { LogIndex } from '@/domain/trend'
import type { WeighInCadence } from '@/domain/weighInCadence'

/**
 * The morning weigh-in, given its own oversized field only when the three-day
 * cadence says it is due.
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
  projection,
  series,
  targetKg,
  cadence,
}: {
  today: LocalDate
  index: LogIndex
  value: number | null
  onCommit: (next: number | null) => void
  trendKg: number | null
  /** Projected arrival at the target, when the trend supports one. */
  projection?: Projection
  /** Trend series for the inline sparkline. */
  series?: TrendPoint[]
  targetKg?: number | null
  cadence: WeighInCadence
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  /*
   * A cadence-forced "come back in N days" hides the input entirely — good as
   * a default, but paternalistic when the user actually wants to log a value
   * mid-cycle (post-flight, before a lift, whatever). This flag lets them opt
   * into the input without changing the cadence rule or corrupting the data.
   */
  const [manuallyOpened, setManuallyOpened] = useState(false)
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
  const showWeightInput = value !== null || cadence.due || manuallyOpened

  return (
    <div className="glass radius-inset p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <span className="type-micro font-semibold text-[var(--app-muted)]">
          {showWeightInput ? 'Morning weight' : 'Weight check'}
        </span>
        {value !== null ? (
          <span className="type-caption text-accent">next {formatShort(cadence.nextWeighInDate)}</span>
        ) : cadence.due ? (
          <span className="type-caption text-accent">due today</span>
        ) : (
          <span className="type-caption text-[var(--app-muted)]">next {formatShort(cadence.nextWeighInDate)}</span>
        )}
      </div>

      {showWeightInput ? (
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
            className="tabular-display w-full min-w-0 bg-transparent type-display text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)]"
          />
          <span className="pb-1.5 type-lead font-medium text-[var(--app-muted)]">kg</span>
        </div>
      ) : (
        <div className="mt-2">
          <div className="type-lead font-semibold text-[var(--app-ink)]">
            Weigh again in {cadence.daysUntilNext} day{cadence.daysUntilNext === 1 ? '' : 's'}
          </div>
          <p className="mt-1 type-caption text-[var(--app-muted)]">
            Every third day gives the trend enough signal without turning the scale into a daily task.
          </p>
          {/*
            Off-cadence weigh-in is still accepted — the cadence is guidance,
            not a lock. Someone might weigh mid-cycle after a big meal or a
            travel day; refusing to accept the input would be paternalistic.
            A quiet secondary trigger opens the field without disturbing the
            primary state.
          */}
          <button
            type="button"
            onClick={() => setManuallyOpened(true)}
            className="mt-2 type-caption font-semibold text-[var(--app-blue)] underline-offset-2 hover:underline"
          >
            Weigh anyway
          </button>
        </div>
      )}

      {series && series.length > 1 ? (
        <div className="mt-3">
          <TrendChart series={series} targetKg={targetKg ?? null} compact height={44} />
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-[var(--app-muted)]">
        {delta !== null && previous ? (
          <span>
            <span className={delta <= 0 ? 'text-accent' : 'text-warn'}>
              {delta > 0 ? '+' : ''}
              {delta.toFixed(1)} kg
            </span>{' '}
            since {formatShort(previous.date)}
          </span>
        ) : (
          <span>{showWeightInput ? 'Fasted, after the bathroom, before food' : 'Use the same morning routine next time'}</span>
        )}
        {vsTrend !== null ? (
          <span className="text-[var(--app-ink-soft)]/70">
            {vsTrend > 0 ? '+' : ''}
            {vsTrend.toFixed(2)} vs 7-day trend
          </span>
        ) : null}
      </div>

      {/*
        The projection lives here rather than beside the chart because this is
        where someone already looks after weighing in, and it is the question
        the number provokes. It is one sentence, not a second metric, so it does
        not compete with the day's actions elsewhere on the screen.
      */}
      {projection ? (
        <Link
          to="/progress"
          className="motion-press mt-3 flex items-center justify-between gap-3 border-t border-[var(--app-line)] pt-3"
        >
          <span className="type-caption text-[var(--app-ink-soft)]">
            {projection.status === 'ok' && projection.arrivalDate ? (
              <>
                On track for goal around{' '}
                <span className="font-semibold text-[var(--app-ink)]">
                  {formatShort(projection.arrivalDate)}
                </span>
                {projection.uncertaintyDays
                  ? ` · ±${projection.uncertaintyDays} days`
                  : ''}
              </>
            ) : (
              projection.detail
            )}
          </span>
          <span aria-hidden="true" className="type-caption shrink-0 text-[var(--app-blue)]">
            Trend →
          </span>
        </Link>
      ) : null}
    </div>
  )
}
