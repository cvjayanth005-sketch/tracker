import { useMemo, useState } from 'react'
import { authHeader, AUTH_API_BASE, signOut } from '@/auth/session'
import { asLocalDate } from '@/domain/date'
import { applyOnboardingPlan, type OnboardingPlanDraft } from '@/db/repo'
import { sync } from '@/sync/client'

type FieldType = 'text' | 'number' | 'choice'

interface Question {
  key: string
  label: string
  helper: string
  type: FieldType
  optional?: boolean
  choices?: string[]
}

const QUESTIONS: Question[] = [
  { key: 'name', label: 'What should I call you?', helper: 'Your dashboard will use this name.', type: 'text' },
  { key: 'age', label: 'How old are you?', helper: 'Used only to make the initial calorie estimate less generic.', type: 'number' },
  { key: 'sex', label: 'Which sex should the calorie estimate use?', helper: 'This affects BMR math. Choose what best fits your physiology.', type: 'choice', choices: ['Male', 'Female', 'Prefer not to say'] },
  { key: 'heightCm', label: 'What is your height in cm?', helper: 'Example: 178', type: 'number' },
  { key: 'currentWeightKg', label: 'What is your current weight in kg?', helper: 'Use today’s best estimate.', type: 'number' },
  { key: 'goalWeightKg', label: 'What is your goal weight in kg?', helper: 'This can be edited later.', type: 'number' },
  { key: 'activityLevel', label: 'How active is your normal day?', helper: 'Think job, walking, chores, and commute.', type: 'choice', choices: ['Sedentary', 'Moderate', 'Active'] },
  { key: 'lifestyle', label: 'What does your work/life routine look like?', helper: 'Desk job, college, shift work, travel, long commute, etc.', type: 'text', optional: true },
  { key: 'gymDaysPerWeek', label: 'How many days per week can you train?', helper: 'Pick the realistic number, not the heroic one.', type: 'number' },
  { key: 'trainingExperience', label: 'What is your training experience?', helper: 'Beginner, returning, intermediate, advanced, or anything specific.', type: 'text', optional: true },
  { key: 'cardioPreference', label: 'What cardio do you actually tolerate?', helper: 'Walking, running, cycling, sports, none, etc.', type: 'text', optional: true },
  { key: 'injuries', label: 'Any injuries or medical limits?', helper: 'Say none, or mention anything the plan should respect.', type: 'text', optional: true },
  { key: 'dietConstraints', label: 'Any food preferences or constraints?', helper: 'Vegetarian, budget, meal timing, foods you hate, etc.', type: 'text', optional: true },
  { key: 'sleepStress', label: 'How are sleep and stress lately?', helper: 'This keeps the plan from being too aggressive.', type: 'text', optional: true },
  { key: 'desiredPace', label: 'How fast do you want the cut to feel?', helper: 'Steady is easier to sustain; aggressive needs more caution.', type: 'choice', choices: ['Steady', 'Moderate', 'Aggressive'] },
]

type Answers = Record<string, string>

interface DraftResponse extends OnboardingPlanDraft {
  provider?: 'groq' | 'rules'
  model?: string | null
  profileSummary: string
  cautions: string[]
  missingInfo: string[]
  sourceUsed: boolean
  fallback?: boolean
}

