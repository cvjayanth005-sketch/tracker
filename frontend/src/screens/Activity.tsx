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
import type { DaySchedule, LocalDate, Phase } from '@/domain/types'

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function scheduleLabel(day: DaySchedule): string {
  const strength = day.gym ? day.sessionType : 'Rest'
  const run = day.runKm ? `${day.runKm} km ${day.runType}` : null
  return run ? `${strength} + ${run}` : strength
}

function WeekSplit({
  phase,
  today,
}: {
  phase: Phase
  today: LocalDate
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {phase.schedule.map((day) => {
        const active = day.dow === dayOfWeek(today)
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
              {active ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
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

function SevenDayProgress({
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
  const toneClass = {
    accent: 'bg-accent',
    info: 'bg-info',
    warn: 'bg-warn',
  }[tone]
  const known = values.filter((point) => point.value !== null)
  const average =
    known.length === 0
      ? null
      : known.reduce((sum, point) => sum + (point.value ?? 0), 0) / known.length
  const hits = values.filter((point) => point.value !== null && point.value >= target).length

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-ink-50">{title}</div>
          <div className="mt-1 text-[11px] text-ink-500">
            {known.length}/7 logged · target {target.toLocaleString()} {unit}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-xl font-semibold text-ink-50">
            {average === null ? '—' : Math.round(average).toLocaleString()}
          </div>
          <div className="text-[11px] text-ink-500">avg</div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {values.map((point) => {
          const pct =
            point.value === null || target <= 0
              ? null
              : Math.min(100, Math.max(4, (point.value / target) * 100))
          return (
            <div key={point.date} className="grid grid-cols-[3.25rem_1fr_4.75rem] items-center gap-3">
              <div className="text-[11px] font-medium text-ink-400">{formatShort(point.date)}</div>
              <div className="h-2 overflow-hidden rounded-full bg-white/7">
                {pct === null ? (
                  <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.07)_4px,rgba(255,255,255,0.07)_8px)]" />
                ) : (
                  <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${pct}%` }} />
                )}
              </div>
              <div className="tabular text-right text-[11px] text-ink-300">
                {point.value === null ? '—' : point.value.toLocaleString()}
              </div>
            </div>
          )
        })}
      </div>

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

            <Link
              to="/workout"
              className="rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-ink-950 shadow-[0_18px_40px_-24px_rgba(57,255,20,0.9)]"
            >
              Open workout
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Strength"
              value={todayGymOutcome === 'hit' ? 'Done' : scheduled?.gym ? 'Planned' : 'Rest'}
              sub={scheduled?.gym ? `${scheduled.sessionType} day` : 'no gym'}
              tone={todayGymOutcome === 'hit' ? 'good' : 'default'}
            />
            {typeof todayLog?.runKm === 'number' ? (
              <Stat
                label="Run"
                value={todayLog.runKm}
                unit="km"
                sub={scheduled?.runKm ? `${scheduled.runKm} km target` : 'no run'}
                tone={todayRunOutcome === 'hit' ? 'good' : 'default'}
              />
            ) : (
              <Stat
                label="Run"
                value={scheduled?.runKm ? 'Planned' : 'Rest'}
                sub={scheduled?.runKm ? `${scheduled.runKm} km target` : 'no run'}
              />
            )}
            <Stat
              label="Recovery"
              value={statVal(todayLog?.sleepHours ?? null, 1)}
              unit="h"
              sub={`target ${phase.sleepHours}h`}
              tone={(todayLog?.sleepHours ?? 0) >= phase.sleepHours ? 'good' : 'default'}
            />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <div className="text-sm font-semibold text-ink-50">Full Week Split</div>
              <div className="mt-1 text-[11px] text-ink-500">{phase.name}</div>
            </div>
            <Pill tone="info">{weeklyRunTarget > 0 ? `${weeklyRunTarget} km` : 'run optional'}</Pill>
          </div>
          <WeekSplit phase={phase} today={today} />
        </Card>
      </div>

      <SectionTitle>Progress</SectionTitle>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-1">
          <SevenDayProgress
            title="Steps"
            unit="steps"
            values={steps}
            target={phase.steps}
            tone="accent"
          />
          <SevenDayProgress
            title="Sleep"
            unit="h"
            values={sleep}
            target={phase.sleepHours}
            tone="info"
          />
          <SevenDayProgress
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
