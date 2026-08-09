import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { outcomeFor, type MetricKey } from '@/domain/compliance'
import { addDays, dayOfWeek, formatShort, weekdayName } from '@/domain/date'
import { paceMinPerKm } from '@/domain/running'
import { upsertLog } from '@/db/repo'
import { useDashboard } from '@/hooks/useDashboard'
import { NumberField, RatingField, TextArea, TriToggle } from '@/components/fields'
import { HeroWeight } from '@/components/HeroWeight'
import { RecommendationCard } from '@/components/RecommendationCard'
import { TrendChart } from '@/components/TrendChart'
import { Card, EmptyState, Meter, Pill, Stat } from '@/components/ui'
import { statInt, statVal } from '@/components/format'
import type { DailyLog, LocalDate, Phase, Run } from '@/domain/types'

const METRIC_LABEL: Record<MetricKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  steps: 'Steps',
  sleep: 'Sleep',
  meals: 'Meals on plan',
  gym: 'Gym',
  run: 'Run',
}

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

function MiniBars({ values, tone = 'bg-accent' }: { values: Array<number | null>; tone?: string }) {
  return (
    <div className="flex h-20 items-end gap-1.5">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={`w-2 rounded-full ${value !== null && value > 0 ? tone : 'bg-white/8'}`}
          style={{
            height: `${Math.max(8, value ?? 8)}%`,
            opacity: value !== null && value > 0 ? 0.95 : 1,
          }}
        />
      ))}
    </div>
  )
}

function SleepTrend({ values }: { values: Array<number | null> }) {
  const known = values.filter((value): value is number => value !== null)
  if (known.length < 2) {
    return <div className="h-20 w-full rounded-2xl bg-white/5" />
  }

  const points = values
    .map((value, index) => {
      if (value === null) return null
      const x = 8 + index * (164 / Math.max(1, values.length - 1))
      const y = 70 - value * 0.58
      return `${x.toFixed(1)},${Math.max(12, Math.min(70, y)).toFixed(1)}`
    })
    .filter((point): point is string => point !== null)
    .join(' ')

  return (
    <svg viewBox="0 0 180 80" className="h-20 w-full" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="#60a5fa"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#4ade80"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".82"
        transform="translate(0 9)"
      />
    </svg>
  )
}

function WaveLines() {
  const lines: Array<[string, number]> = [
    ['#4ade80', 0],
    ['#f8c24e', 18],
    ['#60a5fa', 36],
    ['rgba(255,255,255,.34)', 54],
  ]

  return (
    <svg viewBox="0 0 420 110" className="h-24 w-full overflow-visible" aria-hidden="true">
      {lines.map(([color, offset]) => (
        <path
          key={String(offset)}
          d={`M 0 ${62 + offset * 0.08} C 70 ${18 + offset}, 120 ${102 - offset * 0.4}, 190 56 S 320 ${18 + offset * 0.25}, 420 ${70 - offset * 0.2}`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.82"
        />
      ))}
    </svg>
  )
}

function FiveWeekCalendar({
  today,
  phase,
  index,
  metrics,
}: {
  today: LocalDate
  phase: Phase
  index: Map<LocalDate, DailyLog>
  metrics: MetricKey[]
}) {
  const start = addDays(today, -34)
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i))
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div className="glass-tile mt-4 rounded-[2rem] p-4">
      <div className="grid grid-cols-7 gap-x-2 gap-y-3">
        {labels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="text-center text-[10px] font-bold text-ink-100"
          >
            {label}
          </div>
        ))}
        {days.map((date) => {
          const log = index.get(date)
          const applicable = metrics.filter((metric) => outcomeFor(metric, log, phase, date) !== 'notScheduled')
          const outcomes = applicable.map((metric) => outcomeFor(metric, log, phase, date))
          const hasMiss = outcomes.includes('missed')
          const allHit = outcomes.length > 0 && outcomes.every((outcome) => outcome === 'hit')
          const isToday = date === today
          const state = hasMiss ? 'Miss' : allHit ? 'Hit' : 'Open'

          return (
            <span
              key={date}
              title={`${formatShort(date)} · ${state}`}
              aria-label={`${formatShort(date)} ${state}`}
              className={`mx-auto h-9 w-9 rounded-full border transition-transform hover:scale-105 sm:h-10 sm:w-10 ${
                hasMiss
                  ? 'border-alert/45 bg-alert/70 shadow-[0_0_22px_-8px_rgba(251,113,133,.9)]'
                  : allHit
                    ? 'border-white/75 bg-ink-50 shadow-[0_0_22px_-10px_rgba(255,255,255,.85)]'
                    : 'border-white/10 bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,.12)]'
              } ${isToday ? 'ring-2 ring-info/70 ring-offset-2 ring-offset-transparent' : ''}`}
            />
          )
        })}
      </div>
      <div className="mt-4 grid grid-cols-3 text-[11px] font-medium text-ink-200">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-50" /> Hit
        </span>
        <span className="flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/18" /> Open
        </span>
        <span className="flex items-center justify-end gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-alert/80" /> Miss
        </span>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  unit,
  sub,
  icon,
  children,
}: {
  title: string
  value: string | null
  unit?: string
  sub: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <Card className="min-h-[11rem] overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="glass-inset flex h-11 w-11 items-center justify-center rounded-2xl text-lg">
            {icon}
          </span>
          <div>
            <div className="text-lg font-semibold text-ink-50">{title}</div>
            <div className="text-[11px] text-ink-500">Last 7 days</div>
          </div>
        </div>
        <span className="text-[11px] text-ink-500">{sub}</span>
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] items-end gap-4">
        <div>
          <span className="tabular text-3xl font-semibold leading-none text-ink-50">
            {value ?? <span className="text-ink-600">—</span>}
          </span>
          {unit ? <span className="ml-1 text-sm text-ink-300">{unit}</span> : null}
        </div>
        {children}
      </div>
    </Card>
  )
}