function coerceDraft(raw: DraftResponse): OnboardingPlanDraft {
  return {
    profile: {
      name: raw.profile.name,
      birthYear: raw.profile.birthYear === null ? null : Number(raw.profile.birthYear),
      heightCm: raw.profile.heightCm === null ? null : Number(raw.profile.heightCm),
      startWeightKg: Number(raw.profile.startWeightKg),
      goalWeightKg: Number(raw.profile.goalWeightKg),
    },
    planStartDate: asLocalDate(raw.planStartDate),
    targets: {
      calories: Number(raw.targets.calories),
      proteinG: Number(raw.targets.proteinG),
      steps: Number(raw.targets.steps),
      sleepHours: Number(raw.targets.sleepHours),
      gymDaysPerWeek: Number(raw.targets.gymDaysPerWeek),
      weeklyRunKmTarget:
        raw.targets.weeklyRunKmTarget === null ? null : Number(raw.targets.weeklyRunKmTarget),
    },
    phases: raw.phases.map((phase) => ({
      name: String(phase.name),
      startWeightKg: Number(phase.startWeightKg),
      targetWeightKg: Number(phase.targetWeightKg),
      calories: Number(phase.calories),
      proteinG: Number(phase.proteinG),
      steps: Number(phase.steps),
      weeklyRunKmTarget:
        phase.weeklyRunKmTarget === null ? null : Number(phase.weeklyRunKmTarget),
      notes: phase.notes ?? null,
    })),
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] ?? '' : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function NumberInput({
  value,
  onChange,
  min,
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
}) {
  return (
    <input
      type="number"
      min={min}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      className="mt-2 h-11 w-full rounded-xl bg-white/8 px-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10 focus:ring-accent/50"
    />
  )
}

export function Onboarding() {
  const [answers, setAnswers] = useState<Answers>({})
  const [step, setStep] = useState(0)
  const [pastedText, setPastedText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<DraftResponse | null>(null)
  const [editable, setEditable] = useState<OnboardingPlanDraft | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const question = QUESTIONS[step]
  const answered = useMemo(
    () => QUESTIONS.filter((item) => (answers[item.key] ?? '').trim()).length,
    [answers],
  )

  const setAnswer = (key: string, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }))
  }

  const canAdvance = !question || question.optional || (answers[question.key] ?? '').trim() !== ''

  const patchTargets = (
    patch: Partial<OnboardingPlanDraft['targets']>,
    phasePatch: Partial<Pick<OnboardingPlanDraft['phases'][number], 'calories' | 'proteinG' | 'steps'>> = {},
  ) => {
    if (!editable) return
    setEditable({
      ...editable,
      targets: { ...editable.targets, ...patch },
      phases: editable.phases.map((phase) => ({ ...phase, ...phasePatch })),
    })
  }

  const makeDraft = async () => {
    setBusy(true)
    setStatus('Analyzing your answers...')
    try {
      const payload: Record<string, unknown> = { answers, pasted_text: pastedText || null }
      if (file) {
        payload.file_name = file.name
        payload.file_base64 = await fileToBase64(file)
      }
      const res = await fetch(`${AUTH_API_BASE}/api/onboarding/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeader() },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) {
        void signOut()
        throw new Error('Session expired. Sign in again.')
      }
      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(error.detail || `Plan draft failed (${res.status})`)
      }
      const next = (await res.json()) as DraftResponse
      setDraft(next)
      setEditable(coerceDraft(next))
      setStatus(next.fallback ? 'Drafted with the safe fallback plan.' : 'Draft ready.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!editable) return
    setBusy(true)
    setStatus('Saving your plan...')
    try {
      await applyOnboardingPlan(editable)
      const outcome = await sync()
      if (outcome.status === 'unauthorized') {
        void signOut()
        throw new Error('Session expired. Sign in again.')
      }
      if (outcome.status !== 'pushed' && outcome.status !== 'clean') {
        throw new Error('Plan saved on this device, but cloud sync needs a retry.')
      }
      setStatus('Plan saved. Opening dashboard...')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (editable && draft) {
    const target = editable.targets
    return (
      <div className="min-h-dvh">
        <main className="mx-auto grid min-h-dvh w-full max-w-6xl gap-5 px-5 py-6 safe-top lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-8">
          <section className="surface rounded-3xl p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Review the plan
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-ink-50">Use this as your starting point?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-300">{draft.profileSummary}</p>

            {draft.cautions.length ? (
              <div className="mt-4 rounded-2xl bg-warn/10 p-3 text-[12px] leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
                {draft.cautions.join(' ')}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-[12px] font-medium text-ink-300">
                Plan start date
                <input
                  type="date"
                  value={editable.planStartDate}
                  onChange={(event) =>
                    setEditable({ ...editable, planStartDate: asLocalDate(event.target.value) })
                  }
                  className="mt-2 h-11 w-full rounded-xl bg-white/8 px-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Goal weight
                <NumberInput
                  value={editable.profile.goalWeightKg}
                  onChange={(goalWeightKg) =>
                    goalWeightKg !== null &&
                    setEditable({
                      ...editable,
                      profile: { ...editable.profile, goalWeightKg },
                    })
                  }
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Calories
                <NumberInput
                  value={target.calories}
                  onChange={(calories) =>
                    calories !== null &&
                    patchTargets({ calories }, { calories })
                  }
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Protein
                <NumberInput
                  value={target.proteinG}
                  onChange={(proteinG) =>
                    proteinG !== null &&
                    patchTargets({ proteinG }, { proteinG })
                  }
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Steps
                <NumberInput
                  value={target.steps}
                  onChange={(steps) =>
                    steps !== null && patchTargets({ steps }, { steps })
                  }
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Gym days per week
                <NumberInput
                  value={target.gymDaysPerWeek}
                  min={0}
                  onChange={(gymDaysPerWeek) =>
                    gymDaysPerWeek !== null &&
                    patchTargets({ gymDaysPerWeek })
                  }
                />
              </label>
            </div>
          </section>

          <aside className="surface rounded-3xl p-5">
            <div className="text-sm font-semibold text-ink-50">Milestones</div>
            <div className="mt-3 space-y-2">
              {editable.phases.map((phase, index) => (
                <div key={`${phase.name}-${index}`} className="rounded-2xl bg-white/6 p-3">
                  <div className="text-sm font-semibold text-ink-50">{phase.name}</div>
                  <div className="mt-1 text-[12px] text-ink-400">
                    {phase.startWeightKg} to {phase.targetWeightKg} kg · {phase.calories} kcal · {phase.steps.toLocaleString()} steps
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy}
              className="mt-5 h-12 w-full rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 shadow-[0_14px_34px_-18px] shadow-accent disabled:opacity-50"
            >
              Use this plan
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setEditable(null)
                setStatus(null)
              }}
              className="mt-2 h-11 w-full rounded-2xl bg-white/8 px-4 text-sm font-semibold text-ink-100 ring-1 ring-inset ring-white/10"
            >
              Edit answers
            </button>
            {status ? <div className="mt-3 text-[12px] text-ink-300">{status}</div> : null}
          </aside>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 safe-top lg:px-8">
        <section className="grid flex-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="surface rounded-3xl p-5 sm:p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              AI onboarding
            </div>
            <h1 className="mt-2 text-4xl font-semibold leading-tight text-ink-50">
              Let’s build your starting plan.
            </h1>
            <div className="mt-6 rounded-3xl bg-white/6 p-4 ring-1 ring-inset ring-white/10">
              <div className="text-sm font-semibold text-ink-50">{question?.label}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-400">{question?.helper}</p>
              {question?.type === 'choice' ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {question.choices?.map((choice) => (
                    <button
                      type="button"
                      key={choice}
                      onClick={() => setAnswer(question.key, choice)}
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold ring-1 ring-inset ${
                        answers[question.key] === choice
                          ? 'bg-accent text-ink-950 ring-accent'
                          : 'bg-white/7 text-ink-100 ring-white/10'
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type={question?.type === 'number' ? 'number' : 'text'}
                  value={answers[question?.key ?? ''] ?? ''}
                  onChange={(event) => question && setAnswer(question.key, event.target.value)}
                  className="mt-4 h-12 w-full rounded-2xl bg-white/8 px-4 text-base text-ink-50 outline-none ring-1 ring-inset ring-white/10 focus:ring-accent/50"
                  autoFocus
                />
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0 || busy}
                className="h-11 rounded-2xl bg-white/8 px-4 text-sm font-semibold text-ink-100 ring-1 ring-inset ring-white/10 disabled:opacity-40"
              >
                Back
              </button>
              {step < QUESTIONS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => canAdvance && setStep((value) => Math.min(QUESTIONS.length - 1, value + 1))}
                  disabled={!canAdvance || busy}
                  className="h-11 flex-1 rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 disabled:opacity-40"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void makeDraft()}
                  disabled={!canAdvance || busy}
                  className="h-11 flex-1 rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 disabled:opacity-40"
                >
                  Generate plan
                </button>
              )}
            </div>
            {status ? <div className="mt-3 text-[12px] text-ink-300">{status}</div> : null}
          </div>

          <aside className="surface rounded-3xl p-5">
            <div className="text-sm font-semibold text-ink-50">Optional context</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
              Paste a plan or upload a readable PDF. The questions still matter because they keep the plan personal.
            </p>
            <textarea
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="Paste any diet/training plan notes here..."
              className="mt-4 min-h-32 w-full resize-none rounded-2xl bg-white/8 p-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10"
            />
            <label className="mt-3 block rounded-2xl bg-white/6 p-3 text-[12px] text-ink-300 ring-1 ring-inset ring-white/10">
              PDF upload
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-[12px] text-ink-400 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-ink-100"
              />
            </label>
            <div className="mt-4 text-[11px] text-ink-500">
              {answered}/{QUESTIONS.length} answered · PDF v1 reads text PDFs only
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
