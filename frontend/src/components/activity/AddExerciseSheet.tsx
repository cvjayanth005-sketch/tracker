import { useMemo, useState } from 'react'
import { createExercise } from '@/db/repo'
import { defaultCustomExerciseParams, defaultExerciseParams } from '@/domain/exercisePicker'
import { muscleDisplayTag, muscleGroupFor } from '@/domain/muscleTaxonomy'
import type { SplitDay } from '@/domain/trainingSplits'
import { EXERCISES, type CatalogExercise } from '@/domain/onboarding/catalog/exercises'
import { BODYWEIGHT_ID, equipmentById } from '@/domain/onboarding/catalog/equipment'
import type { Exercise } from '@/domain/types'
import { Button } from '@/components/ui'

/**
 * The equipment options for this exercise the person can actually use — the
 * movement's `requiredEquipment` alternatives narrowed to what their gym has
 * (bodyweight is always available). Empty when they own none of them, which is
 * what makes the whole exercise unusable. Each option becomes a separate
 * "variant" the user can add, since the same lift with a barbell vs a machine
 * is a different entry to log against.
 */
function usableEquipmentOptions(exercise: CatalogExercise, ownedEquipmentIds: string[]): string[] {
  const owned = new Set([...ownedEquipmentIds, BODYWEIGHT_ID])
  const hasAllAlsoRequired = (exercise.alsoRequires ?? []).every((id) => owned.has(id))
  if (!hasAllAlsoRequired) return []
  return exercise.requiredEquipment.filter((id) => owned.has(id))
}

function equipmentLabel(id: string): string {
  return equipmentById(id)?.label ?? id
}

/**
 * Browses the exercise catalogue — the same one onboarding uses for
 * familiarity questions, never surfaced afterward — filtered to what the
 * person actually has equipment for, with a free-text fallback for whatever
 * their specific gym has that the catalogue doesn't know about.
 *
 * Scoped to one split day at a time: exercises that match the day's target
 * muscle groups sort first, everything else stays reachable below via
 * search. Adding an exercise here tags it with both the day's underlying
 * upper/lower/full bucket (so the existing workout rotation keeps working
 * unmodified) and the day's own key (so it shows back up under the right
 * card in the planner).
 */
export function AddExerciseSheet({
  bucket,
  day,
  equipmentIds,
  onClose,
  onAdded,
}: {
  /** Underlying upper/lower/full bucket the new exercise counts toward. */
  bucket: Exercise['sessionType']
  /** The split day being planned, when opened from the planner — adds muscle-group
   * prioritization and tags the exercise with day.key. Omitted for the
   * mid-workout "add exercise" shortcut, which has no split day in view. */
  day?: SplitDay
  equipmentIds: string[]
  onClose: () => void
  onAdded: (exercise: Exercise) => void
}) {
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    // When searching, look across the whole catalogue so nothing is
    // unreachable. With no search term, a day-scoped sheet shows only that
    // day's muscle groups — an Arms day lists arm work, not everything.
    let pool = term === '' ? EXERCISES : EXERCISES.filter((e) => e.name.toLowerCase().includes(term))
    if (term === '' && day && day.muscleGroups.length > 0) {
      pool = pool.filter((e) => {
        const group = muscleGroupFor(e.name)
        return group ? day.muscleGroups.includes(group) : false
      })
    }
    return [...pool].sort((a, b) => {
      const aUsable = usableEquipmentOptions(a, equipmentIds).length > 0
      const bUsable = usableEquipmentOptions(b, equipmentIds).length > 0
      if (aUsable !== bUsable) return aUsable ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [search, equipmentIds, day])

  const addFromCatalog = async (catalogExercise: CatalogExercise, equipmentId: string | null) => {
    setBusyId(equipmentId ? `${catalogExercise.id}:${equipmentId}` : catalogExercise.id)
    try {
      // Tag the entry with the chosen implement so the same movement can be
      // tracked separately per equipment (barbell vs machine vs dumbbell).
      const label = equipmentId ? `${catalogExercise.name} (${equipmentLabel(equipmentId)})` : catalogExercise.name
      const created = await createExercise(
        label,
        bucket,
        defaultExerciseParams(catalogExercise),
        day?.key ?? null,
        equipmentId,
      )
      onAdded(created)
    } finally {
      setBusyId(null)
    }
  }

  const addCustom = async () => {
    const name = customName.trim()
    if (!name) return
    setBusyId('custom')
    try {
      const created = await createExercise(name, bucket, defaultCustomExerciseParams(), day?.key ?? null)
      setCustomName('')
      onAdded(created)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="quick-action-backdrop" role="presentation" onClick={onClose}>
      <div
        className="quick-action-sheet radius-panel"
        role="dialog"
        aria-modal="true"
        aria-label={day ? `Add exercise to ${day.label}` : 'Add exercise'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1">
          <h2 className="type-title text-[var(--app-ink)]">{day ? `Add to ${day.label}` : 'Add exercise'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-press flex h-8 w-8 items-center justify-center radius-control text-[var(--app-muted)]"
          >
            ✕
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={day ? 'Search all exercises…' : 'Search exercises…'}
          className="mt-3 w-full radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
        />

        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {matches.slice(0, 60).map((catalogExercise) => {
            const options = usableEquipmentOptions(catalogExercise, equipmentIds)
            const usable = options.length > 0
            const missing = catalogExercise.requiredEquipment.map(equipmentLabel).join(' or ')
            return (
              <li
                key={catalogExercise.id}
                className={`radius-control px-3 py-2.5 ring-1 ring-inset ${
                  usable
                    ? 'bg-[var(--app-inset)] ring-[var(--app-line)]'
                    : 'bg-transparent ring-[var(--app-line)] opacity-60'
                }`}
              >
                <div className="min-w-0">
                  <span className="block truncate type-caption font-medium text-[var(--app-ink)]">
                    {catalogExercise.name}
                  </span>
                  {muscleDisplayTag(catalogExercise.name) ? (
                    <span className="block truncate type-micro text-[var(--app-muted)]">
                      {muscleDisplayTag(catalogExercise.name)}
                    </span>
                  ) : null}
                </div>
                {usable ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {options.map((equip) => {
                      const busy = busyId === `${catalogExercise.id}:${equip}`
                      return (
                        <button
                          key={equip}
                          type="button"
                          onClick={() => void addFromCatalog(catalogExercise, equip)}
                          disabled={busy}
                          className="motion-press radius-control bg-accent/10 px-2.5 py-1 type-micro font-medium text-accent ring-1 ring-inset ring-accent/30 disabled:opacity-50"
                        >
                          + {equipmentLabel(equip)}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-1.5 type-micro text-[var(--app-muted)]">needs {missing}</p>
                )}
              </li>
            )
          })}
          {matches.length === 0 ? (
            <li className="px-1 py-2 type-caption text-[var(--app-muted)]">
              {search.trim() === '' && day
                ? 'No catalogue exercises for this muscle group — search above or add a custom one below.'
                : 'Nothing matches — add it as a custom exercise below.'}
            </li>
          ) : null}
        </ul>

        <div className="mt-4 border-t border-[var(--app-line)] pt-3">
          <p className="type-micro font-semibold text-[var(--app-muted)]">
            Can&apos;t find it? Add it as a custom exercise.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Chest press machine"
              className="min-w-0 flex-1 radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
            />
            <Button
              variant="primary"
              onClick={() => void addCustom()}
              disabled={!customName.trim() || busyId === 'custom'}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