function metricProgress(
  metric: MetricKey,
  log: DailyLog | undefined,
  phase: Phase,
  plannedRunKm: number | null,
): { value: string; target: string; pct: number | null; action: 'log' | 'workout' | 'completeMeals' | 'doneGym' | null } {
  switch (metric) {
    case 'calories': {
      const value = log?.calories ?? null
      return {
        value: value === null ? 'Not logged' : `${Math.round(value).toLocaleString()} kcal`,
        target: `${phase.calories} kcal`,
        pct: value === null ? null : Math.min(100, (value / phase.calories) * 100),
        action: 'log',
      }
    }
    case 'protein': {
      const value = log?.proteinG ?? null
      return {
        value: value === null ? 'Not logged' : `${Math.round(value)} g`,
        target: `${phase.proteinG} g`,
        pct: value === null ? null : Math.min(100, (value / phase.proteinG) * 100),
        action: 'log',
      }
    }
    case 'steps': {
      const value = log?.steps ?? null
      return {
        value: value === null ? 'Not logged' : value.toLocaleString(),
        target: phase.steps.toLocaleString(),
        pct: value === null ? null : Math.min(100, (value / phase.steps) * 100),
        action: 'log',
      }
    }
    case 'run': {
      const value = log?.runKm ?? null
      return {
        value: value === null ? 'Not logged' : `${value.toFixed(1)} km`,
        target: plannedRunKm ? `${plannedRunKm} km` : 'No run',
        pct: value === null || !plannedRunKm ? null : Math.min(100, (value / plannedRunKm) * 100),
        action: 'workout',
      }
    }
    case 'gym': {
      const done = log?.gymDone ?? null
      return {
        value: done === null ? 'Not logged' : done ? 'Done' : 'Skipped',
        target: 'session',
        pct: done === null ? null : done ? 100 : 0,
        action: done ? null : 'doneGym',
      }
    }
    case 'sleep': {
      const value = log?.sleepHours ?? null
      return {
        value: value === null ? 'Not logged' : `${value} h`,
        target: `${phase.sleepHours} h`,
        pct: value === null ? null : Math.min(100, (value / phase.sleepHours) * 100),
        action: 'log',
      }
    }
    case 'meals': {
      const value = log?.mealsOnPlan ?? null
      return {
        value: value === null ? 'Not logged' : `${value} meals`,
        target: `${phase.mealsPerDay} meals`,
        pct: value === null ? null : Math.min(100, (value / phase.mealsPerDay) * 100),
        action: value !== phase.mealsPerDay ? 'completeMeals' : null,
      }
    }
  }
}

