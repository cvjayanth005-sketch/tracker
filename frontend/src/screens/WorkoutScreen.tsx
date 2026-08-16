import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addRun,
  addSet,
  allExercises,
  deleteRun,
  deleteSet,
  getWorkoutForDate,
  recentSessions,
  setsForWorkout,
  startWorkout,
  updateRun,
  updateSet,
  updateWorkout,
} from '@/db/repo'
import { dayOfWeek, formatShort, weekdayName } from '@/domain/date'
import { bestEstimated1rm, evaluateProgression, sessionVolume } from '@/domain/progression'
import { upsertLog } from '@/db/repo'
import { useDashboard } from '@/hooks/useDashboard'
import { NumberField, TextArea } from '@/components/fields'
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pill,
  SectionTitle,
  Stat,
} from '@/components/ui'
import { fmtInt, statVal } from '@/components/format'
import { paceMinPerKm } from '@/domain/running'
import type {
  Exercise,
  ExercisePrescription,
  Run,
  RunType,
  SessionType,
  WorkoutSet,
} from '@/domain/types'

const SESSION_TYPES: Array<Exclude<SessionType, 'rest' | 'run'>> = ['upper', 'lower', 'full']
const RUN_TYPES: RunType[] = ['recovery', 'easy', 'long', 'tempo', 'intervals']

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export default function WorkoutScreen() {
  const dash = useDashboard()
  const { today, phase } = dash

  const scheduled = useMemo(
    () => phase?.schedule.find((s) => s.dow === dayOfWeek(today)),
    [phase, today],
  )

  const workout = useLiveQuery(() => getWorkoutForDate(today), [today])
  const sets = useLiveQuery(
    () => (workout ? setsForWorkout(workout.id) : Promise.resolve([])),
    [workout?.id],
    [] as WorkoutSet[],
  )
  const exercises = useLiveQuery(() => allExercises(), [], [] as Exercise[])
  const history = useLiveQuery(() => recentSessions(), [], [])

  const [pickerOpen, setPickerOpen] = useState(false)

  if (!phase) return <EmptyState title="Setting up" body="Preparing your local database." />

  const sessionType = workout?.sessionType ?? scheduled?.sessionType ?? 'upper'
  const prescriptionByExercise = new Map(
    (workout?.prescription?.exercises ?? []).map((item) => [item.exerciseId, item]),
  )
  const plannedExercises = workout?.prescription
    ? workout.prescription.exercises.flatMap((item) => {
        const exercise = (exercises ?? []).find((candidate) => candidate.id === item.exerciseId)
        return exercise ? [exercise] : []
      })
    : (exercises ?? []).filter((e) => sessionType === 'full' || e.sessionType === sessionType)

  // Progression reads only sessions before today, so today's own half-finished
  // sets never feed back into today's advice.
  const priorHistory = (history ?? []).filter((h) => h.workout.date !== today)

  const volume = sessionVolume(sets ?? [])
  const workingSets = (sets ?? []).filter((s) => !s.isWarmup)

  const begin = async (type: Exclude<SessionType, 'rest'>) => {
    await startWorkout(today, type)
    await upsertLog(today, { gymDone: true })
    setPickerOpen(false)
  }

  return (
    <div className="pb-4">
      <PageHeader
        eyebrow={`${weekdayName(today)} · ${formatShort(today)}`}
        title="Training"
        action={
          scheduled?.gym ? (
            <Pill tone="info">{scheduled.sessionType} scheduled</Pill>
          ) : (
            <Pill>no gym scheduled</Pill>
          )
        }
      />

      <div className="mt-4 grid gap-5 lg:mt-6 lg:grid-cols-[1fr_19rem] lg:items-start lg:gap-6">
        <div>
          <SectionTitle
            action={
              <span className="type-caption text-[var(--app-muted)]">
                {scheduled?.runKm ? `${scheduled.runKm} km planned` : 'Optional today'}
              </span>
            }
          >
            Running
          </SectionTitle>
          <RunLogger
            runs={dash.runs.filter((run) => run.date === today)}
            scheduledType={scheduled?.runType ?? 'easy'}
            onAdd={() => void addRun(today, scheduled?.runType ?? 'easy')}
          />
          <div className="mt-3 lg:hidden">
            <RunningProgress dash={dash} />
          </div>

          <SectionTitle>Strength</SectionTitle>
          {workout?.prescription ? (
            <Card className="mb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="type-micro font-semibold text-[var(--app-muted)]">
                    Adaptive session applied
                  </div>
                  <div className="mt-1 type-caption font-semibold text-[var(--app-ink)]">
                    {workout.prescription.headline}
                  </div>
                  <div className="mt-1 type-caption text-[var(--app-muted)]">
                    {workout.prescription.adjustments.join(' · ') || 'Original progression retained'}
                  </div>
                </div>
                <Pill
                  tone={
                    workout.prescription.readinessBand === 'ready'
                      ? 'good'
                      : workout.prescription.readinessBand === 'reduce'
                        ? 'warn'
                        : 'info'
                  }
                >
                  {workout.prescription.readinessScore == null
                    ? 'readiness pending'
                    : `${workout.prescription.readinessScore}/100 readiness`}
                </Pill>
              </div>
            </Card>
          ) : null}
          {!workout ? (
            !pickerOpen ? (
            <Card>
              <p className="type-caption leading-relaxed text-[var(--app-ink-soft)]">
                {scheduled?.gym
                  ? `Today is a ${scheduled.sessionType} day in ${phase.name}.`
                  : 'No gym session is scheduled today. You can still log one.'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="primary"
                  onClick={() =>
                    void begin(
                      scheduled?.gym && scheduled.sessionType !== 'rest'
                        ? (scheduled.sessionType as Exclude<SessionType, 'rest'>)
                        : 'upper',
                    )
                  }
                >
                  Start {scheduled?.gym ? scheduled.sessionType : 'session'}
                </Button>
                <Button onClick={() => setPickerOpen(true)}>Pick another</Button>
              </div>
            </Card>
            ) : (
            <Card>
              <div className="type-caption font-medium text-[var(--app-ink)]">Which session?</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {SESSION_TYPES.map((type) => (
                  <Button key={type} onClick={() => void begin(type)} className="capitalize">
                    {type}
                  </Button>
                ))}
              </div>
            </Card>
            )
          ) : (
          <div>
            {/*
              Two columns from lg. A full Upper day is six cards, which is five
              scrolls in one column and roughly one screen in two.
            */}
            <div className="grid gap-3 xl:grid-cols-2">
              {plannedExercises.map((exercise) => (
                <ExerciseBlock
                  key={exercise.id}
                  exercise={exercise}
                  workoutId={workout.id}
                  sets={(sets ?? []).filter((s) => s.exerciseId === exercise.id)}
                  advice={evaluateProgression(exercise, priorHistory)}
                  prescription={prescriptionByExercise.get(exercise.id)}
                />
              ))}
            </div>
          </div>
          )}
        </div>

        <div className="hidden space-y-3 lg:sticky lg:top-6 lg:block">
          <RunningProgress dash={dash} />
          {workout ? (
            <>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <Stat label="Working sets" value={workingSets.length} />
              <Stat label="Volume" value={fmtInt(volume)} unit="kg·reps" />
              <Stat
                label="Best e1RM"
                value={statVal(bestEstimated1rm(sets ?? []), 1)}
                unit="kg"
              />
            </div>
            <TextArea
              label="Notes"
              value={workout.notes}
              onCommit={(notes) => void updateWorkout(workout.id, { notes })}
              placeholder="How it went, niggles, anything to carry forward"
            />
            {workout.finishedAt ? (
              <p className="px-1 type-caption text-[var(--app-muted)]">
                Finished at {new Date(workout.finishedAt).toLocaleTimeString()}
              </p>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                onClick={() =>
                  void updateWorkout(workout.id, { finishedAt: new Date().toISOString() })
                }
              >
                Finish session
              </Button>
            )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function formatPace(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const totalSeconds = Math.round(value * 60)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function RunLogger({
  runs,
  scheduledType,
  onAdd,
}: {
  runs: Run[]
  scheduledType: RunType
  onAdd: () => void
}) {
  return (
    <Card>
      {runs.length === 0 ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="type-caption font-medium text-[var(--app-ink)]">
              {capitalise(scheduledType)} run
            </div>
            <p className="mt-0.5 type-caption text-[var(--app-muted)]">Log distance and effort when you finish.</p>
          </div>
          <Button variant="primary" onClick={onAdd}>Log run</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((run) => <RunEditor key={run.id} run={run} />)}
          <Button variant="ghost" className="w-full" onClick={onAdd}>+ Add another run</Button>
        </div>
      )}
    </Card>
  )
}

function RunEditor({ run }: { run: Run }) {
  const [distance, setDistance] = useState(run.distanceKm)
  const [duration, setDuration] = useState(run.durationMin)

  useEffect(() => setDistance(run.distanceKm), [run.distanceKm])
  useEffect(() => setDuration(run.durationMin), [run.durationMin])

  const pace = paceMinPerKm(distance, duration)

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="type-micro font-semibold text-[var(--app-muted)]">Run type</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RUN_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void updateRun(run.id, { type })}
                className={`min-h-9 radius-control px-2.5 type-caption font-medium capitalize transition-colors ${ run.type === type ? 'bg-info text-ink-950' : 'bg-[var(--app-inset)] text-[var(--app-muted)] ring-1 ring-inset ring-[var(--app-line)]' }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          title="Delete run"
          aria-label="Delete run"
          onClick={() => void deleteRun(run.id)}
          className="h-9 w-9 shrink-0 radius-control type-title text-[var(--app-muted)] transition-colors hover:bg-alert/10 hover:text-alert"
        >
          ×
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <NumberField
          label="Distance"
          unit="km"
          value={run.distanceKm}
          step="0.1"
          onDraftChange={setDistance}
          onCommit={(distanceKm) => void updateRun(run.id, { distanceKm })}
        />
        <NumberField
          label="Duration"
          unit="min"
          value={run.durationMin}
          step="0.1"
          onDraftChange={setDuration}
          onCommit={(durationMin) => void updateRun(run.id, { durationMin })}
        />
      </div>

      <div className="glass-inset mt-2 flex items-center justify-between radius-control px-3.5 py-3">
        <div>
          <div className="type-caption font-medium text-[var(--app-ink)]">Live pace</div>
          <div className="type-caption text-[var(--app-muted)]">Computed from distance and duration</div>
        </div>
        <div className="tabular type-title text-[var(--app-ink)]">
          {formatPace(pace)} <span className="type-caption font-normal text-[var(--app-muted)]">/km</span>
        </div>
      </div>

      <div className="glass-inset mt-2 radius-control px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className="type-caption font-medium text-[var(--app-ink)]">Effort</span>
          <span className="type-caption text-[var(--app-muted)]">RPE 1-10</span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((rpe) => (
            <button
              key={rpe}
              type="button"
              onClick={() => void updateRun(run.id, { rpe: run.rpe === rpe ? null : rpe })}
              className={`tabular h-9 radius-control type-caption font-semibold transition-colors ${ run.rpe === rpe ? 'bg-info text-ink-950' : 'bg-[var(--app-inset)] text-[var(--app-muted)] ring-1 ring-inset ring-[var(--app-line)]' }`}
            >
              {rpe}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <TextArea
          label="Run notes"
          value={run.notes}
          onCommit={(notes) => void updateRun(run.id, { notes })}
          placeholder="Route, terrain, how it felt"
        />
      </div>
    </div>
  )
}

function RunningProgress({ dash }: { dash: ReturnType<typeof useDashboard> }) {
  const trend = dash.easyPace
  const progression = dash.paceProgression
  const ramp = dash.volumeRamp
  const longRun = dash.longRunProgression
  const targets = dash.derivedTargetPaces
  const trendSub =
    trend.status === 'ok'
      ? `${trend.runs} easy-band runs · 21-day mean`
      : `Needs ${Math.max(0, trend.required - trend.runs)} more easy runs`
  const progressionLabel =
    progression.status === 'insufficient_data'
      ? 'Building baseline'
      : capitalise(progression.status)

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="type-micro font-semibold text-[var(--app-muted)]">Running progression</div>
          <div className="mt-1 type-body font-semibold text-[var(--app-ink)]">{progressionLabel}</div>
        </div>
        <Pill tone={ramp.status === 'ramp_too_fast' ? 'warn' : 'neutral'}>
          {ramp.status === 'ramp_too_fast' ? 'ramp warning' : 'trend only'}
        </Pill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
        <Stat label="Easy pace" value={formatPace(trend.averagePaceMinPerKm)} unit="/km" sub={trendSub} />
        <Stat
          label="7-day volume"
          value={dash.weeklyRunVolume.totalKm.toFixed(1)}
          unit="km"
          sub={
            ramp.status === 'insufficient_data'
              ? 'Needs 2 prior weeks for ramp'
              : `${ramp.changePct === null ? '—' : `${ramp.changePct >= 0 ? '+' : ''}${ramp.changePct.toFixed(0)}%`} vs recent weeks`
          }
          tone={ramp.status === 'ramp_too_fast' ? 'warn' : 'default'}
        />
        <Stat
          label="Long-run trend"
          value={longRun.status === 'insufficient_data' ? null : capitalise(longRun.status)}
          sub={longRun.changeKm === null ? 'Needs 2 measured weeks' : `${longRun.changeKm >= 0 ? '+' : ''}${longRun.changeKm.toFixed(1)} km over measured weeks`}
        />
      </div>
      <div className="glass-inset mt-3 radius-control px-3.5 py-3">
        <div className="type-micro font-medium text-[var(--app-muted)]">Derived target paces</div>
        {targets ? (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 type-caption">
            {(['easy', 'long', 'tempo', 'intervals'] as const).map((type) => (
              <div key={type} className="flex justify-between gap-2">
                <span className="capitalize text-[var(--app-muted)]">{type}</span>
                <span className="tabular font-medium text-[var(--app-ink)]">{formatPace(targets[type])}/km</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 type-caption leading-relaxed text-[var(--app-muted)]">Needs 3 easy runs first. No pace is prescribed until your own trend exists.</p>
        )}
      </div>
    </Card>
  )
}

function ExerciseBlock({
  exercise,
  workoutId,
  sets,
  advice,
  prescription,
}: {
  exercise: Exercise
  workoutId: string
  sets: WorkoutSet[]
  advice: ReturnType<typeof evaluateProgression>
  prescription: ExercisePrescription | undefined
}) {
  const ordered = [...sets].sort((a, b) => a.setNumber - b.setNumber)

  const adviceTone =
    advice.code === 'ready_to_increase'
      ? 'good'
      : advice.code === 'consider_deload'
        ? 'warn'
        : advice.code === 'incomplete_data'
          ? 'bad'
          : 'neutral'

  const add = () =>
    void addSet(workoutId, exercise.id, {
      // Prefill from the previous set in this session, then from the plan.
      weightKg:
        ordered.at(-1)?.weightKg ?? prescription?.suggestedWeightKg ?? advice.suggestedWeightKg,
      reps: null,
      rir: null,
    })

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="type-body font-semibold leading-tight">{exercise.name}</h3>
          <p className="mt-0.5 type-caption text-[var(--app-muted)]">
            {prescription?.targetSets ?? exercise.targetSets} ×{' '}
            {prescription?.repRangeMin ?? exercise.repRangeMin}-
            {prescription?.repRangeMax ?? exercise.repRangeMax} @ RIR{' '}
            {prescription?.targetRir ?? exercise.targetRir}
          </p>
        </div>
        <Pill tone={adviceTone}>{advice.headline}</Pill>
      </div>

      <p className="mt-1.5 type-caption leading-relaxed text-[var(--app-muted)]">
        {prescription?.reason ?? advice.detail}
      </p>

      {ordered.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 grid grid-cols-[1.6rem_1fr_1fr_1fr_1.8rem] gap-1.5 px-1 type-micro text-[var(--app-muted)]">
            <span>Set</span>
            <span className="text-center">kg</span>
            <span className="text-center">reps</span>
            <span className="text-center">RIR</span>
            <span />
          </div>
          <div className="space-y-1.5">
            {ordered.map((set) => (
              <SetRow key={set.id} set={set} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2.5 flex gap-2">
        <Button onClick={add} className="flex-1">
          + Add set
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void addSet(workoutId, exercise.id, {
              isWarmup: true,
              weightKg: (prescription?.suggestedWeightKg ?? advice.suggestedWeightKg)
                ? Math.round(
                    (prescription?.suggestedWeightKg ?? advice.suggestedWeightKg ?? 0) * 0.5,
                  )
                : null,
            })
          }
        >
          + Warm-up
        </Button>
      </div>
    </Card>
  )
}

const CELL_CLASS =
  'tabular w-full radius-control bg-[var(--app-inset)] px-1 py-2 text-center type-body font-semibold text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:font-normal placeholder:text-[var(--app-muted)] focus:ring-accent/60'

/**
 * One cell of a set row. Commits on a short debounce as well as on blur, so a
 * value typed into the last set survives the phone being locked or the app
 * being swiped away before the field ever loses focus.
 */
function SetCell({
  value,
  onCommit,
  step,
  inputMode = 'numeric',
}: {
  value: number | null
  onCommit: (next: number | null) => void
  step?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    if (dirty.current) return
    setText(value === null ? '' : String(value))
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed !== '' && Number.isNaN(Number(trimmed))) return
    dirty.current = false
    onCommit(trimmed === '' ? null : Number(trimmed))
  }

  return (
    <input
      type="number"
      inputMode={inputMode}
      {...(step ? { step } : {})}
      className={CELL_CLASS}
      placeholder="—"
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        dirty.current = true
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => commit(raw), 500)
      }}
      onBlur={(e) => {
        window.clearTimeout(timer.current)
        commit(e.target.value)
      }}
    />
  )
}

function SetRow({ set }: { set: WorkoutSet }) {
  const commit = (patch: Partial<WorkoutSet>) => void updateSet(set.id, patch)

  return (
    <div className="grid grid-cols-[1.6rem_1fr_1fr_1fr_1.8rem] items-center gap-1.5">
      <span
        className={`tabular text-center type-caption font-medium ${ set.isWarmup ? 'text-[var(--app-muted)]' : 'text-[var(--app-muted)]' }`}
      >
        {set.isWarmup ? 'W' : set.setNumber}
      </span>
      <SetCell
        value={set.weightKg}
        step="0.5"
        inputMode="decimal"
        onCommit={(weightKg) => commit({ weightKg })}
      />
      <SetCell value={set.reps} onCommit={(reps) => commit({ reps })} />
      <SetCell value={set.rir} onCommit={(rir) => commit({ rir })} />
      <button
        type="button"
        onClick={() => void deleteSet(set.id)}
        aria-label={`Delete set ${set.setNumber}`}
        className="text-center type-body leading-none text-[var(--app-muted)] active:text-alert"
      >
        ×
      </button>
    </div>
  )
}
