import { useMemo, useState } from 'react'
import { createExercise } from '@/db/repo'
import {
  defaultCustomExerciseParams,
  defaultExerciseParams,
  isCatalogExerciseUsable,
} from '@/domain/exercisePicker'
import { EXERCISES, type CatalogExercise } from '@/domain/onboarding/catalog/exercises'
import type { Exercise } from '@/domain/types'
import { Button } from '@/components/ui'

/**
 * Browses the exercise catalogue — the same one onboarding uses for
 * familiarity questions, never surfaced afterward — filtered to what the
 * person actually has equipment for, with a free-text fallback for whatever
 * their specific gym has that the catalogue doesn't know about.
 *
 * Usable and not-usable entries both show: hiding an exercise a person could
 * plausibly still do (they might be visiting a different gym today) would be
 * presumptuous. Instead the ones they can't currently do are visually
 * quieter and say what they're missing, so the picker is honest without
 * being restrictive.
 */
export function AddExerciseSheet({
  sessionType,
  equipmentIds,
  onClose,
  onAdded,
}: {
  sessionType: Exercise['sessionType']
  equipmentIds: string[]
  onClose: () => void
  onAdded: (exercise: Exercise) => void
}) {
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    const pool = term === '' ? EXERCISES : EXERCISES.filter((e) => e.name.toLowerCase().includes(term))
    return [...pool].sort((a, b) => {
      const aUsable = isCatalogExerciseUsable(a, equipmentIds)
      const bUsable = isCatalogExerciseUsable(b, equipmentIds)
      if (aUsable !== bUsable) return aUsable ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [search, equipmentIds])

  const addFromCatalog = async (catalogExercise: CatalogExercise) => {
    setBusyId(catalogExercise.id)
    try {
      const created = await createExercise(
        catalogExercise.name,
        sessionType,
        defaultExerciseParams(catalogExercise),
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
      const created = await createExercise(name, sessionType, defaultCustomExerciseParams())
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
        aria-label="Add exercise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1">
          <h2 className="type-title text-[var(--app-ink)]">Add exercise</h2>
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
          placeholder="Search exercises…"
          className="mt-3 w-full radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
        />

        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {matches.slice(0, 60).map((catalogExercise) => {
            const usable = isCatalogExerciseUsable(catalogExercise, equipmentIds)
            const missing = catalogExercise.requiredEquipment.join(' or ')
            return (
              <li key={catalogExercise.id}>
                <button
                  type="button"
                  onClick={() => void addFromCatalog(catalogExercise)}
                  disabled={busyId === catalogExercise.id}
                  className={`flex w-full items-center justify-between gap-3 radius-control px-3 py-2.5 text-left ring-1 ring-inset ${
                    usable
                      ? 'bg-[var(--app-inset)] ring-[var(--app-line)]'
                      : 'bg-transparent text-[var(--app-muted)] ring-[var(--app-line)] opacity-60'
                  }`}
                >
                  <span className="min-w-0 truncate type-caption font-medium text-[var(--app-ink)]">
                    {catalogExercise.name}
                  </span>
                  <span className="shrink-0 type-micro text-[var(--app-muted)]">
                    {usable ? 'Add' : `needs ${missing}`}
                  </span>
                </button>
              </li>
            )
          })}
          {matches.length === 0 ? (
            <li className="px-1 py-2 type-caption text-[var(--app-muted)]">
              Nothing matches — add it as a custom exercise below.
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