export default function Today() {
  const dash = useDashboard(30)
  const { today, phase, settings, todayLog, index, change, review } = dash

  const todaySchedule = useMemo(
    () => phase?.schedule.find((s) => s.dow === dayOfWeek(today)),
    [phase, today],
  )

  if (!phase || !settings) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const save = (patch: Partial<DailyLog>) => void upsertLog(today, patch)
  const focusLogField = (metric: MetricKey) => {
    const id = `today-log-${metric}`
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => document.getElementById(id)?.focus(), 250)
  }

  const checklist: MetricKey[] = ['calories', 'protein', 'steps', 'run', 'gym', 'sleep', 'meals']
  const applicable = checklist.filter(
    (m) => outcomeFor(m, todayLog, phase, today) !== 'notScheduled',
  )
  const doneCount = applicable.filter(
    (m) => outcomeFor(m, todayLog, phase, today) === 'hit',
  ).length
  const completionPct = applicable.length === 0 ? 0 : (doneCount / applicable.length) * 100
  const todayRuns = dash.runs.filter((run) => run.date === today)
  const todayRunSummary = runSummary(todayRuns)
  const hitRate = Math.round(dash.compliance?.overallHitRatePct ?? completionPct)
  const coverage = Math.round(dash.compliance?.overallCoveragePct ?? 0)
  const stabilityScore = Math.round((hitRate * 0.68 + coverage * 0.32) || completionPct)

  const recentDates = Array.from({ length: 12 }, (_, i) => addDays(today, i - 11))
  const activityBars = recentDates.map((date) => {
    const value = index.get(date)?.steps ?? null
    return value === null ? null : Math.min(100, (value / phase.steps) * 100)
  })
  const nutritionBars = recentDates.map((date) => {
    const value = index.get(date)?.calories ?? null
    return value === null ? null : Math.min(100, (value / phase.calories) * 100)
  })
  const sleepPoints = recentDates.map((date) => {
    const value = index.get(date)?.sleepHours ?? null
    return value === null ? null : Math.min(100, (value / phase.sleepHours) * 100)
  })
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
    />
  )

  return (
    <div className="pb-4">
      <header className="flex items-start justify-between gap-4 pt-4 sm:pt-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">
            {weekdayName(today)} · {formatShort(today)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold sm:text-5xl">Today</h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Pill tone={review?.code === 'ready_for_review' ? 'good' : 'neutral'}>
            {phase.name} · {phase.targetWeightKg} kg target
          </Pill>
        </div>
      </header>

      {/* Phone: weigh-in first, so the 6am job is a zero-scroll action. */}
      <div className="mt-4 lg:hidden">{heroWeight}</div>

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(21rem,.74fr)] lg:items-start lg:gap-5">
        {/* ---------------- Dashboard column ---------------- */}
        <div className="space-y-4">
          <Card refract className="relative min-h-[19rem] overflow-hidden p-0">
            <div className="absolute inset-0 bg-[radial-gradient(70%_95%_at_60%_0%,rgba(255,255,255,.16),transparent_58%),linear-gradient(115deg,rgba(5,7,11,.44),rgba(5,7,11,.9)_62%),url('/coach-athlete.png')]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(74,222,128,.2),transparent_36%),linear-gradient(0deg,rgba(0,0,0,.58),transparent_64%)]" />
            <div className="relative z-10 flex min-h-[19rem] flex-col justify-between p-5 sm:p-6">
              <div className="max-w-md">
                <div className="text-[13px] font-semibold text-ink-100">Hey, need help?</div>
                <h2 className="mt-1 text-3xl font-semibold leading-none text-ink-50 sm:text-4xl">
                  Just ask me anything
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="glass-inset max-w-xl rounded-3xl p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-300">
                    Coach read
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-100">
                    {dash.recommendation?.detail ??
                      'Log the basics, keep the plan visible, and let the trend decide the next move.'}
                  </p>
                </div>
                <div className="glass-inset rounded-3xl px-5 py-4 text-center">
                  <div className="tabular text-5xl font-semibold leading-none text-ink-50">
                    {stabilityScore}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-300">
                    score
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard
              title="Activity"
              value={statInt(dash.weekAverages?.steps)}
              sub="Steps"
              icon="↗"
            >
              <MiniBars values={activityBars} />
            </MetricCard>
            <MetricCard
              title="Nutrition"
              value={statInt(dash.weekAverages?.calories)}
              unit="kcal"
              sub={`${statInt(dash.weekAverages?.protein) ?? '—'}g protein`}
              icon="◐"
            >
              <MiniBars
                tone="bg-[linear-gradient(180deg,#ff6a1a,#f8c24e)]"
                values={nutritionBars}
              />
            </MetricCard>
            <MetricCard
              title="Sleep"
              value={statVal(dash.weekAverages?.sleep, 1)}
              unit="h"
              sub="Avg"
              icon="▰"
            >
              <SleepTrend values={sleepPoints} />
            </MetricCard>
          </div>

          {/* Desktop has the room for the trend line; the phone does not. */}
          <Card refract className="hidden lg:block">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                Last 30 days
              </span>
              <Link to="/progress" className="text-[11px] text-accent">
                Full progress →
              </Link>
            </div>
            <TrendChart series={dash.series} targetKg={phase.targetWeightKg} />
          </Card>

          {dash.recommendation ? (
            <RecommendationCard recommendation={dash.recommendation} review={review} />
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.05fr]">
            <Card refract>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                    Today&apos;s plan
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-ink-50">
                    {doneCount}/{applicable.length} complete
                  </div>
                </div>
                <Pill tone={completionPct === 100 ? 'good' : 'info'}>{Math.round(completionPct)}%</Pill>
              </div>
              <Meter value={completionPct} tone={completionPct === 100 ? 'accent' : 'info'} />
              <ul className="mt-4 space-y-2">
                {applicable.map((metric) => {
                  const outcome = outcomeFor(metric, todayLog, phase, today)
                  const progress = metricProgress(metric, todayLog, phase, todaySchedule?.runKm ?? null)
                  return (
                    <li
                      key={metric}
                      className="glass-tile rounded-3xl px-3 py-2.5 text-[13px]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                            outcome === 'hit'
                              ? 'bg-ink-50 text-ink-950'
                              : outcome === 'missed'
                                ? 'bg-alert/20 text-alert ring-1 ring-inset ring-alert/30'
                                : 'bg-white/6 text-ink-500 ring-1 ring-inset ring-white/8'
                          }`}
                        >
                          {outcome === 'hit' ? '✓' : outcome === 'missed' ? '!' : '•'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={outcome === 'unknown' ? 'text-ink-400' : 'text-ink-100'}>
                            {METRIC_LABEL[metric]}
                          </span>
                          <span className="block truncate text-[11px] text-ink-500">
                            {metric === 'run' && todayRunSummary
                              ? todayRunSummary
                              : `${progress.value} / ${progress.target}`}
                          </span>
                        </span>
                        {progress.action === 'workout' ? (
                          <Link
                            to="/workout"
                            className="glass-tile rounded-full px-3 py-1.5 text-[11px] font-semibold text-accent"
                          >
                            Open
                          </Link>
                        ) : progress.action === 'log' ? (
                          <button
                            type="button"
                            onClick={() => focusLogField(metric)}
                            className="glass-tile rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink-200"
                          >
                            Log
                          </button>
                        ) : progress.action === 'doneGym' ? (
                          <button
                            type="button"
                            onClick={() => save({ gymDone: true })}
                            className="rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/25"
                          >
                            Done
                          </button>
                        ) : progress.action === 'completeMeals' ? (
                          <button
                            type="button"
                            onClick={() => save({ mealsOnPlan: phase.mealsPerDay })}
                            className="rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/25"
                          >
                            Fill
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
                        <div
                          className={`h-full rounded-full ${
                            outcome === 'missed' ? 'bg-alert' : 'bg-accent'
                          }`}
                          style={{ width: `${progress.pct ?? 0}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-5 border-t border-white/8 pt-4">
                <div className="mb-3 flex items-baseline justify-between px-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                    Last 7 days
                  </div>
                  <span className="text-[11px] text-ink-500">{coverage}% coverage</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    label="Avg calories"
                    value={statInt(dash.weekAverages?.calories)}
                    unit="kcal"
                  />
                  <Stat label="Avg protein" value={statInt(dash.weekAverages?.protein)} unit="g" />
                  <Stat label="Avg steps" value={statInt(dash.weekAverages?.steps)} />
                  <Stat
                    label="Run volume"
                    value={statVal(dash.weekAverages?.runKmTotal, 1)}
                    unit="km"
                  />
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <Card refract className="h-fit overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                      Wellness score
                    </div>
                    <div className="mt-3">
                      <span className="tabular text-5xl font-semibold leading-none text-accent">
                        {stabilityScore}
                      </span>
                      <div className="mt-1 text-base font-semibold text-ink-100">
                        {stabilityScore >= 80 ? 'Good Condition' : 'Keep Building'}
                      </div>
                      <div className="mt-1 text-[12px] text-ink-400">
                        {coverage}% logging coverage
                      </div>
                    </div>
                  </div>
                  <Pill tone={completionPct === 100 ? 'good' : 'info'}>
                    {doneCount}/{applicable.length}
                  </Pill>
                </div>
                <div className="mt-4">
                  <WaveLines />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-[11px] text-ink-400">
                  <span>
                    Sleep avg
                    <span className="tabular block text-lg text-ink-50">
                      {statVal(dash.weekAverages?.sleep, 1) ?? '—'} h
                    </span>
                  </span>
                  <span className="text-center">
                    Coverage
                    <span className="mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-ink-200">
                      {coverage}
                    </span>
                  </span>
                  <span className="text-right">
                    Recovery
                    <span className="tabular block text-lg text-ink-50">{hitRate}%</span>
                  </span>
                </div>
              </Card>

              <Card refract className="overflow-hidden">
                <div className="flex items-baseline justify-between px-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                    Last 5 weeks
                  </div>
                  <span className="text-[11px] text-ink-500">Plan history</span>
                </div>
                <FiveWeekCalendar today={today} phase={phase} index={index} metrics={checklist} />
              </Card>

              <div id="today-log" className="scroll-mt-6">
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- Log column ---------------- */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="hidden lg:block">{heroWeight}</div>

          <Card refract className="overflow-hidden">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                Log
              </h2>
              <span className="text-[11px] text-ink-500">Today</span>
            </div>
            <div className="space-y-2.5">
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
                to="/workout"
                className="glass-tile flex items-center justify-between gap-3 rounded-3xl px-4 py-3.5 transition-colors active:bg-white/8"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink-200">Run</span>
                  <span className="block truncate text-[11px] text-ink-400">
                    {todayRunSummary ?? (todaySchedule?.runKm ? `Planned ${todaySchedule.runKm} km` : 'Nothing planned today')}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-medium text-accent">Log details →</span>
              </Link>
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
              <NumberField
                id="today-log-meals"
                label="Meals on plan"
                inputMode="numeric"
                value={todayLog?.mealsOnPlan ?? null}
                onCommit={(mealsOnPlan) => save({ mealsOnPlan })}
                target={`Out of ${phase.mealsPerDay}`}
              />
              <NumberField
                id="today-log-sleep"
                label="Sleep"
                unit="h"
                step="0.25"
                value={todayLog?.sleepHours ?? null}
                onCommit={(sleepHours) => save({ sleepHours })}
                target={`Target ${phase.sleepHours}`}
              />
            </div>
          </Card>

          <Card refract className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-1">
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                    How it felt
                  </span>
                  <span className="mt-1 block text-[12px] text-ink-500">
                    Energy {todayLog?.energy ?? '—'} · Hunger {todayLog?.hunger ?? '—'} · Soreness{' '}
                    {todayLog?.soreness ?? '—'}
                  </span>
                </span>
                <span className="glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-300 transition-transform group-open:rotate-180">
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
