import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { activeTabPath } from '@/App'
import { askCoach, type CoachChatMessage } from '@/ai/coachChat'
import { db } from '@/db/database'
import { buildCoachSummary } from '@/domain/rules'
import { buildFoodContext } from '@/domain/foodContext'
import { evaluateProgression, sessionVolume } from '@/domain/progression'
import { useAdaptiveSession } from '@/hooks/useAdaptiveSession'
import { listenForCoachPrompt } from '@/components/coachEvents'

/**
 * One Formara Coach, living in the app shell rather than one per tab.
 *
 * The context it can see was already nearly this broad before — training
 * history, food, sleep, phase, adherence all landed in the same object
 * regardless of which screen rendered the chat. What was actually scattered
 * was the UI: a separate box on Food, a separate box on Activity, neither
 * aware the other existed or that a conversation had already started. This
 * consolidates that into one instance, mounted once, whose conversation
 * survives switching tabs. The active screen changes what it leads with —
 * the starter questions, the greeting, and the "Using:" line — not what it
 * is allowed to know.
 */

interface SectionProfile {
  key: 'today' | 'food' | 'activity' | 'plan' | 'other'
  greeting: string
  usingLabel: string
  starters: readonly string[]
}

const SECTIONS: Record<SectionProfile['key'], SectionProfile> = {
  today: {
    key: 'today',
    greeting: 'Ask me what matters most today — I can see your targets, sleep, and planned training.',
    usingLabel: "Using: Today · targets, sleep, planned training",
    starters: ['What should I focus on today?', 'How is my recovery looking?', 'Am I on track this week?'],
  },
  food: {
    key: 'food',
    greeting: 'Ask me about today\'s meals or macros — I can see what you\'ve logged and what\'s left.',
    usingLabel: "Using: Food · today's meals, remaining protein",
    starters: [
      'What can I eat for dinner?',
      'Is my protein intake good today?',
      'Suggest a high-protein snack under 250 kcal.',
    ],
  },
  activity: {
    key: 'activity',
    greeting: 'Ask about training — I can see your split, recovery, recent sessions, and progression.',
    usingLabel: 'Using: Activity · split, recovery, recent sessions',
    starters: [
      'Should I train legs tomorrow?',
      'Should I increase any lifts?',
      'Check my recovery before training',
    ],
  },
  plan: {
    key: 'plan',
    greeting: 'Ask why the plan is set the way it is — I can see your goals, trend weight, and adherence.',
    usingLabel: 'Using: Plan · phases, adherence, goals',
    starters: ['Why are my calories set here?', 'Why might my weight be stuck?', 'Is my plan still realistic?'],
  },
  other: {
    key: 'other',
    greeting: 'Ask me anything — I can see your training, food, sleep, and plan.',
    usingLabel: 'Using: your full profile',
    starters: ['What should I focus on today?', 'Why might my weight be stuck?'],
  },
}

function sectionForPath(pathname: string): SectionProfile {
  const resolved = activeTabPath(pathname)
  if (resolved === '/') return SECTIONS.today
  if (resolved === '/food') return SECTIONS.food
  if (resolved === '/activity') return SECTIONS.activity
  if (resolved === '/plan') return SECTIONS.plan
  return SECTIONS.other
}

function sanitizeMessages(messages: CoachChatMessage[]): CoachChatMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .slice(-8)
    .map((message) => ({ ...message, content: message.content.slice(0, 900) }))
}

