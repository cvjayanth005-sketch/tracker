import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { askCoach, type CoachChatMessage } from '@/ai/coachChat'
import { db } from '@/db/database'
import { buildCoachSummary } from '@/domain/rules'
import { buildFoodContext } from '@/domain/foodContext'
import { dayOfWeek } from '@/domain/date'
import { evaluateProgression, sessionVolume } from '@/domain/progression'
import { useDashboard } from '@/hooks/useDashboard'
import { listenForCoachPrompt } from '@/components/coachEvents'

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
}: {
  placement?: 'floating' | 'inline' | 'card'
  starters?: readonly string[]
  /** Card-mode heading; defaults to the training-oriented copy. */
  title?: string
  subtitle?: ReactNode
}) {
  const dash = useDashboard(30)
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
  const profile = useLiveQuery(() => db.profile.get('me'), [], undefined)
  const todayMeals = useLiveQuery(
    () => db.meals.where('date').equals(dash.today).toArray(),
    [dash.today],
    [],
  )

  const context = useMemo(() => {
    const exerciseById = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise.name]))
    const history = (recentWorkouts ?? []).map((workout) => ({
      workout,
      sets: (recentSets ?? []).filter((set) => set.workoutId === workout.id),
    }))
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
    const todaySchedule = phase?.schedule.find((day) => day.dow === dayOfWeek(dash.today))
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
    const recoveryDays = dash.logs.slice(-7).map((log) => ({
      date: log.date,
      sleepHours: log.sleepHours,
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
              energy: dash.todayLog?.energy ?? null,
              soreness: dash.todayLog?.soreness ?? null,
            },
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
        energy: log.energy,
        hunger: log.hunger,
        soreness: log.soreness,
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
  }, [dash, exercises, recentSets, recentWorkouts, profile, todayMeals])

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
          ? 'surface flex min-h-[28rem] flex-col rounded-3xl p-4 sm:p-5'
          : 'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10rem)] z-50 mx-auto flex max-h-[70dvh] max-w-lg flex-col rounded-3xl border border-white/18 bg-[linear-gradient(180deg,rgba(20,24,34,0.94),rgba(6,8,16,0.88))] p-3 shadow-[0_28px_90px_-46px_rgba(0,240,255,0.9),inset_0_1px_1px_rgba(255,255,255,0.28),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150 lg:inset-x-auto lg:bottom-auto lg:right-6 lg:top-20 lg:w-[27rem]'
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/12 px-1 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[10px] font-black text-ink-950">
              AI
            </span>
            <div className="text-sm font-semibold text-ink-50">
              {cardMode ? (title ?? 'Training Coach') : 'AI coach'}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-ink-400">
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
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-lg text-ink-200 ring-1 ring-inset ring-white/10"
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

      <div
        ref={chatScrollRef}
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3 ${
          cardMode ? 'max-h-72' : ''
        }`}
        role="log"
        aria-live="polite"
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-[0_10px_28px_-20px_rgba(0,0,0,0.8)] ${
              cardMode ? 'lg:max-w-3xl ' : ''
            }${
              message.role === 'user'
                ? 'ml-auto bg-accent text-ink-950'
                : 'bg-white/10 text-ink-100 ring-1 ring-inset ring-white/10'
            }`}
          >
            {message.content}
          </div>
        ))}
        {busy ? (
          <div className="max-w-[70%] rounded-2xl bg-white/10 px-3 py-2 text-[13px] text-ink-300 ring-1 ring-inset ring-white/10">
            Reading your training history...
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl bg-alert/12 px-3 py-2 text-[12px] text-alert ring-1 ring-inset ring-alert/25">
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
              className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-ink-100 ring-1 ring-inset ring-white/12 transition-colors hover:bg-white/15 active:bg-white/20 disabled:opacity-40"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex gap-2 border-t border-white/12 pt-3"
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
          className="min-h-11 flex-1 resize-none rounded-2xl bg-black/45 px-3 py-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/14 placeholder:text-ink-500 focus:ring-accent/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="min-h-11 self-end rounded-2xl bg-accent px-4 text-sm font-semibold text-ink-950 transition-transform active:scale-[0.97] disabled:opacity-40"
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
            ? 'fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-sm font-black text-ink-950 shadow-[0_22px_48px_-22px_rgba(57,255,20,0.9)] ring-1 ring-inset ring-white/45 transition-transform active:scale-95 lg:bottom-auto lg:right-6 lg:top-5 lg:h-12 lg:w-auto lg:gap-2 lg:rounded-2xl lg:px-4 lg:text-[13px]'
            : 'flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-[13px] font-black text-ink-950 shadow-[0_18px_40px_-24px_rgba(57,255,20,0.9)] ring-1 ring-inset ring-white/45 transition-transform active:scale-95'
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
