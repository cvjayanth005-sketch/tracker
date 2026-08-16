import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { askCoach, type CoachChatMessage } from '@/ai/coachChat'
import { db } from '@/db/database'
import { startWorkout, upsertLog } from '@/db/repo'
import { buildAdaptiveSession } from '@/domain/adaptiveTraining'
import { buildCoachSummary } from '@/domain/rules'
import { buildFoodContext } from '@/domain/foodContext'
import { dayOfWeek } from '@/domain/date'
import { evaluateProgression, sessionVolume } from '@/domain/progression'
import type { DailyLog, Rating, WorkoutPrescription } from '@/domain/types'
import { useDashboard } from '@/hooks/useDashboard'
import { listenForCoachPrompt } from '@/components/coachEvents'
import { Pill } from '@/components/ui'

const DEFAULT_STARTERS = [
  'What should I focus on today?',
  'Why might my weight be stuck?',
  'How is my training recovery looking?',
]

function sanitizeMessages(messages: CoachChatMessage[]): CoachChatMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .slice(-8)
    .map((message) => ({ ...message, content: message.content.slice(0, 900) }))
}

export function CoachChatButton({
  placement = 'floating',
  starters = DEFAULT_STARTERS,
  title,
  subtitle,
  fillHeight = false,
}: {
  placement?: 'floating' | 'inline' | 'card'
  starters?: readonly string[]
  /** Card-mode heading; defaults to the training-oriented copy. */
  title?: string
  subtitle?: ReactNode
  /** Lets a card-mode coach absorb the remaining height in a dashboard column. */
  fillHeight?: boolean
}) {
  const dash = useDashboard(30)
  const navigate = useNavigate()
  const cardMode = placement === 'card'
  const [open, setOpen] = useState(cardMode)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<CoachChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Tell me what you want to improve. I can use your split, recent sets, exercise progression, running, recovery, and nutrition to shape the next workout.',
    },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return listenForCoachPrompt((prompt) => {
      setInput(prompt)
      setOpen(true)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    })
  }, [])

  const recentWorkouts = useLiveQuery(
    () => db.workouts.orderBy('date').reverse().limit(16).toArray(),
    [],
    [],
  )
  const recentSets = useLiveQuery(
    async () => {
      const workoutIds = (recentWorkouts ?? []).map((workout) => workout.id)
      if (workoutIds.length === 0) return []
      return db.workoutSets.where('workoutId').anyOf(workoutIds).toArray()
    },
    [recentWorkouts?.map((workout) => workout.id).join('|') ?? ''],
    [],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const todayWorkout = useLiveQuery(
    () => db.workouts.where('date').equals(dash.today).first(),
    [dash.today],
  )
  const todaySetCount = useLiveQuery(
    () =>
      todayWorkout
        ? db.workoutSets.where('workoutId').equals(todayWorkout.id).count()
        : Promise.resolve(0),
    [todayWorkout?.id],
    0,
  )
  const profile = useLiveQuery(() => db.profile.get('me'), [], undefined)
  const todayMeals = useLiveQuery(
    () => db.meals.where('date').equals(dash.today).toArray(),
    [dash.today],
    [],
  )

  const history = useMemo(
    () =>
      (recentWorkouts ?? []).map((workout) => ({
        workout,
        sets: (recentSets ?? []).filter((set) => set.workoutId === workout.id),
      })),
    [recentSets, recentWorkouts],
  )
  const todaySchedule = dash.phase?.schedule.find((day) => day.dow === dayOfWeek(dash.today))
  const adaptiveSession = useMemo(() => {
    if (
      !dash.phase ||
      !todaySchedule?.gym ||
      todaySchedule.sessionType === 'rest' ||
      todaySchedule.sessionType === 'run'
    ) {
      return null
    }
    return buildAdaptiveSession({
      sessionType: todaySchedule.sessionType,
      targetSleepHours: dash.phase.sleepHours,
      sleepScore: dash.todaySleepScore.score,
      log: dash.todayLog,
      exercises: exercises ?? [],
      history: history.filter((item) => item.workout.date !== dash.today),
    })
  }, [dash.phase, dash.today, dash.todayLog, dash.todaySleepScore.score, exercises, history, todaySchedule])

  const context = useMemo(() => {
    const exerciseById = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise.name]))
    const workouts = history.slice(0, 8).map(({ workout, sets }) => {
      return {
        date: workout.date,
        sessionType: workout.sessionType,
        finished: workout.finishedAt !== null,
        setCount: sets.length,
        workingSetCount: sets.filter((set) => !set.isWarmup).length,
        volumeKgReps: Math.round(sessionVolume(sets)),
        topSets: sets.slice(0, 8).map((set) => ({
          exercise: exerciseById.get(set.exerciseId) ?? 'Exercise',
          weightKg: set.weightKg,
          reps: set.reps,
          rir: set.rir,
          isWarmup: set.isWarmup,
        })),
        notes: workout.notes,
      }
    })
    const phase = dash.phase
    const activeExercises = (exercises ?? []).filter((exercise) => !exercise.archived)
    const exercisePlan = activeExercises.map((exercise) => {
      const progression = evaluateProgression(exercise, history)
      return {
        name: exercise.name,
        sessionType: exercise.sessionType,
        targetSets: exercise.targetSets,
        repRange: [exercise.repRangeMin, exercise.repRangeMax],
        targetRir: exercise.targetRir,
        loadIncrementKg: exercise.loadIncrementKg,
        progression: {
          code: progression.code,
          headline: progression.headline,
          suggestedWeightKg: progression.suggestedWeightKg,
          suggestedRepTarget: progression.suggestedRepTarget,
          lastWorkingWeightKg: progression.lastWorkingWeightKg,
          lastReps: progression.lastReps,
          lastSessionDate: progression.lastSessionDate,
        },
      }
    })
    const sleepScoreByDate = new Map(dash.sleepScores.map((night) => [night.date, night.result]))
    const recoveryDays = dash.logs.slice(-7).map((log) => ({
      date: log.date,
      sleepHours: log.sleepHours,
      sleepScore: sleepScoreByDate.get(log.date)?.score ?? null,
      sleepScoreConfidence: sleepScoreByDate.get(log.date)?.confidence ?? 'none',
      energy: log.energy,
      soreness: log.soreness,
      calories: log.calories,
      proteinG: log.proteinG,
      gymDone: log.gymDone,
      runKm: log.runKm,
    }))

    return {
      activity: phase
        ? {
            body: {
              heightCm: profile?.heightCm ?? null,
              birthYear: profile?.birthYear ?? null,
              startWeightKg: profile?.startWeightKg ?? phase.startWeightKg,
              currentTrendWeightKg:
                dash.change?.current.averageKg ?? dash.todayLog?.weightKg ?? null,
              goalWeightKg: profile?.goalWeightKg ?? phase.targetWeightKg,
            },
            today: {
              date: dash.today,
              schedule: todaySchedule ?? null,
              completedGym: dash.todayLog?.gymDone ?? null,
              loggedRunKm: dash.todayLog?.runKm ?? null,
              sleepHours: dash.todayLog?.sleepHours ?? null,
              sleepQuality: dash.todayLog?.sleepQuality ?? null,
              sleepBedtime: dash.todayLog?.sleepBedtime ?? null,
              sleepWakeTime: dash.todayLog?.sleepWakeTime ?? null,
              nightAwakenings: dash.todayLog?.nightAwakenings ?? null,
              sleepScore: dash.todaySleepScore.score,
              sleepScoreConfidence: dash.todaySleepScore.confidence,
              caffeineMg: dash.todayLog?.caffeineMg ?? null,
              alcoholUnits: dash.todayLog?.alcoholUnits ?? null,
              energy: dash.todayLog?.energy ?? null,
              soreness: dash.todayLog?.soreness ?? null,
              stress: dash.todayLog?.stress ?? null,
              trainingMinutesAvailable: dash.todayLog?.trainingMinutesAvailable ?? null,
              trainingConstraints: dash.todayLog?.trainingConstraints ?? null,
            },
            adaptiveRecommendation: adaptiveSession,
            weeklySplit: phase.schedule,
            exercisePlan,
            recentWorkouts: workouts,
            recoveryDays,
            recoveryConcern: dash.recommendation?.evidence.recoveryConcern ?? null,
            compliance: dash.compliance
              ? {
                  gym: dash.compliance.metrics.gym,
                  run: dash.compliance.metrics.run,
                  steps: dash.compliance.metrics.steps,
                  sleep: dash.compliance.metrics.sleep,
                }
              : null,
            running: {
              easyPace: dash.easyPace,
              paceProgression: dash.paceProgression,
              weeklyVolume: dash.weeklyRunVolume,
              volumeRamp: dash.volumeRamp,
              longRunProgression: dash.longRunProgression,
              derivedTargetPaces: dash.derivedTargetPaces,
            },
          }
        : null,
      dashboard:
        dash.phase && dash.recommendation && dash.review
          ? buildCoachSummary(dash.today, dash.phase, dash.recommendation, dash.review)
          : null,
      todayLog: dash.todayLog ?? null,
      weekAverages: dash.weekAverages ?? null,
      food: dash.phase
        ? buildFoodContext(dash.today, dash.phase, profile, dash.logs, todayMeals ?? [])
        : null,
      phase: dash.phase
        ? {
            name: dash.phase.name,
            calories: dash.phase.calories,
            proteinG: dash.phase.proteinG,
            steps: dash.phase.steps,
            sleepHours: dash.phase.sleepHours,
            weeklyRunKmTarget: dash.phase.weeklyRunKmTarget,
          }
        : null,
      recentLogs: dash.logs.slice(-10).map((log) => ({
        date: log.date,
        weightKg: log.weightKg,
        calories: log.calories,
        proteinG: log.proteinG,
        carbsG: log.carbsG,
        fatG: log.fatG,
        fiberG: log.fiberG,
        steps: log.steps,
        runKm: log.runKm,
        gymDone: log.gymDone,
        sleepHours: log.sleepHours,
        sleepQuality: log.sleepQuality,
        sleepBedtime: log.sleepBedtime,
        sleepWakeTime: log.sleepWakeTime,
        nightAwakenings: log.nightAwakenings,
        sleepScore: sleepScoreByDate.get(log.date)?.score ?? null,
        caffeineMg: log.caffeineMg,
        alcoholUnits: log.alcoholUnits,
        energy: log.energy,
        hunger: log.hunger,
        soreness: log.soreness,
        stress: log.stress ?? null,
        trainingMinutesAvailable: log.trainingMinutesAvailable ?? null,
        trainingConstraints: log.trainingConstraints ?? null,
        notes: log.notes,
      })),
      recentRuns: dash.runs.slice(0, 6).map((run) => ({
        date: run.date,
        type: run.type,
        distanceKm: run.distanceKm,
        durationMin: run.durationMin,
        rpe: run.rpe,
        avgHr: run.avgHr,
        notes: run.notes,
      })),
      recentWorkouts: workouts,
    }
  }, [adaptiveSession, dash, exercises, history, profile, todayMeals, todaySchedule])

  const applyAdaptiveSession = async () => {
    if (!adaptiveSession) return
    if (!todayWorkout?.finishedAt && todaySetCount === 0) {
      await startWorkout(dash.today, adaptiveSession.sessionType, adaptiveSession)
      await upsertLog(dash.today, { gymDone: true })
    }
    navigate('/workout')
  }

  useEffect(() => {
    if (messages.length === 1 && !busy) return
    const scroller = chatScrollRef.current
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const submit = async (question = input.trim()) => {
    if (!question || busy) return
    setInput('')
    setError(null)
    const nextMessages: CoachChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(nextMessages)
    setBusy(true)
    try {
      const response = await askCoach(question, context, sanitizeMessages(messages))
      setMessages([...nextMessages, { role: 'assistant', content: response.answer }])
      if (response.fallbackReason) setError(`AI fallback: ${response.fallbackReason}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const coachPanel = (
    <section
      className={
        cardMode
          ? `surface flex min-h-[26rem] flex-col radius-inset p-4 sm:p-5 ${
              fillHeight ? 'xl:flex-1' : ''
            }`
          : 'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10rem)] z-50 mx-auto flex max-h-[70dvh] max-w-lg flex-col radius-inset border border-[var(--app-line)] bg-[linear-gradient(180deg,rgba(20,24,34,0.94),rgba(6,8,16,0.88))] p-3 shadow-[0_28px_90px_-46px_rgba(0,240,255,0.9),inset_0_1px_1px_rgba(255,255,255,0.28),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150 lg:inset-x-auto lg:bottom-auto lg:right-6 lg:top-20 lg:w-[27rem]'
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--app-line)] px-1 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center radius-control bg-accent text-[10px] font-black text-ink-950">
              AI
            </span>
            <div className="text-sm font-semibold text-[var(--app-ink)]">
              {cardMode ? (title ?? 'Training Coach') : 'AI coach'}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-[var(--app-muted)]">
            {subtitle ?? (
              <>
                {dash.phase?.name ?? 'Current plan'} · {recentWorkouts?.length ?? 0} sessions ·{' '}
                {(exercises ?? []).filter((exercise) => !exercise.archived).length} exercises
              </>
            )}
          </div>
        </div>
        {!cardMode ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--app-inset)] text-lg text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]"
            aria-label="Close AI coach chat"
            title="Close"
          >
            x
          </button>
        ) : (
          <span className="rounded-full bg-info/10 px-2.5 py-1 text-[10px] font-semibold text-info ring-1 ring-inset ring-info/20">
            Live context
          </span>
        )}
      </div>

      {cardMode ? (
        <AdaptiveReadinessPanel
          log={dash.todayLog}
          prescription={adaptiveSession}
          targetSleepHours={dash.phase?.sleepHours ?? null}
          scheduled={Boolean(todaySchedule?.gym)}
          workoutFinished={Boolean(todayWorkout?.finishedAt)}
          workoutStarted={todaySetCount > 0}
          onSave={(patch) => void upsertLog(dash.today, patch)}
          onApply={() => void applyAdaptiveSession()}
        />
      ) : null}

      <div
        ref={chatScrollRef}
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3 ${
          cardMode ? (fillHeight ? 'max-h-36 xl:max-h-none' : 'max-h-36') : ''
        }`}
        role="log"
        aria-live="polite"
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[88%] radius-control px-3 py-2 text-[13px] leading-relaxed shadow-[0_10px_28px_-20px_rgba(0,0,0,0.8)] ${
              cardMode ? 'lg:max-w-3xl ' : ''
            }${
              message.role === 'user'
                ? 'ml-auto bg-accent text-ink-950'
                : 'bg-[var(--app-inset)] text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]'
            }`}
          >
            {message.content}
          </div>
        ))}
        {busy ? (
          <div className="max-w-[70%] radius-control bg-[var(--app-inset)] px-3 py-2 text-[13px] text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)]">
            Reading your training history...
          </div>
        ) : null}
        {error ? (
          <div className="radius-control bg-alert/12 px-3 py-2 text-[12px] text-alert ring-1 ring-inset ring-alert/25">
            {error}
          </div>
        ) : null}
      </div>

      {messages.length === 1 || cardMode ? (
        <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => void submit(starter)}
              disabled={busy}
              className="shrink-0 rounded-full bg-[var(--app-inset)] px-3 py-1.5 text-[11px] font-medium text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)] active:bg-[var(--app-inset)] disabled:opacity-40"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex gap-2 border-t border-[var(--app-line)] pt-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={cardMode ? 2 : 1}
          placeholder="Ask about your next workout, recovery, sets, or progression..."
          className="min-h-11 flex-1 resize-none radius-control bg-[var(--app-inset)] px-3 py-3 text-sm text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="min-h-11 self-end radius-control bg-accent px-4 text-sm font-semibold text-ink-950 transition-transform active:scale-[0.97] disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  )

  if (cardMode) return coachPanel

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          placement === 'floating'
            ? 'fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-sm font-black text-ink-950 shadow-[0_22px_48px_-22px_rgba(57,255,20,0.9)] ring-1 ring-inset ring-[var(--app-line)] transition-transform active:scale-95 lg:bottom-auto lg:right-6 lg:top-5 lg:h-12 lg:w-auto lg:gap-2 lg:radius-control lg:px-4 lg:text-[13px]'
            : 'flex min-h-11 items-center justify-center gap-2 radius-control bg-accent px-4 text-[13px] font-black text-ink-950 shadow-[0_18px_40px_-24px_rgba(57,255,20,0.9)] ring-1 ring-inset ring-[var(--app-line)] transition-transform active:scale-95'
        }
        aria-label="Open AI coach chat"
        title="AI coach chat"
      >
        <span>AI</span>
        <span className={placement === 'floating' ? 'hidden font-semibold lg:inline' : 'font-semibold'}>
          Coach
        </span>
      </button>
      {open ? coachPanel : null}
    </>
  )
}

const READINESS_VALUES = [1, 2, 3, 4, 5] as const
const TIME_OPTIONS = [30, 45, 60, 90] as const

function CompactRating({
  label,
  value,
  onChange,
}: {
  label: string
  value: Rating | null
  onChange: (value: Rating | null) => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase text-[var(--app-muted)]">
        <span>{label}</span>
        <span className="tabular text-[var(--app-muted)]">{value ?? '—'}/5</span>
      </div>
      <div className="grid grid-cols-5 gap-1" role="group" aria-label={label}>
        {READINESS_VALUES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(value === option ? null : option)}
            className={`tabular h-8 radius-control text-[11px] font-semibold transition-colors ${
              value === option
                ? 'bg-info text-ink-950'
                : 'bg-[var(--app-inset)] text-[var(--app-muted)] ring-1 ring-inset ring-[var(--app-line)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConstraintField({
  value,
  onCommit,
}: {
  value: string | null
  onCommit: (value: string | null) => void
}) {
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase text-[var(--app-muted)]">
        Training constraint
      </span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(text.trim() || null)}
        placeholder="None, or note discomfort / equipment limits"
        className="h-9 w-full radius-control bg-[var(--app-inset)] px-3 text-[12px] text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-info/50"
      />
    </label>
  )
}

function CompactSleepField({
  value,
  target,
  onCommit,
}: {
  value: number | null
  target: number | null
  onCommit: (value: number | null) => void
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase text-[var(--app-muted)]">
        <span>Sleep</span>
        <span className="normal-case text-[var(--app-muted)]">target {target ?? '—'}h</span>
      </span>
      <span className="flex h-8 items-center radius-control bg-[var(--app-inset)] px-2.5 ring-1 ring-inset ring-[var(--app-line)] focus-within:ring-info/50">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="16"
          step="0.1"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const parsed = Number(text)
            onCommit(
              text.trim() === '' || !Number.isFinite(parsed)
                ? null
                : Math.max(0, Math.min(16, parsed)),
            )
          }}
          placeholder="—"
          className="tabular min-w-0 flex-1 bg-transparent text-center text-[12px] font-semibold text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)]"
        />
        <span className="text-[10px] text-[var(--app-muted)]">h</span>
      </span>
    </label>
  )
}