export function Coach({ collapsed }: { collapsed: boolean }) {
  const location = useLocation()
  const section = useMemo(() => sectionForPath(location.pathname), [location.pathname])
  const adaptive = useAdaptiveSession()
  const dash = adaptive.dash

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  /*
   * The messages sent upstream are the plain `role`/`content` pairs. Every
   * assistant reply also carries the section that was active WHEN THE USER
   * ASKED it — so a reply pulled during Food shows "Food · today's meals",
   * even if the user has since switched tabs. Without this the label would
   * misrepresent old answers.
   */
  type DisplayMessage = CoachChatMessage & { using?: string }
  const [messages, setMessages] = useState<DisplayMessage[]>([])
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

  const profile = useLiveQuery(() => db.profile.get('me'), [], undefined)
  const todayMeals = useLiveQuery(() => db.meals.where('date').equals(dash.today).toArray(), [dash.today], [])

  const context = useMemo(() => {
    const exerciseById = new Map(adaptive.exercises.map((exercise) => [exercise.id, exercise.name]))
    const workouts = adaptive.history.slice(0, 8).map(({ workout, sets }) => ({
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
    }))
    const phase = dash.phase
    const activeExercises = adaptive.exercises.filter((exercise) => !exercise.archived)
    const exercisePlan = activeExercises.map((exercise) => {
      const progression = evaluateProgression(exercise, adaptive.history)
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
      activeSection: section.key,
      activity: phase
        ? {
            body: {
              heightCm: profile?.heightCm ?? null,
              birthYear: profile?.birthYear ?? null,
              startWeightKg: profile?.startWeightKg ?? phase.startWeightKg,
              currentTrendWeightKg: dash.change?.current.averageKg ?? dash.todayLog?.weightKg ?? null,
              goalWeightKg: profile?.goalWeightKg ?? phase.targetWeightKg,
            },
            today: {
              date: dash.today,
              schedule: adaptive.todaySchedule ?? null,
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
            adaptiveRecommendation: adaptive.adaptiveSession,
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
      food: dash.phase ? buildFoodContext(dash.today, dash.phase, profile, dash.logs, todayMeals ?? []) : null,
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
  }, [adaptive, dash, profile, section.key, todayMeals])

  useEffect(() => {
    if (messages.length === 0 && !busy) return
    const scroller = chatScrollRef.current
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const submit = async (question = input.trim()) => {
    if (!question || busy) return
    setInput('')
    setError(null)
    const usingLabel = section.usingLabel
    const nextMessages: DisplayMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(nextMessages)
    setBusy(true)
    try {
      const response = await askCoach(
        question,
        context,
        sanitizeMessages(messages.map(({ role, content }) => ({ role, content }))),
      )
      setMessages([...nextMessages, { role: 'assistant', content: response.answer, using: usingLabel }])
      if (response.fallbackReason) setError(`AI fallback: ${response.fallbackReason}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  if (location.pathname === '/account') return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`coach-bar coach-bar--mobile motion-press ${collapsed ? 'is-chrome-collapsed' : ''}`}
        aria-haspopup="dialog"
      >
        <span className="coach-bar-icon" aria-hidden="true">
          AI
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Ask Formara anything</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="coach-bar coach-bar--desktop motion-press"
        aria-haspopup="dialog"
      >
        <span className="coach-bar-icon" aria-hidden="true">
          AI
        </span>
        <span>Ask Formara</span>
      </button>

      {open ? (
        <div className="coach-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="coach-panel radius-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Formara Coach"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--app-line)] px-1 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center radius-control bg-accent type-caption font-black text-ink-950">
                    AI
                  </span>
                  <div className="type-caption font-semibold text-[var(--app-ink)]">Formara Coach</div>
                </div>
                <div className="mt-2 type-caption text-[var(--app-muted)]">{section.usingLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center radius-control bg-[var(--app-inset)] type-lead text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]"
                aria-label="Close Formara Coach"
              >
                ×
              </button>
            </div>

            <div
              ref={chatScrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3"
              role="log"
              aria-live="polite"
            >
              <div className="max-w-[88%] radius-control bg-[var(--app-inset)] px-3 py-2 type-caption leading-relaxed text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]">
                {section.greeting}
              </div>
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex flex-col items-end' : ''}>
                  <div
                    className={`max-w-[88%] radius-control px-3 py-2 type-caption leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-accent text-ink-950'
                        : 'bg-[var(--app-inset)] text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]'
                    }`}
                  >
                    {message.content}
                  </div>
                  {/*
                    Under each assistant reply, name what it read. The trust
                    rule matters most on the ANSWER — the header label only
                    says what the coach *would* look at next; this says what
                    the specific reply was drawn from.
                  */}
                  {message.role === 'assistant' && message.using ? (
                    <div className="mt-1 type-micro text-[var(--app-muted)]">{message.using}</div>
                  ) : null}
                </div>
              ))}
              {busy ? (
                <div className="max-w-[70%] radius-control bg-[var(--app-inset)] px-3 py-2 type-caption text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)]">
                  Reading your context...
                </div>
              ) : null}
              {error ? (
                <div className="radius-control bg-alert/12 px-3 py-2 type-caption text-alert ring-1 ring-inset ring-alert/25">
                  {error}
                </div>
              ) : null}
            </div>

            {messages.length === 0 ? (
              <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
                {section.starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void submit(starter)}
                    disabled={busy}
                    className="shrink-0 radius-pill bg-[var(--app-inset)] px-3 py-1.5 type-caption font-medium text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] disabled:opacity-40"
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
                rows={1}
                placeholder="Ask about today, food, training, or your plan..."
                className="min-h-11 flex-1 resize-none radius-control bg-[var(--app-inset)] px-3 py-3 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="app-button app-button-primary motion-press shrink-0 self-end disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
