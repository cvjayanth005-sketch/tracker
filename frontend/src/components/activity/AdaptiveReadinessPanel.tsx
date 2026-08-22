import { useEffect, useState } from 'react'
import type { DailyLog, Rating, WorkoutPrescription } from '@/domain/types'
import { Pill } from '@/components/ui'

/**
 * Today's readiness check-in and the session it produces.
 *
 * Standalone on Activity rather than nested inside the coach chat: this is
 * something to act on every training day, and hiding it behind opening a
 * chat window would have made the common case — check in, apply, go lift —
 * two steps slower than it needs to be.
 */

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
      <div className="mb-1.5 flex items-center justify-between type-micro font-semibold text-[var(--app-muted)]">
        <span>{label}</span>
        <span className="tabular text-[var(--app-muted)]">{value ?? '—'}/5</span>
      </div>
      <div className="grid grid-cols-5 gap-1" role="group" aria-label={label}>
        {READINESS_VALUES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(value === option ? null : option)}
            className={`tabular h-8 radius-control type-caption font-semibold transition-colors ${value === option ? 'bg-info text-ink-950' : 'bg-[var(--app-inset)] text-[var(--app-muted)] ring-1 ring-inset ring-[var(--app-line)]'}`}
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
      <span className="mb-1.5 block type-micro font-semibold text-[var(--app-muted)]">
        Training constraint
      </span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(text.trim() || null)}
        placeholder="None, or note discomfort / equipment limits"
        className="h-9 w-full radius-control bg-[var(--app-inset)] px-3 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-info/50"
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
      <span className="mb-1.5 flex items-center justify-between type-micro font-semibold text-[var(--app-muted)]">
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
          className="tabular min-w-0 flex-1 bg-transparent text-center type-caption font-semibold text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)]"
        />
        <span className="type-caption text-[var(--app-muted)]">h</span>
      </span>
    </label>
  )
}

export function AdaptiveReadinessPanel({
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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="type-micro font-semibold text-[var(--app-muted)]">Readiness</div>
          <div className="mt-1 type-body font-semibold text-[var(--app-ink)]">
            {prescription?.headline ?? (scheduled ? 'Complete today\'s check-in' : 'Recovery day')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={tone}>
            {prescription?.readinessScore == null ? 'score pending' : `${prescription.readinessScore}/100`}
          </Pill>
          <span className="type-micro text-[var(--app-muted)]">
            {prescription?.confidence ?? 'low'} confidence
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="coach-readiness-details"
            className="radius-control bg-[var(--app-inset)] px-2.5 py-1 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)]"
          >
            {expanded ? 'Done' : 'Update'}
          </button>
        </div>
      </div>

      {prescription ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 radius-control bg-[var(--app-inset)] px-3 py-2.5 ring-1 ring-inset ring-[var(--app-line)]">
          <div className="min-w-0">
            <div className="type-micro font-semibold text-[var(--app-muted)]">
              Adaptive session · {prescription.exercises.length} exercises
            </div>
            <div className="mt-1 truncate type-caption text-[var(--app-ink-soft)]">
              {prescription.adjustments[0] ?? 'Current plan and progression retained'}
            </div>
          </div>
          <button
            type="button"
            onClick={onApply}
            className="min-h-9 shrink-0 radius-control bg-accent px-3 type-caption font-semibold text-ink-950 transition-transform active:scale-[0.97]"
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
              <div className="mb-1.5 type-micro font-semibold text-[var(--app-muted)]">Time</div>
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
                    className={`h-9 radius-control px-2.5 type-caption font-semibold transition-colors ${log?.trainingMinutesAvailable === minutes ? 'bg-accent text-ink-950' : 'bg-[var(--app-inset)] text-[var(--app-muted)] ring-1 ring-inset ring-[var(--app-line)]'}`}
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
              <div className="type-micro font-semibold text-[var(--app-muted)]">Session detail</div>
              <div className="mt-3 divide-y divide-[var(--app-line)] border-y border-[var(--app-line)]">
                {prescription.exercises.slice(0, 4).map((exercise) => (
                  <div
                    key={exercise.exerciseId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 type-caption"
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
