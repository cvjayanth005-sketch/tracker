import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { recentSessions } from '@/db/repo'
import { dayOfWeek, daysBetween } from '@/domain/date'
import { sessionVolume } from '@/domain/progression'
import { useDashboard } from '@/hooks/useDashboard'
import { CoachChatButton } from '@/components/CoachChatButton'
import { Card, EmptyState, Meter, PageHeader, Pill, SectionTitle, Stat } from '@/components/ui'
import { statInt, statVal } from '@/components/format'
import { lastSevenDates, SevenDayBars } from '@/components/SevenDayBars'

export default function Activity() {
  const dash = useDashboard(30)
  const { today, phase, settings, index } = dash
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
          ? sessions.filter((session) => session.workout.date >= currentWeekStart && session.workout.date <= today)
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

  const steps = dates.map((date) => ({
    date,
    value: index.get(date)?.steps ?? null,
    target: phase.steps,
  }))
  const sleep = dates.map((date) => ({
    date,
    value: index.get(date)?.sleepHours ?? null,
    target: phase.sleepHours,
  }))
  const runs = dates.map((date) => ({
    date,
    value: index.get(date)?.runKm ?? null,
    target: null,
  }))
  const stepHits = steps.filter((point) => point.value != null && point.value >= phase.steps).length
  const sleepHits = sleep.filter((point) => point.value != null && point.value >= phase.sleepHours).length
  const runTotal = runs.reduce((sum, point) => sum + (point.value ?? 0), 0)
  const weeklyRunTarget = phase.weeklyRunKmTarget ?? 0

  return (
    <div className="pb-4">
      <PageHeader
        title="Activity"
        eyebrow="Training · recovery · coach"
        action={<CoachChatButton placement="inline" />}
      />

      <SectionTitle>Today</SectionTitle>
      <Card>
        <div className="grid gap-3 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div>
            <div className="text-2xl font-semibold text-ink-50">
              {scheduled?.gym ? `${scheduled.sessionType} strength` : 'No strength scheduled'}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-400">
              {scheduled?.runKm
                ? `${scheduled.runKm} km ${scheduled.runType} run is planned today.`
                : 'No run is scheduled today. Keep steps and recovery honest.'}
            </p>
          </div>
          <Link
            to="/workout"
            className="rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-ink-950 shadow-[0_18px_40px_-24px_rgba(57,255,20,0.9)]"
          >
            Open workout
          </Link>
        </div>
      </Card>

      <SectionTitle>Average Cards</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Avg steps"
          value={statInt(dash.weekAverages?.steps)}
          sub={`target ${phase.steps.toLocaleString()}`}
        />
        <Stat
          label="Avg sleep"
          value={statVal(dash.weekAverages?.sleep, 1)}
          unit="h"
          sub={`target ${phase.sleepHours}h`}
        />
        <Stat
          label="Run volume"
          value={statVal(dash.weekAverages?.runKmTotal, 1)}
          unit="km"
          sub={weeklyRunTarget > 0 ? `target ${weeklyRunTarget}km` : 'no weekly target'}
        />
        <Stat label="Step hits" value={`${stepHits}/7`} sub="last 7 days" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <SectionTitle action={<span className="text-xs text-ink-400">{stepHits}/7 hit</span>}>
            Steps
          </SectionTitle>
          <Card>
            <SevenDayBars points={steps} tone="bg-accent" />
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[11px] text-ink-400">
                <span>Steps consistency</span>
                <span>{stepHits}/7</span>
              </div>
              <Meter value={(stepHits / 7) * 100} tone={stepHits >= 5 ? 'accent' : 'warn'} />
            </div>
          </Card>
        </div>

        <div>
          <SectionTitle action={<span className="text-xs text-ink-400">{sleepHits}/7 hit</span>}>
            Sleep
          </SectionTitle>
          <Card>
            <SevenDayBars points={sleep} tone="bg-info" unit="h" />
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[11px] text-ink-400">
                <span>Recovery consistency</span>
                <span>{sleepHits}/7</span>
              </div>
              <Meter value={(sleepHits / 7) * 100} tone={sleepHits >= 5 ? 'accent' : 'info'} />
            </div>
          </Card>
        </div>
      </div>

      <SectionTitle
        action={<span className="text-xs text-ink-400">{runTotal.toFixed(1)} km this week</span>}
      >
        Running
      </SectionTitle>
      <Card>
        <SevenDayBars points={runs} tone="bg-[linear-gradient(180deg,#60a5fa,#4ade80)]" unit="km" />
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-ink-400">
            <span>Weekly run target</span>
            <span>
              {weeklyRunTarget > 0 ? `${runTotal.toFixed(1)}/${weeklyRunTarget} km` : `${runTotal.toFixed(1)} km`}
            </span>
          </div>
          <Meter
            value={weeklyRunTarget > 0 ? Math.min(100, (runTotal / weeklyRunTarget) * 100) : null}
            tone="info"
          />
        </div>
      </Card>

      <SectionTitle>Strength Progress</SectionTitle>
      <Card>
        <div className="space-y-2">
          {training.map((week) => (
            <div key={week.label} className="flex items-center justify-between text-[13px]">
              <span className="text-ink-300">{week.label}</span>
              <span className="tabular text-ink-200">
                {week.sessions} session{week.sessions === 1 ? '' : 's'}
                <span className="text-ink-600"> · {Math.round(week.volume).toLocaleString()} kg·reps</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

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
          Coach now lives here so exercise planning can use training, steps, recovery, and recent
          progress in one place.
        </p>
      </Card>
    </div>
  )
}
