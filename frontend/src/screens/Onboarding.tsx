import { useMemo, useState } from 'react'
import { authHeader, AUTH_API_BASE, signOut } from '@/auth/session'
import { asLocalDate } from '@/domain/date'
import { applyOnboardingPlan, type OnboardingPlanDraft } from '@/db/repo'
import { buildStarterPlan, previewNumbers, projectWeeks, type Pace } from '@/domain/onboardingPlan'
import { sync } from '@/sync/client'

type FieldType = 'text' | 'number' | 'choice' | 'longtext'

interface Field {
  key: string
  label: string
  helper?: string
  type: FieldType
  optional?: boolean
  choices?: string[]
  unit?: string
  placeholder?: string
}

interface Step {
  eyebrow: string
  title: string
  blurb: string
  fields: Field[]
  /** Which live preview to render under the fields, if any. */
  preview?: 'bmi' | 'plan'
}

const STEPS: Step[] = [
  {
    eyebrow: 'Hello',
    title: 'Let’s get to know you',
    blurb: 'A few questions and I’ll draft a plan built around your life — not a generic template.',
    fields: [
      { key: 'name', label: 'What should I call you?', type: 'text', placeholder: 'Your name' },
      {
        key: 'goal',
        label: 'What’s your main goal right now?',
        type: 'choice',
        choices: ['Lose fat', 'Build muscle', 'Recomp', 'Maintain'],
      },
      {
        key: 'motivation',
        label: 'What’s driving this? (optional)',
        helper: 'A sentence about your why helps the plan stay realistic on hard days.',
        type: 'longtext',
        optional: true,
      },
    ],
  },
  {
    eyebrow: 'Your body',
    title: 'The basics behind your numbers',
    blurb: 'These set your starting calories and protein. Best estimates are fine.',
    preview: 'bmi',
    fields: [
      { key: 'sex', label: 'Which should the calorie math use?', helper: 'Affects BMR.', type: 'choice', choices: ['Male', 'Female', 'Prefer not to say'] },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'heightCm', label: 'Height', unit: 'cm', type: 'number' },
      { key: 'currentWeightKg', label: 'Current weight', unit: 'kg', type: 'number' },
      { key: 'goalWeightKg', label: 'Goal weight', unit: 'kg', type: 'number' },
    ],
  },
  {
    eyebrow: 'Your goal',
    title: 'How should this feel?',
    blurb: 'Steady is easiest to sustain. You can change pace any time.',
    preview: 'plan',
    fields: [
      {
        key: 'desiredPace',
        label: 'Pick your pace',
        type: 'choice',
        choices: ['Steady', 'Moderate', 'Aggressive'],
      },
    ],
  },
  {
    eyebrow: 'Training',
    title: 'How you’ll move',
    blurb: 'Pick the realistic number, not the heroic one.',
    fields: [
      { key: 'gymDaysPerWeek', label: 'Training days per week', type: 'number' },
      { key: 'equipment', label: 'What can you train with? (optional)', type: 'choice', optional: true, choices: ['Full gym', 'Home basics', 'Bodyweight only'] },
      { key: 'trainingExperience', label: 'Experience (optional)', type: 'choice', optional: true, choices: ['Beginner', 'Returning', 'Intermediate', 'Advanced'] },
      { key: 'cardioPreference', label: 'Cardio you actually tolerate (optional)', type: 'text', optional: true, placeholder: 'Walking, running, cycling, none…' },
    ],
  },
  {
    eyebrow: 'Food',
    title: 'How you like to eat',
    blurb: 'The more honest here, the more the plan feels like your food.',
    fields: [
      { key: 'dietStyle', label: 'Eating style (optional)', type: 'choice', optional: true, choices: ['Omnivore', 'Vegetarian', 'Vegan', 'Other'] },
      { key: 'mealsPerDay', label: 'Meals per day you prefer (optional)', type: 'choice', optional: true, choices: ['2', '3', '4', '5'] },
      { key: 'dietConstraints', label: 'Allergies or constraints (optional)', type: 'text', optional: true, placeholder: 'Lactose, budget, nut allergy…' },
      { key: 'foodsLoved', label: 'Foods you love (optional)', type: 'text', optional: true, placeholder: 'So the plan keeps them in' },
      { key: 'foodsAvoided', label: 'Foods you’d rather avoid (optional)', type: 'text', optional: true },
    ],
  },
  {
    eyebrow: 'Life & recovery',
    title: 'The full picture',
    blurb: 'This keeps the plan from being too aggressive when life is busy.',
    fields: [
      { key: 'activityLevel', label: 'How active is a normal day?', helper: 'Job, walking, chores, commute.', type: 'choice', choices: ['Sedentary', 'Moderate', 'Active'] },
      { key: 'sleepStress', label: 'How are sleep and stress lately? (optional)', type: 'text', optional: true, placeholder: '7h sleep, work is hectic…' },
      { key: 'injuries', label: 'Any injuries or medical limits? (optional)', type: 'text', optional: true, placeholder: 'Say none, or what to respect' },
    ],
  },
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
      weeklyRunKmTarget: phase.weeklyRunKmTarget === null ? null : Number(phase.weeklyRunKmTarget),
      notes: phase.notes ?? null,
    })),
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? (result.split(',')[1] ?? '') : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function num(value: string | undefined): number | null {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) && String(value ?? '').trim() !== '' ? parsed : null
}

