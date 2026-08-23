import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allExercises, upsertExercise } from '@/db/repo'
import type { Exercise } from '@/domain/types'
import {
  BODY_PART_GROUPS,
  BODY_PART_LABEL,
  SUBREGIONS,
  SUBREGION_LABEL,
  classifyBodyPart,
  type BodyPartGroup,
} from '@/domain/muscleTaxonomy'
import { AddExerciseSheet } from '@/components/activity/AddExerciseSheet'
import { Button } from '@/components/ui'

/**
 * Manage the persistent exercise template outside of a live workout, grouped
 * by the muscle a lifter actually thinks in terms of ("I need a lower-chest
 * exercise") rather than by which day it happens to be scheduled on. Upper
 * versus lower/full is still what decides which day an exercise appears on —
 * that choice now lives inside AddExerciseSheet itself — this view is purely
 * for finding and organizing what's in the library.
 *
 * Classification is by exercise name (see muscleTaxonomy.ts), so it works
 * identically for a catalogue pick and a hand-typed custom exercise; neither
 * needs a stored muscle tag. Anything the classifier can't place — a small,
 * honest minority — surfaces in its own "Other" group rather than being
 * silently dropped from the library.
 */
export function ExerciseLibrary({ equipmentIds }: { equipmentIds: string[] }) {
  const exercises = useLiveQuery(() => allExercises(), [], [] as Exercise[])
  const [group, setGroup] = useState<BodyPartGroup | 'other'>('chest')
  const [addOpen, setAddOpen] = useState(false)

  const classified = useMemo(
    () => exercises.map((exercise) => ({ exercise, classification: classifyBodyPart(exercise.name) })),
    [exercises],
  )

  const inGroup = useMemo(() => {
    if (group === 'other') return classified.filter((c) => c.classification === null)
    return classified.filter((c) => c.classification?.group === group)
  }, [classified, group])

  const subregions = group === 'other' ? undefined : SUBREGIONS[group]

  const grouped = useMemo(() => {
    if (!subregions) return [{ key: null as string | null, items: inGroup }]
    const buckets = new Map<string | null, typeof inGroup>()
    for (const sub of subregions) buckets.set(sub, [])
    buckets.set(null, [])
    for (const entry of inGroup) {
      const key = entry.classification?.subregion ?? null
      const bucket = buckets.get(key) ?? buckets.get(null)!
      bucket.push(entry)
    }
    return [...buckets.entries()]
      .filter(([, items]) => items.length > 0)
      .map(([key, items]) => ({ key, items }))
  }, [inGroup, subregions])

  const archive = async (exercise: Exercise) => {
    /*
     * Archive rather than delete — a historic workout still references this
     * exercise, and losing that reference would silently corrupt past
     * session data. Archiving hides it from future planning while leaving
     * every previous log intact.
     */
    await upsertExercise({ ...exercise, archived: true })
  }

  const otherCount = classified.filter((c) => c.classification === null).length

  return (
    <div className="exercise-library app-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-full border border-[var(--app-line)] p-0.5">
          {BODY_PART_GROUPS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGroup(option)}
              className={`radius-pill px-3 py-1.5 type-caption font-semibold ${
                group === option
                  ? 'bg-[var(--app-selected-fill)] text-[var(--app-selected-ink)]'
                  : 'text-[var(--app-muted)]'
              }`}
            >
              {BODY_PART_LABEL[option]}
            </button>
          ))}
          {otherCount > 0 ? (
            <button
              type="button"
              onClick={() => setGroup('other')}
              className={`radius-pill px-3 py-1.5 type-caption font-semibold ${
                group === 'other'
                  ? 'bg-[var(--app-selected-fill)] text-[var(--app-selected-ink)]'
                  : 'text-[var(--app-muted)]'
              }`}
            >
              Other
            </button>
          ) : null}
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          + Add exercise
        </Button>
      </div>

      {inGroup.length === 0 ? (
        <p className="type-caption text-[var(--app-muted)]">
          {group === 'other'
            ? 'Nothing unclassified right now.'
            : `No ${BODY_PART_LABEL[group as BodyPartGroup].toLowerCase()} exercises yet — add one below.`}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ key, items }) => (
            <div key={key ?? '_none'}>
              {key ? (
                <div className="mb-1.5 type-micro font-semibold text-[var(--app-muted)]">
                  {SUBREGION_LABEL[key] ?? key}
                </div>
              ) : null}
              <ul className="divide-y divide-[var(--app-line)]">
                {items.map(({ exercise }) => (
                  <li key={exercise.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="type-caption font-semibold text-[var(--app-ink)]">{exercise.name}</div>
                      <div className="mt-0.5 type-micro text-[var(--app-muted)]">
                        {exercise.targetSets} × {exercise.repRangeMin}–{exercise.repRangeMax} @ RIR{' '}
                        {exercise.targetRir} · {exercise.sessionType} day
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
            </div>
          ))}
        </div>
      )}

      {addOpen ? (
        <AddExerciseSheet
          // Just the sheet's starting default — its own session selector
          // lets this be changed before adding either way.
          sessionType={group === 'legs' ? 'lower' : 'upper'}
          equipmentIds={equipmentIds}
          onClose={() => setAddOpen(false)}
          onAdded={() => {}}
        />
      ) : null}
    </div>
  )
}
