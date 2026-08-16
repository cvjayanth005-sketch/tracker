import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolvePhaseForDate, upsertLog } from '@/db/repo'
import { outcomeFor, type MetricKey } from '@/domain/compliance'
import { asLocalDate, dateRange, dayOfWeek, formatShort, weekdayName } from '@/domain/date'
import { planWeek } from '@/domain/plan'
import { paceMinPerKm } from '@/domain/running'
import './today.css'
import { useDashboard } from '@/hooks/useDashboard'
import { NumberField, RatingField, TextArea, TriToggle } from '@/components/fields'
import { HeroWeight } from '@/components/HeroWeight'
import { SleepCheckIn } from '@/components/SleepCheckIn'
import { RecommendationCard } from '@/components/RecommendationCard'
import { TrendChart } from '@/components/TrendChart'
import { TodayActionList } from '@/components/today/TodayActionList'
import { TodayProgress } from '@/components/today/TodayProgress'
import { targetSegmentsForDay } from '@/components/today/dayTargetRingModel'
import { buildTodayActions } from '@/components/today/todayActions'
import { buildInsight, buildTodayTargets } from '@/components/today/todayTargets'
import { projectArrival } from '@/domain/projection'
import { Card, EmptyState, Pill } from '@/components/ui'
import type { DailyLog, LocalDate, Phase, Run } from '@/domain/types'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function displayPace(value: number | null): string | null {
  if (value === null) return null
  const seconds = Math.round(value * 60)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km`
}

function runSummary(runs: Run[]): string | null {
  if (runs.length === 0) return null
  const parts = runs.slice(0, 2).map((run) => {
    const pace = displayPace(paceMinPerKm(run.distanceKm, run.durationMin))
    return `${run.type.charAt(0).toUpperCase()}${run.type.slice(1)}${pace ? ` · ${pace}` : ''}`
  })
  if (runs.length > 2) parts.push(`+${runs.length - 2} more`)
  return parts.join(' · ')
}

function monthStart(date: LocalDate): LocalDate {
  return asLocalDate(`${date.slice(0, 7)}-01`)
}

function monthDays(start: LocalDate): LocalDate[] {
  const [year, month] = start.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return dateRange(start, asLocalDate(`${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`))
}

function TodayCalendar({
  today,
  phases,
  planStartDate,
  index,
  metrics,
}: {
  today: LocalDate
  phases: Phase[]
  planStartDate: LocalDate | null
  index: Map<LocalDate, DailyLog>
  metrics: MetricKey[]
}) {
  const cursor = monthStart(today)
  const days = monthDays(cursor)
  const leading = dayOfWeek(cursor)
  const [year, month] = cursor.split('-').map(Number) as [number, number]
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <div className="type-caption font-semibold text-[var(--app-ink)]">{monthLabel}</div>
        <Link to="/calendar" className="type-caption font-medium text-accent">
          Full calendar
        </Link>
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
          const log = index.get(date)
          const applicable = metrics.filter((metric) => outcomeFor(metric, log, phase, date) !== 'notScheduled')
          const outcomes = applicable.map((metric) => outcomeFor(metric, log, phase, date))
          const hasMiss = outcomes.includes('missed')
          const allHit = outcomes.length > 0 && outcomes.every((outcome) => outcome === 'hit')
          const isToday = date === today
          const week = planWeek(planStartDate, date)
          const classes = hasMiss
            ? 'bg-alert/18 text-alert ring-alert/25'
            : allHit
              ? 'bg-accent/18 text-accent ring-accent/25'
              : 'bg-[var(--app-inset)] text-[var(--app-ink-soft)] ring-[var(--app-line)]'

          return (
            <Link
              key={date}
              to={`/calendar/${date}`}
              className={`relative aspect-square radius-control p-2 text-left ring-1 ring-inset transition-transform active:scale-95 ${classes}`}
              aria-label={formatShort(date, true)}
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
      <div className="mt-4 grid grid-cols-3 type-caption font-medium text-[var(--app-ink-soft)]">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Hit
        </span>
        <span className="flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--app-inset)]" /> Open
        </span>
        <span className="flex items-center justify-end gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-alert" /> Miss
        </span>
      </div>
    </Card>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const dash = useDashboard(30)
  const { today, phase, settings, phases, todayLog, index, change, review } = dash

  const todaySchedule = useMemo(
    () => phase?.schedule.find((s) => s.dow === dayOfWeek(today)),
    [phase, today],
  )

  if (!phase || !settings) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const save = (patch: Partial<DailyLog>) => void upsertLog(today, patch)
  const focusLogField = (metric: MetricKey) => {
    const logPanel = document.getElementById('today-log-panel') as HTMLDetailsElement | null
    if (logPanel && !logPanel.open) logPanel.open = true
    const element = document.getElementById(`today-log-${metric}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      const focusable = element?.matches('input, a, button')
        ? element
        : element?.querySelector<HTMLElement>('input, a, button')
      focusable?.focus()
    }, 250)
  }

  const checklist: MetricKey[] = ['calories', 'protein', 'steps', 'run', 'gym', 'sleep', 'meals']
  const targetSegments = targetSegmentsForDay(checklist, todayLog, phase, today)
  const todayActions = buildTodayActions(phase, todaySchedule, todayLog, today)
  const todayTargets = buildTodayTargets(phase, todayLog, today)
  // Projected against the same target the chart draws as its horizon, so the
  // date and the line can never disagree.
  const projection = projectArrival(dash.series, today, phase.targetWeightKg)
  const insight = buildInsight(
    dash.compliance?.overallHitRatePct ?? null,
    dash.compliance?.overallCoveragePct ?? null,
    settings.goodCompliancePct,
  )
  const todayRuns = dash.runs.filter((run) => run.date === today)
  const todayRunSummary = runSummary(todayRuns)
  const logEntryCount = [
    todayLog?.calories,
    todayLog?.proteinG,
    todayLog?.steps,
    todayRuns.length > 0 ? todayRuns.length : null,
    todayLog?.gymDone,
    todayLog?.mealsOnPlan,
  ].filter((value) => value !== null && value !== undefined).length

  /*
   * The weigh-in card appears at the very top on a phone and at the head of the
   * log column on a laptop. Rendering it in both places, with only one visible
   * at a time, is deliberate: the alternative is `display: contents` ordering
   * gymnastics to move one element between grid columns, which is far more
   * fragile than a second instance of a component reading the same record.
   */
  const heroWeight = (
    <HeroWeight
      today={today}
      index={index}
      value={todayLog?.weightKg ?? null}
      onCommit={(weightKg) => save({ weightKg })}
      trendKg={change?.current.averageKg ?? null}
      projection={projection}
      series={dash.series}
      targetKg={phase.targetWeightKg}
    />
  )

  return (
    <div className="today-root pb-4">
      <header className="flex items-start justify-between gap-4 pt-4 sm:pt-6">
        <div>
          <div className="type-micro text-[var(--app-muted)]">
            {weekdayName(today)} · {formatShort(today)}
          </div>
          <h1 className="type-display mt-1">Today</h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Pill tone={review?.code === 'ready_for_review' ? 'good' : 'neutral'}>
            {phase.name} · {phase.targetWeightKg} kg target
          </Pill>
        </div>
      </header>

      {/* Phone: weigh-in first, so the 6am job is a zero-scroll action. */}
      <div className="mt-4 lg:hidden">{heroWeight}</div>

      <SleepCheckIn
        log={todayLog}
        targetHours={phase.sleepHours}
        score={dash.todaySleepScore}
        onSave={save}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(21rem,.74fr)] lg:items-start lg:gap-5">
        {/* ---------------- Dashboard column ---------------- */}
        <div className="space-y-4">
          <TodayActionList
            actions={todayActions}
            onOpenWorkout={() => navigate('/workout')}
            onFocusMetric={focusLogField}
          />

          <TodayProgress
            segments={targetSegments}
            targets={todayTargets}
            insight={insight}
            onFocusMetric={focusLogField}
          />

          <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.05fr]">
            <details className="group">
              <summary className="surface flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
                <span>
                  <span className="block type-micro font-semibold text-[var(--app-muted)]">
                    More insights
                  </span>
                  <span className="mt-1 block type-caption text-[var(--app-muted)]">
                    Plan signal and weight trend
                  </span>
                </span>
                <span className="type-lead text-[var(--app-muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-4 space-y-4">
                {dash.recommendation ? (
                  <RecommendationCard recommendation={dash.recommendation} review={review} />
                ) : null}
                <Card className="hidden lg:block">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="type-micro text-[var(--app-muted)]">Last 30 days</span>
                    {/*
                      The projection is the question the chart is actually opened
                      to answer, so it sits with the chart rather than behind a
                      further click.
                    */}
                    <span className="type-caption text-[var(--app-ink-soft)]">
                      {projection.status === 'ok'
                        ? `Goal around ${formatShort(projection.arrivalDate!)}`
                        : projection.detail}
                    </span>
                  </div>
                  <TrendChart series={dash.series} targetKg={phase.targetWeightKg} />
                  {projection.status === 'ok' ? (
                    <p className="type-micro mt-2 text-[var(--app-muted)]">
                      {projection.daysRemaining} days at{' '}
                      {Math.abs(projection.ratePerWeek!).toFixed(2)} kg/week
                      {projection.uncertaintyDays
                        ? ` · give or take ${projection.uncertaintyDays} days`
                        : ''}
                    </p>
                  ) : null}
                </Card>
              </div>
            </details>

            <div>
              <div className="mb-2.5 flex items-baseline justify-between px-1">
                <div className="type-micro font-semibold text-[var(--app-muted)]">
                  Calendar
                </div>
                <span className="type-caption text-[var(--app-muted)]">This month</span>
              </div>
              <TodayCalendar
                today={today}
                phases={phases}
                planStartDate={settings.planStartDate}
                index={index}
                metrics={checklist}
              />
            </div>
          </div>
        </div>

        {/* ---------------- Log column ---------------- */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="hidden lg:block">{heroWeight}</div>

          <Card className="overflow-hidden">
            <details id="today-log-panel" className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1">
                <span>
                  <span className="block type-micro font-semibold text-[var(--app-muted)]">
                    Log
                  </span>
                  <span className="mt-1 block type-caption text-[var(--app-muted)]">
                    {logEntryCount > 0 ? `${logEntryCount} ${logEntryCount === 1 ? 'entry' : 'entries'} today` : 'Nothing logged yet'}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="type-caption text-[var(--app-muted)]">Today</span>
                  <span className="glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--app-ink-soft)] transition-transform group-open:rotate-180">
                    ↓
                  </span>
                </span>
              </summary>
              <div className="mt-4 space-y-2.5 border-t border-[var(--app-line)] pt-4">
              <NumberField
                id="today-log-calories"
                label="Calories"
                unit="kcal"
                inputMode="numeric"
                value={todayLog?.calories ?? null}
                onCommit={(calories) => save({ calories })}
                target={`Target ${phase.calories}`}
              />
              <NumberField
                id="today-log-protein"
                label="Protein"
                unit="g"
                inputMode="numeric"
                value={todayLog?.proteinG ?? null}
                onCommit={(proteinG) => save({ proteinG })}
                target={`Target ${phase.proteinG}`}
              />
              <NumberField
                id="today-log-steps"
                label="Steps"
                inputMode="numeric"
                value={todayLog?.steps ?? null}
                onCommit={(steps) => save({ steps })}
                target={`Target ${phase.steps.toLocaleString()}`}
              />
              <Link
                id="today-log-run"
                to="/workout"
                className="glass-tile flex scroll-mt-6 items-center justify-between gap-3 radius-inset px-4 py-3.5 transition-colors active:bg-[var(--app-inset)]"
              >
                <span className="min-w-0">
                  <span className="block type-caption font-medium text-[var(--app-ink)]">Run</span>
                  <span className="block truncate type-caption text-[var(--app-muted)]">
                    {todayRunSummary ??
                      (todaySchedule?.runKm
                        ? `Planned ${todaySchedule.runKm} km`
                        : 'Nothing planned today')}
                  </span>
                </span>
                <span className="shrink-0 type-caption font-medium text-accent">Log details →</span>
              </Link>
              <div id="today-log-gym" className="scroll-mt-6">
                <TriToggle
                  label="Gym session"
                  sub={
                    todaySchedule?.gym
                      ? `${todaySchedule.sessionType} day`
                      : 'Not scheduled — logging it is optional'
                  }
                  value={todayLog?.gymDone ?? null}
                  onChange={(gymDone) => save({ gymDone })}
                />
              </div>
              <NumberField
                id="today-log-meals"
                label="Meals on plan"
                inputMode="numeric"
                value={todayLog?.mealsOnPlan ?? null}
                onCommit={(mealsOnPlan) => save({ mealsOnPlan })}
                target={`Out of ${phase.mealsPerDay}`}
              />
              </div>
            </details>
          </Card>

          <Card className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-1">
                <span>
                  <span className="block type-micro font-semibold text-[var(--app-muted)]">
                    How it felt
                  </span>
                  <span className="mt-1 block type-caption text-[var(--app-muted)]">
                    Energy {todayLog?.energy ?? '—'} · Hunger {todayLog?.hunger ?? '—'} · Soreness{' '}
                    {todayLog?.soreness ?? '—'}
                  </span>
                </span>
                <span className="glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--app-ink-soft)] transition-transform group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="mt-4 space-y-2.5">
                <RatingField
                  label="Energy"
                  value={todayLog?.energy ?? null}
                  onChange={(energy) => save({ energy })}
                  lowLabel="Flat"
                  highLabel="Sharp"
                />
                <RatingField
                  label="Hunger"
                  value={todayLog?.hunger ?? null}
                  onChange={(hunger) => save({ hunger })}
                  lowLabel="Satisfied"
                  highLabel="Ravenous"
                />
                <RatingField
                  label="Soreness"
                  value={todayLog?.soreness ?? null}
                  onChange={(soreness) => save({ soreness })}
                  lowLabel="Fresh"
                  highLabel="Wrecked"
                />
                <TextArea
                  label="Notes"
                  value={todayLog?.notes ?? null}
                  onCommit={(notes) => save({ notes })}
                  placeholder="Anything worth remembering about today"
                />
              </div>
            </details>
          </Card>
        </div>
      </div>
    </div>
  )
}
