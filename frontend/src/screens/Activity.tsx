import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { recentSessions } from '@/db/repo'
import { dayOfWeek, daysBetween, formatShort, weekdayName } from '@/domain/date'
import { outcomeFor } from '@/domain/compliance'
import { sessionVolume } from '@/domain/progression'
import { useDashboard } from '@/hooks/useDashboard'
import { CoachChatButton } from '@/components/CoachChatButton'
import { Card, EmptyState, Meter, PageHeader, Pill, SectionTitle, Stat } from '@/components/ui'
import { statInt, statVal } from '@/components/format'
import { lastSevenDates } from '@/components/SevenDayBars'
import type { DailyLog, DaySchedule, LocalDate, Phase } from '@/domain/types'

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const TONE_COLOR = {
  accent: '#39ff14',
  info: '#00f0ff',
  warn: '#ffe100',
} as const

function scheduleLabel(day: DaySchedule): string {
  const strength = day.gym ? day.sessionType : 'Rest'
  const run = day.runKm ? `${day.runKm} km ${day.runType}` : null
  return run ? `${strength} + ${run}` : strength
}

function WeekSplit({
  phase,
  today,
  dates,
  index,
}: {
  phase: Phase
  today: LocalDate
  dates: LocalDate[]
  index: Map<LocalDate, DailyLog>
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {phase.schedule.map((day) => {
        const active = day.dow === dayOfWeek(today)
        const date = dates.find((candidate) => dayOfWeek(candidate) === day.dow)
        const log = date ? index.get(date) : undefined
        const gymOutcome = date ? outcomeFor('gym', log, phase, date) : 'unknown'
        const runOutcome = date ? outcomeFor('run', log, phase, date) : 'unknown'
        const done = gymOutcome === 'hit' || runOutcome === 'hit'
        const missed = gymOutcome === 'missed' || runOutcome === 'missed'
        return (
          <div
            key={day.dow}
            className={`min-h-24 rounded-2xl p-2 ring-1 ring-inset ${
              active
                ? 'bg-accent/12 text-ink-50 ring-accent/35'
                : 'bg-white/[0.045] text-ink-300 ring-white/8'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-ink-500">
                {WEEK_LABELS[day.dow]}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  done
                    ? 'bg-accent'
                    : missed
                      ? 'bg-alert'
                      : active
                        ? 'bg-info'
                        : 'bg-white/18'
                }`}
              />
            </div>
            <div className="mt-3 text-[11px] font-semibold capitalize leading-tight">
              {day.gym ? day.sessionType : 'Rest'}
            </div>
            <div className="mt-1 min-h-7 text-[10px] leading-tight text-ink-500">
              {day.runKm ? `${day.runKm} km ${day.runType}` : 'No run'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return '—'
  if (unit === 'steps') return Math.round(value).toLocaleString()
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function MetricChart({
  title,
  unit,
  values,
  target,
  tone,
}: {
  title: string
  unit: string
  values: Array<{ date: LocalDate; value: number | null }>
  target: number
  tone: 'accent' | 'info' | 'warn'
}) {
  const known = values.filter((point) => point.value !== null)
  const average =
    known.length === 0
      ? null
      : known.reduce((sum, point) => sum + (point.value ?? 0), 0) / known.length
  const hits = values.filter((point) => point.value !== null && point.value >= target).length
  const maxValue = Math.max(1, target, ...values.map((point) => point.value ?? 0))
  const width = 420
  const height = 164
  const chartTop = 18
  const chartBottom = 126
  const chartHeight = chartBottom - chartTop
  const slot = width / values.length
  const barWidth = Math.min(34, slot * 0.42)
  const color = TONE_COLOR[tone]
  const targetY = chartBottom - (target / maxValue) * chartHeight
  const path = known
    .map((point) => {
      const index = values.findIndex((value) => value.date === point.date)
      const x = slot * index + slot / 2
      const y = chartBottom - ((point.value ?? 0) / maxValue) * chartHeight
      return `${index === values.findIndex((value) => value.value !== null) ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-ink-50">{title}</div>
          <div className="mt-1 text-[11px] text-ink-500">
            {known.length}/7 logged · target {target.toLocaleString()} {unit}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-xl font-semibold text-ink-50">
            {formatMetricValue(average, unit)}
          </div>
          <div className="text-[11px] text-ink-500">avg</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-44 w-full" role="img">
        <line
          x1="0"
          x2={width}
          y1={targetY}
          y2={targetY}
          stroke="rgb(255 255 255 / 0.24)"
          strokeDasharray="5 7"
        />
        {values.map((point, index) => {
          const x = slot * index + slot / 2
          const value = point.value ?? 0
          const barHeight = point.value === null ? 8 : Math.max(8, (value / maxValue) * chartHeight)
          const y = chartBottom - barHeight
          return (
            <g key={point.date}>
              <rect
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="8"
                fill={point.value === null ? 'rgb(255 255 255 / 0.08)' : color}
                opacity={point.value === null ? 1 : 0.86}
              />
              {point.value === null ? (
                <circle cx={x} cy={chartBottom - 4} r="3" fill="rgb(255 255 255 / 0.18)" />
              ) : null}
              <text
                x={x}
                y="150"
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="rgb(136 136 170 / 0.9)"
              >
                {formatShort(point.date).slice(0, 2)}
              </text>
            </g>
          )
        })}
        {path ? (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
        ) : null}
      </svg>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[11px] text-ink-400">
          <span>Consistency</span>
          <span>{hits}/7</span>
        </div>
        <Meter value={(hits / 7) * 100} tone={hits >= 5 ? 'accent' : tone} />
      </div>
    </Card>
  )
}

function TrainingChecklist({
  scheduled,
  todayLog,
  gymOutcome,
  runOutcome,
  phase,
}: {
  scheduled: DaySchedule | undefined
  todayLog: DailyLog | undefined
  gymOutcome: ReturnType<typeof outcomeFor>
  runOutcome: ReturnType<typeof outcomeFor>
  phase: Phase
}) {
  const items = [
    {
      label: 'Strength',
      detail: scheduled?.gym ? `${scheduled.sessionType} session` : 'Rest day',
      state: gymOutcome === 'hit' ? 'Done' : scheduled?.gym ? 'Planned' : 'Rest',
      tone: gymOutcome === 'hit' ? 'good' : 'neutral',
    },
    {
      label: 'Run',
      detail: scheduled?.runKm ? `${scheduled.runKm} km ${scheduled.runType}` : 'No run planned',
      state: runOutcome === 'hit' ? 'Done' : scheduled?.runKm ? 'Planned' : 'Rest',
      tone: runOutcome === 'hit' ? 'good' : 'neutral',
    },
    {
      label: 'Steps',
      detail:
        todayLog?.steps == null
          ? `Target ${phase.steps.toLocaleString()}`
          : `${todayLog.steps.toLocaleString()} / ${phase.steps.toLocaleString()}`,
      state: todayLog?.steps != null && todayLog.steps >= phase.steps ? 'Done' : 'Open',
      tone: todayLog?.steps != null && todayLog.steps >= phase.steps ? 'good' : 'neutral',
    },
    {
      label: 'Recovery',
      detail:
        todayLog?.sleepHours == null
          ? `Target ${phase.sleepHours}h`
          : `${todayLog.sleepHours} / ${phase.sleepHours}h`,
      state:
        todayLog?.sleepHours != null && todayLog.sleepHours >= phase.sleepHours ? 'Done' : 'Open',
      tone: todayLog?.sleepHours != null && todayLog.sleepHours >= phase.sleepHours ? 'good' : 'neutral',
    },
  ] as const

  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass-inset rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              {item.label}
            </div>
            <Pill tone={item.tone === 'good' ? 'good' : 'neutral'}>{item.state}</Pill>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-ink-100">{item.detail}</div>
        </div>
      ))}
    </div>
  )
}

function MoveRing({
  walkingKcal,
  runningKcal,
  target,
}: {
  walkingKcal: number
  runningKcal: number
  target: number
}) {
  const total = walkingKcal + runningKcal
  const pct = Math.min(100, (total / target) * 100)
  const size = 156
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const walkingPct = total > 0 ? walkingKcal / total : 0
  const runningPct = total > 0 ? runningKcal / total : 0

  return (
    <Card>
      <div>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-ink-50">Movement Burn</div>
            <div className="mt-1 text-[11px] text-ink-500">walking + running estimate</div>
          </div>
          <Pill tone={pct >= 100 ? 'good' : 'info'}>{Math.round(pct)}%</Pill>
        </div>

        <div className="mt-5 grid items-center gap-4 sm:grid-cols-[10rem_1fr]">
          <div className="relative mx-auto h-40 w-40">
            <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 -rotate-90">
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
                stroke="#39ff14"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference * walkingPct * (pct / 100)} ${circumference}`}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#00f0ff"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference * runningPct * (pct / 100)} ${circumference}`}
                strokeDashoffset={-circumference * walkingPct * (pct / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="tabular text-3xl font-semibold leading-none text-ink-50">
                {Math.round(total)}
              </div>
              <div className="mt-1 text-[11px] text-ink-500">kcal</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[12px] text-ink-300">
                <span>Walking</span>
                <span className="tabular">{Math.round(walkingKcal)} kcal</span>
              </div>
              <Meter value={target > 0 ? (walkingKcal / target) * 100 : null} tone="accent" />
            </div>
            <div>
              <div className="flex justify-between text-[12px] text-ink-300">
                <span>Running</span>
                <span className="tabular">{Math.round(runningKcal)} kcal</span>
              </div>
              <Meter value={target > 0 ? (runningKcal / target) * 100 : null} tone="info" />
            </div>
            <div className="text-[11px] leading-relaxed text-ink-500">
              Estimate uses logged steps and run distance. We can replace it with wearable calories
              later if you connect a source.
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Activity() {
  const dash = useDashboard(30)
  const { today, phase, settings, index, todayLog } = dash
  const sessions = useLiveQuery(() => recentSessions(60), [], [])

  const dates = useMemo(() => lastSevenDates(today), [today])
  const scheduled = useMemo(
    () => phase?.schedule.find((item) => item.dow === dayOfWeek(today)),
    [phase, today],
  )

  const training = useMemo(() => {
    if (!sessions) return []
    const currentWeekStart = dates[0]!
    return [0, 1, 2, 3].map((weekIndex) => {
      const inWeek =
        weekIndex === 0
          ? sessions.filter(
              (session) =>
                session.workout.date >= currentWeekStart && session.workout.date <= today,
            )
          : sessions.filter((session) => {
              const ageDays = daysBetween(session.workout.date, today)
              return ageDays >= weekIndex * 7 && ageDays < (weekIndex + 1) * 7
            })
      return {
        label: weekIndex === 0 ? 'This week' : `${weekIndex + 1}w ago`,
        sessions: inWeek.length,
        volume: inWeek.reduce((sum, session) => sum + sessionVolume(session.sets), 0),
      }
    })
  }, [dates, sessions, today])

  if (!phase || !settings) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const steps = dates.map((date) => ({ date, value: index.get(date)?.steps ?? null }))
  const sleep = dates.map((date) => ({ date, value: index.get(date)?.sleepHours ?? null }))
  const runs = dates.map((date) => ({ date, value: index.get(date)?.runKm ?? null }))
  const stepHits = steps.filter((point) => point.value != null && point.value >= phase.steps).length
  const sleepHits = sleep.filter(
    (point) => point.value != null && point.value >= phase.sleepHours,
  ).length
  const runTotal = runs.reduce((sum, point) => sum + (point.value ?? 0), 0)
  const weeklyRunTarget = phase.weeklyRunKmTarget ?? 0
  const bodyWeight = dash.change?.current.averageKg ?? todayLog?.weightKg ?? phase.startWeightKg
  const walkingKcal = ((todayLog?.steps ?? 0) / 1000) * bodyWeight * 0.52
  const runningKcal = (todayLog?.runKm ?? 0) * bodyWeight
  const movementTarget = Math.max(300, phase.steps * 0.035 + weeklyRunTarget * bodyWeight / 7)
  const todayGymOutcome = outcomeFor('gym', todayLog, phase, today)
  const todayRunOutcome = outcomeFor('run', todayLog, phase, today)
  const remainingSteps =
    todayLog?.steps == null ? null : Math.max(0, phase.steps - todayLog.steps)
  const nextAction =
    scheduled?.gym && todayGymOutcome !== 'hit'
      ? `Start your ${scheduled.sessionType} session`
      : scheduled?.runKm && todayRunOutcome !== 'hit'
        ? `Log ${scheduled.runKm} km ${scheduled.runType} run`
        : remainingSteps != null && remainingSteps > 0
          ? `${remainingSteps.toLocaleString()} steps left today`
          : (todayLog?.sleepHours ?? 0) < phase.sleepHours
            ? 'Protect recovery tonight'
            : 'Training day is on track'
  const plannedGymDays = phase.schedule.filter((day) => day.gym).length
  const plannedRunKm = phase.schedule.reduce((sum, day) => sum + (day.runKm ?? 0), 0)
  const gymDoneDays = dates.filter((date) => outcomeFor('gym', index.get(date), phase, date) === 'hit').length

  return (
    <div className="pb-4">
      <PageHeader
        title="Activity"
        eyebrow="Training · recovery · coach"
        action={<CoachChatButton placement="inline" />}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                {weekdayName(today)} · {formatShort(today)}
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50">
                Day Training
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-300">
                {scheduled ? scheduleLabel(scheduled) : 'No training split found for today.'}
              </p>
            </div>

            <div className="lg:w-64">
              <div className="glass-inset rounded-2xl p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                  Next action
                </div>
                <div className="mt-2 text-sm font-semibold leading-snug text-ink-50">
                  {nextAction}
                </div>
              </div>
              <Link
                to="/workout"
                className="mt-2 block rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-ink-950 shadow-[0_18px_40px_-24px_rgba(57,255,20,0.9)]"
              >
                Open workout
              </Link>
            </div>
          </div>

          <TrainingChecklist
            scheduled={scheduled}
            todayLog={todayLog}
            gymOutcome={todayGymOutcome}
            runOutcome={todayRunOutcome}
            phase={phase}
          />
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <div className="text-sm font-semibold text-ink-50">Full Week Split</div>
              <div className="mt-1 text-[11px] text-ink-500">{phase.name}</div>
            </div>
            <Pill tone="info">{weeklyRunTarget > 0 ? `${weeklyRunTarget} km` : 'run optional'}</Pill>
          </div>
          <WeekSplit phase={phase} today={today} dates={dates} index={index} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Gym" value={`${gymDoneDays}/${plannedGymDays}`} sub="done / planned" />
            <Stat
              label="Run"
              value={runTotal.toFixed(1)}
              unit="km"
              sub={`${plannedRunKm} km planned`}
            />
          </div>
        </Card>
      </div>

      <SectionTitle>Progress</SectionTitle>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-1">
          <MetricChart
            title="Steps"
            unit="steps"
            values={steps}
            target={phase.steps}
            tone="accent"
          />
          <MetricChart
            title="Sleep"
            unit="h"
            values={sleep}
            target={phase.sleepHours}
            tone="info"
          />
          <MetricChart
            title="Running"
            unit="km"
            values={runs}
            target={weeklyRunTarget > 0 ? weeklyRunTarget / 7 : Math.max(1, scheduled?.runKm ?? 1)}
            tone="warn"
          />
        </div>

        <div className="space-y-4">
          <MoveRing
            walkingKcal={walkingKcal}
            runningKcal={runningKcal}
            target={movementTarget}
          />

          <Card>
            <div className="text-sm font-semibold text-ink-50">Weekly Summary</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat label="Avg steps" value={statInt(dash.weekAverages?.steps)} />
              <Stat label="Avg sleep" value={statVal(dash.weekAverages?.sleep, 1)} unit="h" />
              <Stat
                label="Run volume"
                value={statVal(dash.weekAverages?.runKmTotal, 1)}
                unit="km"
              />
              <Stat label="Step hits" value={`${stepHits}/7`} />
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <SectionTitle>Strength Progress</SectionTitle>
          <Card>
            <div className="space-y-3">
              {training.map((week) => (
                <div key={week.label}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-ink-300">{week.label}</span>
                    <span className="tabular text-ink-200">
                      {week.sessions} session{week.sessions === 1 ? '' : 's'}
                      <span className="text-ink-600">
                        {' '}
                        · {Math.round(week.volume).toLocaleString()} kg·reps
                      </span>
                    </span>
                  </div>
                  <Meter value={Math.min(100, (week.sessions / 4) * 100)} tone="accent" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <SectionTitle>Coach Context</SectionTitle>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={stepHits >= 5 ? 'good' : 'warn'}>steps {stepHits}/7</Pill>
              <Pill tone={sleepHits >= 5 ? 'good' : 'info'}>sleep {sleepHits}/7</Pill>
              <Pill tone={weeklyRunTarget > 0 && runTotal >= weeklyRunTarget ? 'good' : 'neutral'}>
                runs {runTotal.toFixed(1)} km
              </Pill>
            </div>
            <div className="mt-4 grid gap-2">
              {['Plan tomorrow', 'Adjust this week', 'Recovery check', 'Missed workout fix'].map(
                (prompt) => (
                  <div
                    key={prompt}
                    className="rounded-2xl bg-white/[0.045] px-3 py-2 text-[12px] font-semibold text-ink-200 ring-1 ring-inset ring-white/8"
                  >
                    {prompt}
                  </div>
                ),
              )}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
              Use Coach from the header to plan the next session around this split, current
              recovery, and missed/open training work.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
