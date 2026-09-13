import { useMemo, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eligibleStrengthExercises, estimateOneRepMax, oneRepMaxHistory } from '@/domain/oneRepMax'
import type { Exercise, Workout, WorkoutSet } from '@/domain/types'

export function OneRepMaxSheet({ exercises, sessions }: { exercises: Exercise[]; sessions: Array<{ workout: Workout; sets: WorkoutSet[] }> }) {
  const choices = eligibleStrengthExercises(exercises)
  const [exerciseId, setExerciseId] = useState(choices[0]?.id ?? '')
  const [weight, setWeight] = useState(100)
  const [reps, setReps] = useState(5)
  const history = useMemo(() => oneRepMaxHistory(exerciseId, sessions), [exerciseId, sessions])
  const estimate = estimateOneRepMax(weight, reps)
  return <div><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="type-caption font-semibold text-[var(--app-ink)]">Estimated 1RM</div><div className="mt-1 type-micro text-[var(--app-muted)]">Best eligible set · Epley formula</div></div><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)} className="radius-control bg-[var(--app-inset)] px-2 py-1.5 type-caption text-[var(--app-ink)]">{choices.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></div><div className="mt-4 h-44">{history.length ? <ResponsiveContainer><LineChart data={history}><XAxis dataKey="date" hide /><YAxis width={35} /><Tooltip /><Line type="monotone" dataKey="estimateKg" stroke="#00f0ff" strokeWidth={2.5} dot /></LineChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-[var(--app-inset)] type-caption text-[var(--app-muted)]">Log a working set of 1–12 reps to see a curve.</div>}</div><div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2"><input aria-label="Weight in kg" type="number" value={weight} onChange={(event) => setWeight(Number(event.target.value))} className="radius-control bg-[var(--app-inset)] px-3 py-2 type-caption text-[var(--app-ink)]" /><input aria-label="Repetitions" type="number" min="1" max="12" value={reps} onChange={(event) => setReps(Number(event.target.value))} className="radius-control bg-[var(--app-inset)] px-3 py-2 type-caption text-[var(--app-ink)]" /><div className="rounded-xl bg-info/10 px-3 py-2 type-caption font-semibold text-info">{estimate?.toFixed(1) ?? '—'} kg</div></div></div>
}
