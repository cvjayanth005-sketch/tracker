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
import type { Exercise, Run, RunType, SessionType, WorkoutSet } from '@/domain/types'

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
  const plannedExercises = (exercises ?? []).filter(
    (e) => sessionType === 'full' || e.sessionType === sessionType,
  )

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
              <span className="text-[11px] text-ink-500">
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
          {!workout ? (
            !pickerOpen ? (
            <Card>
              <p className="text-[13px] leading-relaxed text-ink-300">
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
              <div className="text-[13px] font-medium text-ink-200">Which session?</div>
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
              <p className="px-1 text-[12px] text-ink-400">
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
            <div className="text-sm font-medium text-ink-100">
              {capitalise(scheduledType)} run
            </div>
            <p className="mt-0.5 text-[12px] text-ink-400">Log distance and effort when you finish.</p>
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Run type</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RUN_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void updateRun(run.id, { type })}
                className={`min-h-9 rounded-lg px-2.5 text-[12px] font-medium capitalize transition-colors ${
                  run.type === type
                    ? 'bg-info text-ink-950'
                    : 'bg-black/25 text-ink-400 ring-1 ring-inset ring-white/10'
                }`}
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
          className="h-9 w-9 shrink-0 rounded-lg text-xl text-ink-500 transition-colors hover:bg-alert/10 hover:text-alert"
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

      <div className="glass-inset mt-2 flex items-center justify-between rounded-2xl px-3.5 py-3">
        <div>
          <div className="text-[13px] font-medium text-ink-200">Live pace</div>
          <div className="text-[11px] text-ink-400">Computed from distance and duration</div>
        </div>
        <div className="tabular text-xl font-semibold text-ink-50">
          {formatPace(pace)} <span className="text-xs font-normal text-ink-400">/km</span>
        </div>
      </div>

      <div className="glass-inset mt-2 rounded-2xl px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-200">Effort</span>
          <span className="text-[11px] text-ink-400">RPE 1-10</span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((rpe) => (
            <button
              key={rpe}
              type="button"
              onClick={() => void updateRun(run.id, { rpe: run.rpe === rpe ? null : rpe })}
              className={`tabular h-9 rounded-lg text-sm font-semibold transition-colors ${
                run.rpe === rpe
                  ? 'bg-info text-ink-950'
                  : 'bg-black/25 text-ink-400 ring-1 ring-inset ring-white/10'
              }`}
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Running progression</div>
          <div className="mt-1 text-[15px] font-semibold text-ink-100">{progressionLabel}</div>
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
      <div className="glass-inset mt-3 rounded-2xl px-3.5 py-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">Derived target paces</div>
        {targets ? (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            {(['easy', 'long', 'tempo', 'intervals'] as const).map((type) => (
              <div key={type} className="flex justify-between gap-2">
                <span className="capitalize text-ink-400">{type}</span>
                <span className="tabular font-medium text-ink-100">{formatPace(targets[type])}/km</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">Needs 3 easy runs first. No pace is prescribed until your own trend exists.</p>
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
}: {
  exercise: Exercise
  workoutId: string
  sets: WorkoutSet[]
  advice: ReturnType<typeof evaluateProgression>
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
      weightKg: ordered.at(-1)?.weightKg ?? advice.suggestedWeightKg,
      reps: null,
      rir: null,
    })

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold leading-tight">{exercise.name}</h3>
          <p className="mt-0.5 text-[11px] text-ink-400">
            {exercise.targetSets} × {exercise.repRangeMin}-{exercise.repRangeMax} @ RIR{' '}
            {exercise.targetRir}
          </p>
        </div>
        <Pill tone={adviceTone}>{advice.headline}</Pill>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">{advice.detail}</p>

      {ordered.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 grid grid-cols-[1.6rem_1fr_1fr_1fr_1.8rem] gap-1.5 px-1 text-[10px] uppercase tracking-wider text-ink-400">
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
              weightKg: advice.suggestedWeightKg
                ? Math.round(advice.suggestedWeightKg * 0.5)
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
  'tabular w-full rounded-lg bg-ink-900 px-1 py-2 text-center text-[15px] font-semibold text-ink-50 outline-none ring-1 ring-inset ring-ink-700 placeholder:font-normal placeholder:text-ink-600 focus:ring-accent/60'

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
        className={`tabular text-center text-[11px] font-medium ${
          set.isWarmup ? 'text-ink-600' : 'text-ink-400'
        }`}
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
        className="text-center text-[15px] leading-none text-ink-600 active:text-alert"
      >
        ×
      </button>
    </div>
  )
}
