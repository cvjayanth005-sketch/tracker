import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { allExercises, recentSessions, upsertLog } from '@/db/repo'
import { dayOfWeek, daysBetween, formatShort, weekdayName } from '@/domain/date'
import { outcomeFor } from '@/domain/compliance'
import { sessionVolume } from '@/domain/progression'
import { useDashboard } from '@/hooks/useDashboard'
import { CoachChatButton } from '@/components/CoachChatButton'
import { SleepScoreCard } from '@/components/SleepScoreCard'
import { Card, EmptyState, Meter, PageHeader, Pill, SectionTitle, Stat } from '@/components/ui'
import { statInt, statVal } from '@/components/format'
import { lastSevenDates } from '@/components/SevenDayBars'
import type { DailyLog, DaySchedule, Exercise, LocalDate, Phase } from '@/domain/types'

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const TONE_COLOR = {
  accent: '#39ff14',
  info: '#00f0ff',
  warn: '#ffe100',
} as const

const TONE_GLOW = {
  accent: 'rgb(57 255 20 / 0.28)',
  info: 'rgb(0 240 255 / 0.25)',
  warn: 'rgb(255 225 0 / 0.23)',
} as const

const ACTIVITY_COACH_PROMPTS = [
  'Build my next workout',
  'Should I increase any lifts?',
  'Check my recovery before training',
  'Adjust this week after missed work',
] as const

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
  selectedDate,
  onSelectDate,
}: {
  phase: Phase
  today: LocalDate
  dates: LocalDate[]
  index: Map<LocalDate, DailyLog>
  selectedDate: LocalDate
  onSelectDate: (date: LocalDate) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {dates.map((date) => {
        const day = phase.schedule.find((candidate) => candidate.dow === dayOfWeek(date))
        const active = date === today
        const selected = date === selectedDate
        const log = index.get(date)
        const gymOutcome = outcomeFor('gym', log, phase, date)
        const runOutcome = outcomeFor('run', log, phase, date)
        const plannedOutcomes = [
          ...(day?.gym ? [gymOutcome] : []),
          ...(day?.runKm ? [runOutcome] : []),
        ]
        const done =
          plannedOutcomes.length > 0 &&
          plannedOutcomes.every((outcome) => outcome === 'hit')
        const partial = plannedOutcomes.some((outcome) => outcome === 'hit') && !done
        const missed = plannedOutcomes.some((outcome) => outcome === 'missed')
        return (
          <button
            type="button"
            key={date}
            onClick={() => onSelectDate(date)}
            aria-pressed={selected}
            title={`Open ${weekdayName(date)} ${formatShort(date)}`}
            className={`min-h-24 rounded-2xl p-2 text-left ring-1 ring-inset transition-[background-color,box-shadow,transform] active:scale-[0.97] ${
              selected
                ? 'bg-info/12 text-ink-50 ring-info/45 shadow-[0_12px_30px_-24px_rgba(0,240,255,0.8)]'
                : active
                  ? 'bg-accent/10 text-ink-50 ring-accent/30'
                  : 'bg-white/[0.045] text-ink-300 ring-white/8 hover:bg-white/[0.07]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-ink-500">
                {WEEK_LABELS[dayOfWeek(date)]}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  done
                    ? 'bg-accent'
                    : partial
                      ? 'bg-info'
                      : missed
                        ? 'bg-alert'
                        : active
                          ? 'bg-info'
                          : 'bg-white/18'
                }`}
              />
            </div>
            <div className="mt-1 tabular text-[10px] text-ink-500">
              {formatShort(date).split(' ')[0]}
            </div>
            <div className="mt-3 text-[11px] font-semibold capitalize leading-tight">
              {day?.gym ? day.sessionType : 'Rest'}
            </div>
            <div className="mt-1 min-h-7 text-[10px] leading-tight text-ink-500">
              {day?.runKm ? `${day.runKm} km ${day.runType}` : 'No run'}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SelectedDayPanel({
  date,
  today,
  phase,
  log,
  exercises,
}: {
  date: LocalDate
  today: LocalDate
  phase: Phase
  log: DailyLog | undefined
  exercises: Exercise[]
}) {
  const schedule = phase.schedule.find((day) => day.dow === dayOfWeek(date))
  const gymOutcome = outcomeFor('gym', log, phase, date)
  const runOutcome = outcomeFor('run', log, phase, date)
  const plannedOutcomes = [
    ...(schedule?.gym ? [gymOutcome] : []),
    ...(schedule?.runKm ? [runOutcome] : []),
  ]
  const completed =
    plannedOutcomes.length > 0 && plannedOutcomes.every((outcome) => outcome === 'hit')
  const partial = plannedOutcomes.some((outcome) => outcome === 'hit') && !completed
  const missed = plannedOutcomes.some((outcome) => outcome === 'missed')
  const isToday = date === today
  const canStartWorkout = isToday && schedule?.gym && schedule.sessionType !== 'rest'
  const plannedExercises = schedule?.gym
    ? exercises.filter(
        (exercise) =>
          schedule.sessionType === 'full' || exercise.sessionType === schedule.sessionType,
      )
    : []
  const isRest = !schedule?.gym && !schedule?.runKm
  const status = completed
    ? 'Completed'
    : partial
      ? 'Partial'
      : missed
        ? 'Missed'
        : isRest
          ? 'Rest'
          : isToday
            ? 'Today'
            : 'Open'
  const statusTone = completed
    ? 'good'
    : missed
      ? 'bad'
      : partial || isToday
        ? 'info'
        : 'neutral'

  return (
    <div className="glass-inset mt-3 rounded-2xl p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase text-ink-400">
            Selected day
          </div>
          <div className="mt-1 text-sm font-semibold text-ink-50">
            {weekdayName(date)} · {formatShort(date)}
          </div>
        </div>
        <Pill tone={statusTone}>{status}</Pill>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-ink-500">Strength</div>
          <div className="mt-1 truncate font-semibold capitalize text-ink-200">
            {schedule?.gym ? schedule.sessionType : 'Rest'}
          </div>
        </div>
        <div>
          <div className="text-ink-500">Running</div>
          <div className="mt-1 truncate font-semibold text-ink-200">
            {schedule?.runKm ? `${schedule.runKm} km` : 'Rest'}
          </div>
        </div>
        <div>
          <div className="text-ink-500">Recovery</div>
          <div className="mt-1 truncate font-semibold text-ink-200">
            {log?.sleepHours == null ? 'Not logged' : `${log.sleepHours} h`}
          </div>
        </div>
      </div>

      {plannedExercises.length > 0 ? (
        <div className="mt-3 border-t border-white/8 pt-3">
          <div className="text-[10px] font-semibold uppercase text-ink-500">
            Session preview · {plannedExercises.length} exercises
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plannedExercises.slice(0, 4).map((exercise) => (
              <span
                key={exercise.id}
                className="rounded-lg bg-black/25 px-2 py-1 text-[10px] text-ink-300 ring-1 ring-inset ring-white/8"
              >
                {exercise.name}
              </span>
            ))}
            {plannedExercises.length > 4 ? (
              <span className="px-1 py-1 text-[10px] text-ink-500">
                +{plannedExercises.length - 4}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canStartWorkout ? (
          <Link
            to="/workout"
            className="rounded-xl bg-accent px-3 py-2 text-[11px] font-semibold text-ink-950"
          >
            Start workout
          </Link>
        ) : null}
        <Link
          to={`/calendar/${date}`}
          className="rounded-xl bg-white/8 px-3 py-2 text-[11px] font-semibold text-ink-100 ring-1 ring-inset ring-white/10"
        >
          Open day
        </Link>
        {schedule?.runKm ? (
          <Link
            to={`/calendar/${date}#runs`}
            className="rounded-xl bg-info/12 px-3 py-2 text-[11px] font-semibold text-info ring-1 ring-inset ring-info/20"
          >
            Log run
          </Link>
        ) : null}
        {schedule?.gym && gymOutcome !== 'hit' ? (
          <button
            type="button"
            onClick={() =>
              void upsertLog(date, { gymDone: log?.gymDone === false ? null : false })
            }
            className="rounded-xl px-3 py-2 text-[11px] font-semibold text-ink-300 ring-1 ring-inset ring-white/10"
          >
            {log?.gymDone === false ? 'Clear rest mark' : 'Mark rest'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (!isFiniteNumber(value)) return '—'
  if (unit === 'steps') return Math.round(value).toLocaleString()
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function formatAxisValue(value: number | null | undefined, unit: string): string {
  if (!isFiniteNumber(value)) return ''
  if (unit === 'steps') {
    if (value >= 1000) return `${Number((value / 1000).toFixed(1))}k`
    return Math.round(value).toLocaleString()
  }
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
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
  target: number | null
  tone: 'accent' | 'info' | 'warn'
}) {
  const targetValue = isFiniteNumber(target) && target > 0 ? target : null
  const known = values.filter((point) => isFiniteNumber(point.value))
  const average =
    known.length === 0
      ? null
      : known.reduce((sum, point) => sum + (point.value ?? 0), 0) / known.length
  const hits =
    targetValue === null
      ? null
      : values.filter((point) => isFiniteNumber(point.value) && point.value >= targetValue).length
  const best = known.length === 0 ? null : Math.max(...known.map((point) => point.value ?? 0))
  const color = TONE_COLOR[tone]
  const gradientId = `activity-${tone}-${title.toLowerCase()}`
  const chartData = values.map((point) => ({
    date: point.date,
    day: formatShort(point.date),
    value: isFiniteNumber(point.value) ? point.value : undefined,
  }))
  const maxValue = Math.max(1, targetValue ?? 0, ...known.map((point) => point.value ?? 0))
  const domainMax = Math.ceil(maxValue * 1.18)

  return (
    <Card className="overflow-hidden !p-0">
      <div className="flex items-start justify-between gap-4">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 14px ${TONE_GLOW[tone]}` }} />
            <div className="text-sm font-semibold text-ink-50">{title}</div>
          </div>
          <div className="mt-1.5 text-[11px] text-ink-400">
            {known.length}/7 logged · target{' '}
            {targetValue === null ? 'not set' : `${targetValue.toLocaleString()} ${unit}`}
          </div>
        </div>
        <div className="px-5 pt-5 text-right sm:px-6 sm:pt-6">
          <div className="tabular-display text-2xl font-semibold leading-none text-ink-50">
            {formatMetricValue(average, unit)}
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase text-ink-500">7-day avg</div>
        </div>
      </div>

      <div className="relative mt-3 h-56 w-full px-2 sm:h-60 sm:px-4">
        {known.length === 0 ? (
          <div className="absolute inset-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] text-center">
            <div className="text-sm font-semibold text-ink-200">No {title.toLowerCase()} logged</div>
            <div className="mt-1 text-[11px] text-ink-500">Your seven-day trend will appear here.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 2, left: -10 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="72%" stopColor={color} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="rgb(255 255 255 / 0.07)"
                strokeDasharray="2 7"
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#8888aa', fontSize: 10, fontWeight: 600 }}
                tickMargin={12}
                minTickGap={2}
                interval={0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#5a5a80', fontSize: 10 }}
                tickFormatter={(value: number) => formatAxisValue(value, unit)}
                width={44}
                domain={[0, domainMax]}
                tickCount={4}
              />
              {targetValue === null ? null : (
                <ReferenceLine
                  y={targetValue}
                  stroke="rgb(240 240 255 / 0.4)"
                  strokeDasharray="5 6"
                  label={{
                    value: 'GOAL',
                    position: 'insideTopRight',
                    fill: '#8888aa',
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />
              )}
              <Tooltip
                cursor={{ stroke: 'rgb(255 255 255 / 0.18)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const item = payload?.[0]?.payload as
                    | { date: LocalDate; value: number | undefined }
                    | undefined
                  if (!active || !item) return null
                  const pointValue = isFiniteNumber(item.value) ? item.value : null
                  return (
                    <div className="rounded-xl border border-white/12 bg-ink-900/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
                      <div className="text-[10px] font-semibold uppercase text-ink-400">
                        {weekdayName(item.date)} · {formatShort(item.date)}
                      </div>
                      <div className="mt-1 tabular text-sm font-semibold text-ink-50">
                        {formatMetricValue(pointValue, unit)}
                      </div>
                      <div className="mt-0.5 text-[10px]" style={{ color }}>
                        {pointValue === null
                          ? 'Not logged'
                          : targetValue === null
                            ? 'Target not set'
                            : pointValue >= targetValue
                            ? 'Goal reached'
                            : `${formatMetricValue(targetValue - pointValue, unit)} to goal`}
                      </div>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                connectNulls={false}
                stroke={color}
                strokeWidth={3}
                fill={`url(#${gradientId})`}
                dot={{ r: 3.5, fill: '#08080d', stroke: color, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: color, stroke: '#08080d', strokeWidth: 3 }}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border-t border-white/8 px-5 py-4 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-4">
            <span className="text-ink-400">Consistency</span>
            <span className="text-ink-500">
              Best <strong className="font-semibold text-ink-200">{formatMetricValue(best, unit)}</strong>
            </span>
          </div>
          <span className="tabular font-semibold text-ink-200">
            {hits === null ? '—' : `${hits}/7`}
          </span>
        </div>
        <Meter
          value={hits === null ? null : (hits / 7) * 100}
          tone={hits !== null && hits >= 5 ? 'accent' : tone}
        />
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
          ? `Target ${formatMetricValue(phase.steps, 'steps')}`
          : `${formatMetricValue(todayLog.steps, 'steps')} / ${formatMetricValue(phase.steps, 'steps')}`,
      state:
        todayLog?.steps != null && isFiniteNumber(phase.steps) && todayLog.steps >= phase.steps
          ? 'Done'
          : 'Open',
      tone:
        todayLog?.steps != null && isFiniteNumber(phase.steps) && todayLog.steps >= phase.steps
          ? 'good'
          : 'neutral',
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
              <div className="tabular-display text-3xl font-semibold leading-none text-ink-50">
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
  const exercises = useLiveQuery(() => allExercises(), [], [] as Exercise[])
  const [selectedDate, setSelectedDate] = useState<LocalDate>(today)

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
  const sleepScoreByDate = new Map(dash.sleepScores.map((night) => [night.date, night.result]))
  const sleepScoreSeries = dates.map((date) => ({ date, result: sleepScoreByDate.get(date) }))
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
    todayLog?.steps == null || !isFiniteNumber(phase.steps)
      ? null
      : Math.max(0, phase.steps - todayLog.steps)
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
  const gymDoneDays = dates.filter(
    (date) => outcomeFor('gym', index.get(date), phase, date) === 'hit',
  ).length

  return (
    <div className="pb-4">
      <PageHeader title="Activity" eyebrow="Training · recovery · coach" />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <div className="flex min-w-0 flex-col gap-4">
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

          <CoachChatButton placement="card" starters={ACTIVITY_COACH_PROMPTS} fillHeight />
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <div className="text-sm font-semibold text-ink-50">Full Week Split</div>
                <div className="mt-1 text-[11px] text-ink-500">{phase.name}</div>
              </div>
              <Pill tone="info">
                {weeklyRunTarget > 0 ? `${weeklyRunTarget} km` : 'run optional'}
              </Pill>
            </div>
            <WeekSplit
              phase={phase}
              today={today}
              dates={dates}
              index={index}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            <SelectedDayPanel
              date={selectedDate}
              today={today}
              phase={phase}
              log={index.get(selectedDate)}
              exercises={exercises ?? []}
            />
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

          <SleepScoreCard
            log={todayLog}
            score={dash.todaySleepScore}
            scores={sleepScoreSeries}
            targetHours={phase.sleepHours}
          />
        </div>
      </div>

      <SectionTitle>Progress</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
        <div className="lg:col-span-2 xl:col-span-1">
          <MetricChart
            title="Running"
            unit="km"
            values={runs}
            target={
              weeklyRunTarget > 0 ? weeklyRunTarget / 7 : Math.max(1, scheduled?.runKm ?? 1)
            }
            tone="warn"
          />
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
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
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
            <Pill tone={stepHits >= 5 ? 'good' : 'warn'}>steps {stepHits}/7</Pill>
            <Pill tone={sleepHits >= 5 ? 'good' : 'info'}>sleep {sleepHits}/7</Pill>
            <Pill tone={weeklyRunTarget > 0 && runTotal >= weeklyRunTarget ? 'good' : 'neutral'}>
              runs {runTotal.toFixed(1)} km
            </Pill>
          </div>
        </Card>
      </div>

      <div className="mt-4">
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
      </div>
    </div>
  )
}