function AdaptiveReadinessPanel({
  log,
  prescription,
  targetSleepHours,
  scheduled,
  workoutFinished,
  workoutStarted,
  onSave,
  onApply,
}: {
  log: DailyLog | undefined
  prescription: WorkoutPrescription | null
  targetSleepHours: number | null
  scheduled: boolean
  workoutFinished: boolean
  workoutStarted: boolean
  onSave: (patch: Partial<DailyLog>) => void
  onApply: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const tone =
    prescription?.readinessBand === 'ready'
      ? 'good'
      : prescription?.readinessBand === 'reduce'
        ? 'warn'
        : prescription?.readinessBand === 'steady'
          ? 'info'
          : 'neutral'

  return (
    <div className="border-b border-[var(--app-line)] py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase text-[var(--app-muted)]">Readiness</div>
          <div className="mt-1 text-base font-semibold text-[var(--app-ink)]">
            {prescription?.headline ?? (scheduled ? 'Complete today\'s check-in' : 'Recovery day')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={tone}>
            {prescription?.readinessScore == null ? 'score pending' : `${prescription.readinessScore}/100`}
          </Pill>
          <span className="text-[10px] uppercase text-[var(--app-muted)]">
            {prescription?.confidence ?? 'low'} confidence
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="coach-readiness-details"
            className="radius-control bg-[var(--app-inset)] px-2.5 py-1 text-[10px] font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)]"
          >
            {expanded ? 'Done' : 'Update'}
          </button>
        </div>
      </div>

      {prescription ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 radius-control bg-[var(--app-inset)] px-3 py-2.5 ring-1 ring-inset ring-[var(--app-line)]">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase text-[var(--app-muted)]">
              Adaptive session · {prescription.exercises.length} exercises
            </div>
            <div className="mt-1 truncate text-[11px] text-[var(--app-ink-soft)]">
              {prescription.adjustments[0] ?? 'Current plan and progression retained'}
            </div>
          </div>
          <button
            type="button"
            onClick={onApply}
            className="min-h-9 shrink-0 radius-control bg-accent px-3 text-[11px] font-semibold text-ink-950 transition-transform active:scale-[0.97]"
          >
            {workoutFinished
              ? 'Open completed workout'
              : workoutStarted
                ? 'Open active workout'
                : 'Apply session'}
          </button>
        </div>
      ) : null}

      {expanded ? (
        <div id="coach-readiness-details" className="mt-4 border-t border-[var(--app-line)] pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CompactSleepField
              value={log?.sleepHours ?? null}
              target={targetSleepHours}
              onCommit={(sleepHours) => onSave({ sleepHours })}
            />
            <CompactRating
              label="Energy"
              value={log?.energy ?? null}
              onChange={(energy) => onSave({ energy })}
            />
            <CompactRating
              label="Soreness"
              value={log?.soreness ?? null}
              onChange={(soreness) => onSave({ soreness })}
            />
            <CompactRating
              label="Stress"
              value={log?.stress ?? null}
              onChange={(stress) => onSave({ stress })}
            />
          </div>

          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase text-[var(--app-muted)]">Time</div>
              <div className="flex gap-1" role="group" aria-label="Minutes available">
                {TIME_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() =>
                      onSave({
                        trainingMinutesAvailable:
                          log?.trainingMinutesAvailable === minutes ? null : minutes,
                      })
                    }
                    className={`h-9 radius-control px-2.5 text-[11px] font-semibold transition-colors ${
                      log?.trainingMinutesAvailable === minutes
                        ? 'bg-accent text-ink-950'
                        : 'bg-[var(--app-inset)] text-[var(--app-muted)] ring-1 ring-inset ring-[var(--app-line)]'
                    }`}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
            </div>
            <ConstraintField
              value={log?.trainingConstraints ?? null}
              onCommit={(trainingConstraints) => onSave({ trainingConstraints })}
            />
          </div>

          {prescription ? (
            <div className="mt-4 border-t border-[var(--app-line)] pt-3">
              <div className="text-[10px] font-semibold uppercase text-[var(--app-muted)]">Session detail</div>
              <div className="mt-3 divide-y divide-[var(--app-line)] border-y border-[var(--app-line)]">
                {prescription.exercises.slice(0, 4).map((exercise) => (
                  <div
                    key={exercise.exerciseId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[var(--app-ink)]">{exercise.exerciseName}</div>
                      <div className="truncate text-[var(--app-muted)]">{exercise.reason}</div>
                    </div>
                    <div className="tabular text-right text-[var(--app-ink-soft)]">
                      {exercise.targetSets} × {exercise.repRangeMin}-{exercise.repRangeMax}
                      <span className="ml-2 text-[var(--app-muted)]">RIR {exercise.targetRir}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
