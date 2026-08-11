import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { askCoach, type CoachChatMessage } from '@/ai/coachChat'
import { db } from '@/db/database'
import { buildCoachSummary } from '@/domain/rules'
import { useDashboard } from '@/hooks/useDashboard'

const STARTERS = [
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

export function CoachChatButton() {
  const dash = useDashboard(30)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<CoachChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Ask me about your food, workout, running, recovery, or weight trend. I will use your tracker data, not rewrite your plan.',
    },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const recentWorkouts = useLiveQuery(
    () => db.workouts.orderBy('date').reverse().limit(5).toArray(),
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

  const context = useMemo(() => {
    const exerciseById = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise.name]))
    const workouts = (recentWorkouts ?? []).map((workout) => {
      const sets = (recentSets ?? []).filter((set) => set.workoutId === workout.id)
      return {
        date: workout.date,
        sessionType: workout.sessionType,
        setCount: sets.length,
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

    return {
      dashboard:
        dash.phase && dash.recommendation && dash.review
          ? buildCoachSummary(dash.today, dash.phase, dash.recommendation, dash.review)
          : null,
      todayLog: dash.todayLog ?? null,
      weekAverages: dash.weekAverages ?? null,
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
  }, [dash, exercises, recentSets, recentWorkouts])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-sm font-black text-ink-950 shadow-[0_22px_48px_-22px_rgba(57,255,20,0.9)] ring-1 ring-inset ring-white/45 transition-transform active:scale-95 lg:bottom-6 lg:right-6"
        aria-label="Open AI coach chat"
        title="AI coach chat"
      >
        AI
      </button>

      {open ? (
        <section className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10rem)] z-40 mx-auto flex max-h-[70dvh] max-w-lg flex-col rounded-3xl border border-white/18 bg-[linear-gradient(180deg,rgba(20,24,34,0.94),rgba(6,8,16,0.88))] p-3 shadow-[0_28px_90px_-46px_rgba(0,240,255,0.9),inset_0_1px_1px_rgba(255,255,255,0.28),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150 lg:inset-x-auto lg:bottom-24 lg:right-6 lg:w-[27rem]">
          <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-white/[0.03] px-2 pb-3">
            <div>
              <div className="text-sm font-semibold text-ink-50">AI coach</div>
              <div className="text-[11px] text-ink-400">Insights from your tracker data</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-lg text-ink-200 ring-1 ring-inset ring-white/10"
              aria-label="Close AI coach chat"
              title="Close"
            >
              x
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-[0_10px_28px_-20px_rgba(0,0,0,0.8)] ${
                  message.role === 'user'
                    ? 'ml-auto bg-accent text-ink-950'
                    : 'bg-white/12 text-ink-100 ring-1 ring-inset ring-white/12'
                }`}
              >
                {message.content}
              </div>
            ))}
            {busy ? (
              <div className="max-w-[70%] rounded-2xl bg-white/12 px-3 py-2 text-[13px] text-ink-300 ring-1 ring-inset ring-white/12">
                Reading your logs...
              </div>
            ) : null}
            {error ? (
              <div className="rounded-2xl bg-alert/12 px-3 py-2 text-[12px] text-alert ring-1 ring-inset ring-alert/25">
                {error}
              </div>
            ) : null}
          </div>

          {messages.length === 1 ? (
            <div className="mb-2 flex gap-2 overflow-x-auto px-1">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void submit(starter)}
                  className="shrink-0 rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium text-ink-100 ring-1 ring-inset ring-white/14"
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
              rows={1}
              placeholder="Ask about food, workout, weight, recovery..."
              className="min-h-11 flex-1 resize-none rounded-2xl bg-black/45 px-3 py-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/14 placeholder:text-ink-500 focus:ring-accent/60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="min-h-11 rounded-2xl bg-accent px-4 text-sm font-semibold text-ink-950 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </section>
      ) : null}
    </>
  )
}
