import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { complianceFor, outcomeFor, type MetricKey } from '@/domain/compliance'
import {
  asLocalDate,
  compareDates,
  dateRange,
  dayOfWeek,
  formatShort,
  todayIn,
} from '@/domain/date'
import { planWeek } from '@/domain/plan'
import { indexLogs } from '@/domain/trend'
import { resolvePhaseForDate } from '@/db/repo'
import { useDashboard } from '@/hooks/useDashboard'
import { Card, EmptyState, PageHeader, Pill, SectionTitle } from '@/components/ui'
import type { LocalDate, Phase } from '@/domain/types'

const METRICS: MetricKey[] = ['calories', 'protein', 'steps', 'run', 'gym', 'sleep', 'meals']

/**
 * A signal is the reading the calendar cell should reflect.
 *
 * Adherence rolls every metric into one hit/miss/open dot. That is fine for
 * "how did I do overall", but every other question — was I training four
 * times a week last month? did my sleep drift when the phase changed? — is
 * about a single signal in isolation. Each option here maps to the metric
 * keys that speak to that signal, and the cell colour reads only those.
 */
type Signal = 'adherence' | 'training' | 'sleep' | 'steps' | 'weight'

const SIGNAL_META: Record<Signal, { label: string; metrics: MetricKey[] | null }> = {
  adherence: { label: 'Adherence', metrics: null },
  training: { label: 'Training', metrics: ['gym', 'run'] },
  sleep: { label: 'Sleep', metrics: ['sleep'] },
  steps: { label: 'Steps', metrics: ['steps'] },
  weight: { label: 'Weight', metrics: [] },
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthStart(date: LocalDate): LocalDate {
  return asLocalDate(`${date.slice(0, 7)}-01`)
}

function shiftMonths(date: LocalDate, delta: number): LocalDate {
  const [year, month] = date.split('-').map(Number) as [number, number]
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return asLocalDate(`${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`)
}

function monthDays(start: LocalDate): LocalDate[] {
  const [year, month] = start.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return dateRange(start, asLocalDate(`${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`))
}

function statusFor(
  date: LocalDate,
  phase: Phase,
  index: ReturnType<typeof indexLogs>,
  today: LocalDate,
  signal: Signal,
) {
  const log = index.get(date)
  if (compareDates(date, today) > 0) return 'open'
  /*
   * Weight is not a "hit/miss" signal — a weigh-in either happened or it
   * didn't. Represent it as hit-when-logged so the calendar becomes a
   * weigh-in dot map, matching what someone asking "did I weigh in?" wants
   * to see.
   */
  if (signal === 'weight') {
    return log?.weightKg != null ? 'hit' : 'open'
  }
  const active = signal === 'adherence' ? METRICS : SIGNAL_META[signal].metrics ?? METRICS
  const applicable = active.filter((metric) => outcomeFor(metric, log, phase, date) !== 'notScheduled')
  const outcomes = applicable.map((metric) => outcomeFor(metric, log, phase, date))
  if (outcomes.some((outcome) => outcome === 'missed')) return 'miss'
  if (outcomes.length > 0 && outcomes.every((outcome) => outcome === 'hit')) return 'hit'
  return 'open'
}

export default function Calendar() {
  const dash = useDashboard(180)
  const [cursor, setCursor] = useState<LocalDate>(() => monthStart(dash.today))
  const [signal, setSignal] = useState<Signal>('adherence')
  const { settings, phases, index } = dash
  const today = settings ? todayIn(settings.timezone) : dash.today

  const days = useMemo(() => monthDays(cursor), [cursor])
  const leading = dayOfWeek(cursor)
  const monthLabel = useMemo(() => {
    const [year, month] = cursor.split('-').map(Number) as [number, number]
    return `${MONTH_NAMES[month - 1]} ${year}`
  }, [cursor])

  if (!settings || phases.length === 0) {
    return <EmptyState title="Calendar unavailable" body="Finish onboarding to build your plan timeline." />
  }

  const monthCompliance = dash.phase
    ? complianceFor(index, days.at(-1) ?? today, dash.phase)
    : undefined

  return (
    <div className="pb-4">
      <PageHeader
        {...(settings.planStartDate
          ? { eyebrow: `Started ${formatShort(settings.planStartDate, true)}` }
          : {})}
        title="Calendar"
        action={
          <div className="glass-inset flex gap-1 radius-control p-1">
            <button
              type="button"
              onClick={() => setCursor((value) => shiftMonths(value, -1))}
              className="radius-control px-3 py-1.5 type-caption font-semibold text-[var(--app-ink)]"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setCursor(monthStart(today))}
              className="radius-control px-3 py-1.5 type-caption font-semibold text-[var(--app-ink)]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCursor((value) => shiftMonths(value, 1))}
              className="radius-control px-3 py-1.5 type-caption font-semibold text-[var(--app-ink)]"
            >
              Next
            </button>
          </div>
        }
      />

      <SectionTitle
        action={
          <span className="type-caption text-[var(--app-muted)]">
            {monthCompliance?.overallHitRatePct == null ? 'Start logging' : `${Math.round(monthCompliance.overallHitRatePct)}% hit rate`}
          </span>
        }
      >
        {monthLabel}
      </SectionTitle>

      <Card>
        {/*
          Signal picker. Each option restricts the cell colour to a specific
          metric family — so "did I train four days a week last month?" is
          a one-tap answer rather than a mental filter over a fused hit rate.
        */}
        <div role="tablist" aria-label="Calendar signal" className="mb-3 flex gap-1 overflow-x-auto">
          {(Object.keys(SIGNAL_META) as Signal[]).map((option) => {
            const active = signal === option
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSignal(option)}
                className={`radius-pill motion-press px-3 py-1.5 type-caption font-semibold whitespace-nowrap ${
                  active
                    ? 'bg-[var(--app-selected-fill)] text-[var(--app-selected-ink)] ring-1 ring-inset ring-[var(--app-selected-edge)]'
                    : 'bg-[var(--app-inset)] text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)]'
                }`}
              >
                {SIGNAL_META[option].label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center type-micro font-semibold text-[var(--app-muted)]">
          {WEEKDAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {Array.from({ length: leading }).map((_, index) => (
            <div key={`blank-${index}`} className="aspect-square" />
          ))}
          {days.map((date) => {
            const phase = resolvePhaseForDate(phases, date)
            if (!phase) return null
            const status = statusFor(date, phase, index, today, signal)
            const week = planWeek(settings.planStartDate, date)
            const isToday = date === today
            const classes = {
              hit: 'bg-accent/18 text-accent ring-accent/25',
              miss: 'bg-alert/18 text-alert ring-alert/25',
              open: 'bg-[var(--app-inset)] text-[var(--app-ink-soft)] ring-[var(--app-line)]',
            } as const
            return (
              <Link
                key={date}
                to={`/calendar/${date}`}
                className={`relative aspect-square radius-control p-2 text-left ring-1 ring-inset transition-transform active:scale-95 ${classes[status]}`}
                aria-label={`${formatShort(date, true)} ${status}`}
              >
                <span className="tabular type-caption font-semibold">{Number(date.slice(8, 10))}</span>
                {week && dayOfWeek(date) === 1 ? (
                  <span className="absolute bottom-1.5 left-2 type-caption text-[var(--app-muted)]">W{week}</span>
                ) : null}
                {isToday ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-info" />
                ) : null}
              </Link>
            )
          })}
        </div>
      </Card>

      <SectionTitle>Plan context</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {phases.map((phase) => (
          <Card key={phase.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="type-caption font-semibold text-[var(--app-ink)]">{phase.name}</div>
                <div className="mt-1 type-caption text-[var(--app-muted)]">
                  {phase.startWeightKg} to {phase.targetWeightKg} kg · {phase.calories} kcal
                </div>
              </div>
              <Pill tone={phase.endedOn ? 'neutral' : phase.startedOn ? 'good' : 'info'}>
                {phase.endedOn ? 'closed' : phase.startedOn ? 'active' : 'upcoming'}
              </Pill>
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle>Legend</SectionTitle>
      <Card>
        <div className="grid gap-2 type-caption text-[var(--app-ink-soft)] sm:grid-cols-3">
          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent" />Hit day</div>
          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-alert" />Missed target</div>
          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--app-inset)]" />Open / not fully logged</div>
        </div>
      </Card>
    </div>
  )
}
