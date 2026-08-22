import { useState } from 'react'
import { Pill } from '@/components/ui'
import type { GainsSuggestion, ProgressionGroups } from '@/domain/gainsSuggestion'
import type { ProgressionAdvice } from '@/domain/progression'
import type { Exercise } from '@/domain/types'

/**
 * Where the programme stands, lift by lift, and the one thing worth doing
 * about it.
 *
 * The per-exercise progression verdicts already existed — they were computed
 * for the coach's context and then never shown, so the app knew a lift was
 * stalled and never said so. This surfaces them directly, with the single
 * suggestion on top, because the summary is what someone acts on and the list
 * is what they check it against.
 */

type Entry = { exercise: Exercise; advice: ProgressionAdvice }

const GROUP_META: Array<{
  key: keyof ProgressionGroups
  label: string
  tone: 'good' | 'info' | 'warn' | 'neutral'
}> = [
  { key: 'ready', label: 'Ready to add load', tone: 'good' },
  { key: 'stalled', label: 'Stalled', tone: 'warn' },
  { key: 'building', label: 'Building', tone: 'info' },
  { key: 'untracked', label: 'Not enough data', tone: 'neutral' },
]

function SuggestionBanner({
  suggestion,
  onApply,
  onDismiss,
  applying,
}: {
  suggestion: GainsSuggestion
  onApply: () => void
  onDismiss: () => void
  applying: boolean
}) {
  // Only volume changes are directly appliable — the rest are judgement calls
  // about how to train, which the app should not perform on someone's behalf.
  const appliable = suggestion.kind === 'add_volume' && suggestion.exerciseIds.length > 0
  const tone =
    suggestion.kind === 'deload'
      ? 'app-tone-energy'
      : suggestion.kind === 'add_volume'
        ? 'app-tone-action'
        : suggestion.kind === 'progress_load'
          ? 'app-tone-success'
          : 'app-tone-muted'

  return (
    <div className={`progression-suggestion ${tone}`}>
      <p className="app-eyebrow">Suggestion</p>
      <h3 className="type-title mt-1 text-[var(--app-ink)]">{suggestion.headline}</h3>
      <p className="type-caption mt-1.5 leading-relaxed text-[var(--app-ink-soft)]">
        {suggestion.detail}
      </p>
      {appliable ? (
        <div className="progression-suggestion-actions">
          <button
            type="button"
            className="app-button app-button-primary motion-press"
            onClick={onApply}
            disabled={applying}
          >
            {applying ? 'Applying' : 'Add a set to each'}
          </button>
          <button
            type="button"
            className="app-button app-button-quiet motion-press"
            onClick={onDismiss}
            disabled={applying}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ExerciseRow({ entry }: { entry: Entry }) {
  const { exercise, advice } = entry
  return (
    <li className="progression-row">
      <div className="min-w-0">
        <div className="type-caption font-semibold text-[var(--app-ink)]">{exercise.name}</div>
        <div className="type-micro text-[var(--app-muted)]">{advice.headline}</div>
      </div>
      <div className="progression-row-load">
        {advice.lastWorkingWeightKg != null ? (
          <>
            <span className="type-metric-sm text-[var(--app-ink)]">{advice.lastWorkingWeightKg}</span>
            <span className="type-micro text-[var(--app-muted)]">kg</span>
          </>
        ) : (
          <span className="type-micro text-[var(--app-muted)]">—</span>
        )}
      </div>
    </li>
  )
}

export function ProgressionCard({
  groups,
  suggestion,
  onApplySuggestion,
  applying,
}: {
  groups: ProgressionGroups
  suggestion: GainsSuggestion
  onApplySuggestion: (exerciseIds: string[]) => void
  applying: boolean
}) {
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState<keyof ProgressionGroups | null>('ready')

  const populated = GROUP_META.filter((meta) => groups[meta.key].length > 0)

  return (
    <div className="progression-card">
      {!dismissed ? (
        <SuggestionBanner
          suggestion={suggestion}
          applying={applying}
          onApply={() => onApplySuggestion(suggestion.exerciseIds)}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}

      {populated.length === 0 ? (
        <p className="type-caption mt-3 text-[var(--app-muted)]">
          No exercises in your plan yet.
        </p>
      ) : (
        <ul className="progression-groups">
          {populated.map((meta) => {
            const entries = groups[meta.key]
            const open = expanded === meta.key
            return (
              <li key={meta.key}>
                <button
                  type="button"
                  className="progression-group-head motion-press"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : meta.key)}
                >
                  <Pill tone={meta.tone}>{entries.length}</Pill>
                  <span className="type-caption font-semibold text-[var(--app-ink)]">
                    {meta.label}
                  </span>
                  <span className="progression-chevron" aria-hidden="true">
                    {open ? '⌃' : '⌄'}
                  </span>
                </button>
                {open ? (
                  <ul className="progression-list">
                    {entries.map((entry) => (
                      <ExerciseRow key={entry.exercise.id} entry={entry} />
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
