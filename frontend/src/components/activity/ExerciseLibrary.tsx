import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allExercises, upsertExercise } from '@/db/repo'
import type { Exercise } from '@/domain/types'
import { AddExerciseSheet } from '@/components/activity/AddExerciseSheet'
import { Button } from '@/components/ui'

/**
 * Manage the persistent exercise template outside of a live workout — this is
 * where people go to shape the sessions they'll run every week, rather than
 * needing to be mid-lift at the rack to add something they want next time.
 * Editable settings-managed list plus an "Add exercise" trigger that opens
 * the same picker the workout screen uses, so the two never drift.
 */
export function ExerciseLibrary({ equipmentIds }: { equipmentIds: string[] }) {
  const exercises = useLiveQuery(() => allExercises(), [], [] as Exercise[])
  const [sessionFilter, setSessionFilter] = useState<Exercise['sessionType']>('upper')
  const [addOpen, setAddOpen] = useState(false)

  const bySession = useMemo(() => {
    return exercises.filter((e) => e.sessionType === sessionFilter).sort((a, b) => a.order - b.order)
  }, [exercises, sessionFilter])

  const archive = async (exercise: Exercise) => {
    /*
     * Archive rather than delete — a historic workout still references this
     * exercise, and losing that reference would silently corrupt past
     * session data. Archiving hides it from future planning while leaving
     * every previous log intact.
     */
    await upsertExercise({ ...exercise, archived: true })
  }

  return (
    <div className="exercise-library app-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full border border-[var(--app-line)] p-0.5">
          {(['upper', 'lower', 'full'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSessionFilter(type)}
              className={`radius-pill px-3 py-1.5 type-caption font-semibold capitalize ${
                sessionFilter === type
                  ? 'bg-[var(--app-selected-fill)] text-[var(--app-selected-ink)]'
                  : 'text-[var(--app-muted)]'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          + Add exercise
        </Button>
      </div>

      {bySession.length === 0 ? (
        <p className="type-caption text-[var(--app-muted)]">
          No {sessionFilter} exercises yet. Add one and it&apos;ll appear in every {sessionFilter} session going forward.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--app-line)]">
          {bySession.map((exercise) => (
            <li key={exercise.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="type-caption font-semibold text-[var(--app-ink)]">{exercise.name}</div>
                <div className="mt-0.5 type-micro text-[var(--app-muted)]">
                  {exercise.targetSets} × {exercise.repRangeMin}–{exercise.repRangeMax} @ RIR {exercise.targetRir}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void archive(exercise)}
                className="motion-press type-micro font-semibold text-[var(--app-muted)] hover:text-alert"
                aria-label={`Remove ${exercise.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {addOpen ? (
        <AddExerciseSheet
          sessionType={sessionFilter}
          equipmentIds={equipmentIds}
          onClose={() => setAddOpen(false)}
          onAdded={() => {}}
        />
      ) : null}
    </div>
  )
}