function bmiBand(bmi: number): { label: string; tone: string } {
  if (bmi < 18.5) return { label: 'below the healthy range', tone: 'text-info' }
  if (bmi < 25) return { label: 'in the healthy range', tone: 'text-accent' }
  if (bmi < 30) return { label: 'above the healthy range', tone: 'text-warn' }
  return { label: 'in the high range', tone: 'text-warn' }
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
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const isReviewStep = step >= STEPS.length
  const current = STEPS[step]
  const totalSteps = STEPS.length + 1 // + the "anything else" step
  const progressPct = Math.round(((step + 1) / (totalSteps + 1)) * 100)

  const setAnswer = (key: string, value: string) =>
    setAnswers((cur) => ({ ...cur, [key]: value }))

  const stepComplete = (s: Step | undefined) =>
    !s || s.fields.every((f) => f.optional || (answers[f.key] ?? '').trim() !== '')

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

  const acceptDraft = (next: DraftResponse) => {
    setDraft(next)
    setEditable(coerceDraft(next))
    setFailed(false)
  }

  const makeDraft = async () => {
    setBusy(true)
    setFailed(false)
    setStatus('Building your plan…')
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
      acceptDraft((await res.json()) as DraftResponse)
      setStatus(null)
    } catch (error) {
      setFailed(true)
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const useStarterPlan = () => {
    acceptDraft(buildStarterPlan(answers, timezone))
    setStatus(null)
  }

  const apply = async () => {
    if (!editable) return
    setBusy(true)
    setStatus('Saving your plan…')
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
      setStatus('Plan saved. Opening your dashboard…')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- Review ---
  if (editable && draft) {
    const target = editable.targets
    const pace = (answers.desiredPace as Pace) || 'Steady'
    const totalWeeks = projectWeeks(editable.profile.startWeightKg, editable.profile.goalWeightKg, pace)
    return (
      <div className="min-h-dvh">
        <main className="mx-auto grid min-h-dvh w-full max-w-6xl gap-5 px-5 py-6 safe-top lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-8">
          <section className="surface rounded-3xl p-5 sm:p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Your plan is ready</div>
            <h1 className="mt-2 text-3xl font-semibold text-ink-50">
              {editable.profile.name ? `Here’s your plan, ${editable.profile.name}.` : 'Here’s your starting plan.'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-300">{draft.profileSummary}</p>
            {totalWeeks ? (
              <p className="mt-2 text-[13px] text-ink-400">
                At a {pace.toLowerCase()} pace that’s about{' '}
                <span className="font-semibold text-ink-100">{totalWeeks} weeks</span> to {editable.profile.goalWeightKg} kg —
                broken into stages so it never feels like a cliff.
              </p>
            ) : null}

            {draft.cautions.length ? (
              <div className="mt-4 rounded-2xl bg-warn/10 p-3 text-[12px] leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
                {draft.cautions.join(' ')}
              </div>
            ) : null}

            {/* Phase roadmap — the payoff, shown as an achievable staircase. */}
            <div className="mt-5 space-y-2">
              {editable.phases.map((phase, index) => {
                const weeks = projectWeeks(phase.startWeightKg, phase.targetWeightKg, pace)
                return (
                  <div key={`${phase.name}-${index}`} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-inset ring-white/8">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-ink-50">{phase.name}</span>
                        {weeks ? <span className="text-[11px] text-ink-500">~{weeks} wk</span> : null}
                      </div>
                      <div className="tabular mt-0.5 text-[12px] text-ink-400">
                        {phase.startWeightKg} → {phase.targetWeightKg} kg · {phase.calories} kcal · {phase.proteinG} g protein
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-[12px] font-medium text-ink-300">
                Plan start date
                <input
                  type="date"
                  value={editable.planStartDate}
                  onChange={(e) => setEditable({ ...editable, planStartDate: asLocalDate(e.target.value) })}
                  className="mt-2 h-11 w-full rounded-xl bg-white/8 px-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Goal weight
                <NumberInput
                  value={editable.profile.goalWeightKg}
                  onChange={(v) => v !== null && setEditable({ ...editable, profile: { ...editable.profile, goalWeightKg: v } })}
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Calories
                <NumberInput value={target.calories} onChange={(v) => v !== null && patchTargets({ calories: v }, { calories: v })} />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Protein
                <NumberInput value={target.proteinG} onChange={(v) => v !== null && patchTargets({ proteinG: v }, { proteinG: v })} />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Steps
                <NumberInput value={target.steps} onChange={(v) => v !== null && patchTargets({ steps: v }, { steps: v })} />
              </label>
              <label className="block text-[12px] font-medium text-ink-300">
                Training days per week
                <NumberInput value={target.gymDaysPerWeek} min={0} onChange={(v) => v !== null && patchTargets({ gymDaysPerWeek: v })} />
              </label>
            </div>
          </section>

          <aside className="surface flex flex-col rounded-3xl p-5">
            <div className="text-sm font-semibold text-ink-50">Ready when you are</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
              You can change any of this later from the Plan tab — nothing here is locked in.
            </p>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy}
              className="mt-5 h-12 w-full rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 shadow-[0_14px_34px_-18px] shadow-accent disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Start with this plan'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setEditable(null)
                setStatus(null)
                setStep(0)
              }}
              className="mt-2 h-11 w-full rounded-2xl bg-white/8 px-4 text-sm font-semibold text-ink-100 ring-1 ring-inset ring-white/10"
            >
              Change my answers
            </button>
            {status ? <div className="mt-3 text-[12px] text-ink-300">{status}</div> : null}
          </aside>
        </main>
      </div>
    )
  }

  // ---------------------------------------------------------- Guided flow ---
  const preview = current?.preview
  const bmiValue =
    preview === 'bmi' && num(answers.heightCm) && num(answers.currentWeightKg)
      ? num(answers.currentWeightKg)! / (num(answers.heightCm)! / 100) ** 2
      : null
  const planPreview = preview === 'plan' ? previewNumbers(answers) : null
  const goalWeeks =
    preview === 'plan'
      ? projectWeeks(num(answers.currentWeightKg) ?? 0, num(answers.goalWeightKg) ?? 0, (answers.desiredPace as Pace) || 'Steady')
      : null

  const onLastStep = step === STEPS.length // the "anything else" step

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6 safe-top lg:px-8">
        {/* Progress */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-ink-400">
            <span className="uppercase tracking-[0.16em] text-accent">Setting up</span>
            <span>Step {Math.min(step + 1, totalSteps)} of {totalSteps}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <section className="surface flex-1 rounded-3xl p-5 sm:p-6">
          {isReviewStep ? null : onLastStep ? (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Almost there</div>
              <h1 className="mt-2 text-2xl font-semibold text-ink-50 sm:text-3xl">Anything else I should know?</h1>
              <p className="mt-2 text-sm leading-6 text-ink-300">
                Optional — paste an existing plan or drop a readable PDF and I’ll fold it in. Then I’ll build your plan.
              </p>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste any diet or training notes here…"
                className="mt-4 min-h-28 w-full resize-none rounded-2xl bg-white/8 p-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10"
              />
              <label className="mt-3 block rounded-2xl bg-white/6 p-3 text-[12px] text-ink-300 ring-1 ring-inset ring-white/10">
                PDF upload (optional)
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-[12px] text-ink-400 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-ink-100"
                />
              </label>
            </>
          ) : current ? (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{current.eyebrow}</div>
              <h1 className="mt-2 text-2xl font-semibold leading-tight text-ink-50 sm:text-3xl">
                {current.title}
                {step === 0 && answers.name?.trim() ? <span className="text-accent">, {answers.name.trim()}</span> : null}
              </h1>
              <p className="mt-2 text-sm leading-6 text-ink-300">{current.blurb}</p>

              <div className="mt-5 space-y-4">
                {current.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[13px] font-medium text-ink-200">
                      {field.label}
                      {field.unit ? <span className="ml-1 text-ink-500">({field.unit})</span> : null}
                    </label>
                    {field.helper ? <p className="mt-0.5 text-[11px] text-ink-500">{field.helper}</p> : null}
                    {field.type === 'choice' ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {field.choices?.map((choice) => (
                          <button
                            type="button"
                            key={choice}
                            onClick={() => setAnswer(field.key, choice)}
                            className={`rounded-2xl px-3.5 py-2.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                              answers[field.key] === choice
                                ? 'bg-accent text-ink-950 ring-accent'
                                : 'bg-white/7 text-ink-100 ring-white/10 hover:bg-white/12'
                            }`}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    ) : field.type === 'longtext' ? (
                      <textarea
                        value={answers[field.key] ?? ''}
                        onChange={(e) => setAnswer(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="mt-2 min-h-20 w-full resize-none rounded-2xl bg-white/8 p-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10 focus:ring-accent/50"
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        inputMode={field.type === 'number' ? 'decimal' : undefined}
                        value={answers[field.key] ?? ''}
                        onChange={(e) => setAnswer(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="mt-2 h-11 w-full rounded-xl bg-white/8 px-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10 focus:ring-accent/50"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Live payoff so the user sees the app working, not just collecting. */}
              {bmiValue ? (
                <div className="mt-5 rounded-2xl bg-white/5 px-3.5 py-3 text-[12px] ring-1 ring-inset ring-white/10">
                  Your BMI is{' '}
                  <span className={`font-semibold ${bmiBand(bmiValue).tone}`}>{bmiValue.toFixed(1)}</span> —{' '}
                  {bmiBand(bmiValue).label}. This just tunes your starting numbers.
                </div>
              ) : null}
              {planPreview && num(answers.currentWeightKg) ? (
                <div className="mt-5 rounded-2xl bg-white/5 px-3.5 py-3 text-[12px] leading-relaxed ring-1 ring-inset ring-white/10">
                  Estimated maintenance{' '}
                  <span className="tabular font-semibold text-ink-100">{planPreview.maintenanceKcal} kcal</span> — I’ll start
                  you around <span className="tabular font-semibold text-accent">{planPreview.targetKcal} kcal</span> and{' '}
                  <span className="tabular font-semibold text-ink-100">{planPreview.proteinG} g</span> protein.
                  {goalWeeks ? <> That’s roughly <span className="font-semibold text-ink-100">{goalWeeks} weeks</span> to your goal.</> : null}
                </div>
              ) : null}
            </>
          ) : null}

          {status ? (
            <div className={`mt-4 rounded-2xl px-3.5 py-2.5 text-[12px] ring-1 ring-inset ${failed ? 'bg-alert/10 text-alert ring-alert/20' : 'bg-white/5 text-ink-300 ring-white/10'}`}>
              {status}
            </div>
          ) : null}

          {failed ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void makeDraft()}
                disabled={busy}
                className="h-11 rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 disabled:opacity-40"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={useStarterPlan}
                className="h-11 rounded-2xl bg-white/8 px-4 text-sm font-semibold text-ink-100 ring-1 ring-inset ring-white/12"
              >
                Continue with a safe starter plan
              </button>
            </div>
          ) : null}
        </section>

        {/* Navigation */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={step === 0 || busy}
            className="h-11 rounded-2xl bg-white/8 px-4 text-sm font-semibold text-ink-100 ring-1 ring-inset ring-white/10 disabled:opacity-40"
          >
            Back
          </button>
          {onLastStep ? (
            <button
              type="button"
              onClick={() => void makeDraft()}
              disabled={busy}
              className="h-11 flex-1 rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 disabled:opacity-50"
            >
              {busy ? 'Building your plan…' : 'Build my plan'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stepComplete(current) && setStep((v) => v + 1)}
              disabled={!stepComplete(current) || busy}
              className="h-11 flex-1 rounded-2xl bg-accent px-4 text-sm font-bold text-ink-950 disabled:opacity-40"
            >
              Continue
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
