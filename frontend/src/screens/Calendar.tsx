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

function statusFor(date: LocalDate, phase: Phase, index: ReturnType<typeof indexLogs>, today: LocalDate) {
  const log = index.get(date)
  if (compareDates(date, today) > 0) return 'open'
  const applicable = METRICS.filter((metric) => outcomeFor(metric, log, phase, date) !== 'notScheduled')
  const outcomes = applicable.map((metric) => outcomeFor(metric, log, phase, date))
  if (outcomes.some((outcome) => outcome === 'missed')) return 'miss'
  if (outcomes.length > 0 && outcomes.every((outcome) => outcome === 'hit')) return 'hit'
  return 'open'
}

export default function Calendar() {
  const dash = useDashboard(180)
  const [cursor, setCursor] = useState<LocalDate>(() => monthStart(dash.today))
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
          <div className="glass-inset flex gap-1 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setCursor((value) => shiftMonths(value, -1))}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-200"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setCursor(monthStart(today))}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-200"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCursor((value) => shiftMonths(value, 1))}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-200"
            >
              Next
            </button>
          </div>
        }
      />

      <SectionTitle
        action={
          <span className="text-xs text-ink-400">
            {monthCompliance?.overallHitRatePct == null ? 'Start logging' : `${Math.round(monthCompliance.overallHitRatePct)}% hit rate`}
          </span>
        }
      >
        {monthLabel}
      </SectionTitle>

      <Card>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
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
            const status = statusFor(date, phase, index, today)
            const week = planWeek(settings.planStartDate, date)
            const isToday = date === today
            const classes = {
              hit: 'bg-accent/18 text-accent ring-accent/25',
              miss: 'bg-alert/18 text-alert ring-alert/25',
              open: 'bg-white/6 text-ink-300 ring-white/10',
            } as const
            return (
              <Link
                key={date}
                to={`/calendar/${date}`}
                className={`relative aspect-square rounded-2xl p-2 text-left ring-1 ring-inset transition-transform active:scale-95 ${classes[status]}`}
                aria-label={`${formatShort(date, true)} ${status}`}
              >
                <span className="tabular text-sm font-semibold">{Number(date.slice(8, 10))}</span>
                {week && dayOfWeek(date) === 1 ? (
                  <span className="absolute bottom-1.5 left-2 text-[9px] text-ink-500">W{week}</span>
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
                <div className="text-sm font-semibold text-ink-50">{phase.name}</div>
                <div className="mt-1 text-[12px] text-ink-400">
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
        <div className="grid gap-2 text-[12px] text-ink-300 sm:grid-cols-3">
          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent" />Hit day</div>
          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-alert" />Missed target</div>
          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-white/30" />Open / not fully logged</div>
        </div>
      </Card>
    </div>
  )
}
