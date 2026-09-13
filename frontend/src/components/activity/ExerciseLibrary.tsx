import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allExercises, updateSettings, upsertExercise } from '@/db/repo'
import type { Exercise, Settings } from '@/domain/types'
import { BODY_PART_LABEL, muscleDisplayTag } from '@/domain/muscleTaxonomy'
import { findSplit, type SplitDay, type TrainingSplitPlan } from '@/domain/trainingSplits'
import { AddExerciseSheet } from '@/components/activity/AddExerciseSheet'
import { SplitPicker } from '@/components/activity/SplitPicker'
import { Button } from '@/components/ui'

function ExerciseRow({ exercise, onRemove, onToggleSuperset }: { exercise: Exercise; onRemove: () => void; onToggleSuperset: () => void }) {
  const tag = muscleDisplayTag(exercise.name)
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--app-line)] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="type-caption font-semibold text-[var(--app-ink)] truncate">{exercise.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {tag ? <span className="type-micro font-medium text-accent">{tag}</span> : null}
          <span className="type-micro text-[var(--app-muted)]">
            {exercise.targetSets} sets · {exercise.repRangeMin}–{exercise.repRangeMax} reps @ RIR {exercise.targetRir}
          </span>
          {exercise.supersetGroupId ? <span className="type-micro font-semibold text-info">Superset</span> : null}
        </div>
      </div>
      <button type="button" onClick={onToggleSuperset} className="motion-press radius-control px-2 py-1 type-micro font-semibold text-info hover:bg-info/10">
        {exercise.supersetGroupId ? 'Unpair' : 'Pair'}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${exercise.name}`}
        className="motion-press flex h-7 w-7 shrink-0 items-center justify-center radius-control text-[var(--app-muted)] hover:bg-[var(--app-line)] hover:text-alert transition-colors"
      >
        ✕
      </button>
    </div>
  )
}

function DayCard({
  day,
  exercises,
  onRemove,
  onToggleSuperset,
  onOpenAdd,
}: {
  day: SplitDay
  exercises: Exercise[]
  onRemove: (exercise: Exercise) => void
  onToggleSuperset: (exercise: Exercise) => void
  onOpenAdd: () => void
}) {
  return (
    <div className="app-panel p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="type-caption font-bold text-[var(--app-ink)]">{day.label}</div>
          <div className="type-micro text-[var(--app-muted)] mt-0.5">
            {day.muscleGroups.map((g) => BODY_PART_LABEL[g]).join(' · ') || 'Whatever you like'}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenAdd}
          className="motion-press shrink-0 flex items-center gap-1 radius-control bg-[var(--app-selected-fill)] text-[var(--app-selected-ink)] px-3 py-1.5 type-micro font-semibold"
        >
          <span className="text-base leading-none">+</span>
          <span>Add</span>
        </button>
      </div>

      {exercises.length === 0 ? (
        <button
          type="button"
          onClick={onOpenAdd}
          className="w-full rounded-xl border-2 border-dashed border-[var(--app-line)] py-5 text-center motion-press hover:border-[var(--app-muted)] transition-colors"
        >
          <div className="type-caption text-[var(--app-muted)]">No exercises planned</div>
          <div className="type-micro text-[var(--app-muted)] mt-0.5">Tap to add your first exercise</div>
        </button>
      ) : (
        <div className="divide-y divide-[var(--app-line)]">
          {exercises.map((ex) => (
            <ExerciseRow key={ex.id} exercise={ex} onRemove={() => onRemove(ex)} onToggleSuperset={() => onToggleSuperset(ex)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ExerciseLibrary({
  equipmentIds,
  settings,
}: {
  equipmentIds: string[]
  settings: Settings
}) {
  const exercises = useLiveQuery(() => allExercises(), [], [] as Exercise[])
  const [addOpenForDay, setAddOpenForDay] = useState<string | null>(null)

  const split: TrainingSplitPlan | undefined = useMemo(() => {
    if (settings.trainingSplitId === 'custom') {
      return {
        id: 'custom',
        name: 'Custom Split',
        emoji: '🛠️',
        frequency: 'You decide',
        goodFor: '',
        description: '',
        isCustom: true,
        days: settings.customSplitDays.map((d) => ({
          key: d.key,
          label: d.label,
          muscleGroups: [],
          bucket: d.bucket,
        })),
      }
    }
    return findSplit(settings.trainingSplitId)
  }, [settings.trainingSplitId, settings.customSplitDays])

  const byDay = useMemo(() => {
    const map = new Map<string, Exercise[]>()
    if (!split) return map
    for (const day of split.days) map.set(day.key, [])
    for (const ex of exercises) {
      const key = ex.splitDayKey ?? undefined
      if (key && map.has(key)) map.get(key)!.push(ex)
    }
    return map
  }, [exercises, split])

  const archive = async (exercise: Exercise) => {
    await upsertExercise({ ...exercise, archived: true })
  }
  const toggleSuperset = async (exercise: Exercise) => {
    const sameDay = exercises
      .filter((candidate) => candidate.splitDayKey === exercise.splitDayKey)
      .sort((a, b) => a.order - b.order)
    const partner = sameDay[sameDay.findIndex((candidate) => candidate.id === exercise.id) ^ 1]
    if (!partner) return
    const groupId = exercise.supersetGroupId ? null : `ss-${exercise.splitDayKey ?? exercise.sessionType}-${Math.min(exercise.order, partner.order)}`
    await Promise.all([
      upsertExercise({ ...exercise, supersetGroupId: groupId }),
      upsertExercise({ ...partner, supersetGroupId: groupId }),
    ])
  }

  if (!split) {
    return (
      <SplitPicker
        onPick={(splitId) => void updateSettings({ trainingSplitId: splitId })}
        onPickCustom={(days) =>
          void updateSettings({ trainingSplitId: 'custom', customSplitDays: days })
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{split.emoji}</span>
          <span className="type-caption font-bold text-[var(--app-ink)]">{split.name}</span>
        </div>
        <Button
          variant="ghost"
          onClick={() => void updateSettings({ trainingSplitId: null, customSplitDays: [] })}
        >
          Change split
        </Button>
      </div>
      {split.days.map((day) => (
        <DayCard
          key={day.key}
          day={day}
          exercises={byDay.get(day.key) ?? []}
          onRemove={(ex) => void archive(ex)}
          onToggleSuperset={(ex) => void toggleSuperset(ex)}
          onOpenAdd={() => setAddOpenForDay(day.key)}
        />
      ))}

      {addOpenForDay
        ? (() => {
            const day = split.days.find((d) => d.key === addOpenForDay)
            if (!day) return null
            return (
              <AddExerciseSheet
                bucket={day.bucket}
                day={day}
                equipmentIds={equipmentIds}
                onClose={() => setAddOpenForDay(null)}
                onAdded={() => setAddOpenForDay(null)}
              />
            )
          })()
        : null}
    </div>
  )
}
