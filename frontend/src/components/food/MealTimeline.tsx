import { useState } from 'react'
import { deleteMeal, saveMealAsFood, updateMeal } from '@/db/repo'
import { Card } from '@/components/ui'
import { groupMacroTotals, groupMeals, groupName, type MealGroup } from '@/domain/mealGroups'
import type { Meal } from '@/domain/types'
import { MACRO, SLOT_META, SLOT_ORDER, SUBMACRO, type SubMacroKey } from './palette'
import { MicroFields, setMicro } from './micros'

const MACRO_CHIPS = [
  { key: 'calories', ...MACRO.calories },
  { key: 'proteinG', ...MACRO.protein },
  { key: 'carbsG', ...MACRO.carbs },
  { key: 'fatG', ...MACRO.fat },
] as const

function num(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

function MealEditor({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const [saved, setSaved] = useState(false)
  return (
    <div className="mt-2 space-y-2 radius-control bg-[var(--app-inset)] p-3 ring-1 ring-inset ring-[var(--app-line)]">
      <input
        defaultValue={meal.name}
        onBlur={(e) => {
          const name = e.target.value.trim()
          if (name && name !== meal.name) void updateMeal(meal.id, { name })
        }}
        className="w-full radius-control bg-[var(--app-inset)] px-3 py-2 type-caption font-medium text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] focus:ring-accent/60"
      />
      <div className="flex items-center gap-2">
        <span className="type-micro font-semibold text-[var(--app-muted)]">Portion</span>
        <input
          type="number"
          inputMode="decimal"
          defaultValue={meal.quantity ?? ''}
          onBlur={(e) => {
            const next = num(e.target.value)
            if (next !== (meal.quantity ?? null)) void updateMeal(meal.id, { quantity: next })
          }}
          placeholder="—"
          className="tabular w-16 radius-control bg-[var(--app-inset)] px-2 py-1.5 text-center type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
        />
        <input
          defaultValue={meal.unit ?? ''}
          onBlur={(e) => {
            const next = e.target.value.trim() || null
            if (next !== (meal.unit ?? null)) void updateMeal(meal.id, { unit: next })
          }}
          placeholder="g / cup / piece"
          className="min-w-0 flex-1 radius-control bg-[var(--app-inset)] px-2.5 py-1.5 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MACRO_CHIPS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block type-micro font-semibold" style={{ color: field.color }}>
              {field.label}
            </span>
            <input
              type="number"
              inputMode="decimal"
              defaultValue={meal[field.key] ?? ''}
              onBlur={(e) => {
                const next = num(e.target.value)
                if (next !== (meal[field.key] ?? null)) void updateMeal(meal.id, { [field.key]: next })
              }}
              placeholder="—"
              className="tabular w-full radius-control bg-[var(--app-inset)] px-2 py-1.5 text-center type-caption font-semibold text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:font-normal placeholder:text-[var(--app-muted)] focus:ring-accent/60"
            />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(SUBMACRO) as SubMacroKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2 radius-control bg-[var(--app-inset)] px-2 py-1">
            <span className="type-caption font-semibold" style={{ color: SUBMACRO[key].color }}>
              {SUBMACRO[key].label}
            </span>
            <input
              type="number"
              inputMode="decimal"
              defaultValue={meal[key] ?? ''}
              onBlur={(e) => {
                const next = num(e.target.value)
                if (next !== (meal[key] ?? null)) void updateMeal(meal.id, { [key]: next })
              }}
              placeholder="—"
              className="tabular ml-auto w-14 rounded bg-[var(--app-inset)] px-1.5 py-1 text-center type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
            />
            <span className="type-caption text-[var(--app-muted)]">g</span>
          </label>
        ))}
      </div>
      <MicroFields value={meal.micros} onSet={(key, next) => void updateMeal(meal.id, { micros: setMicro(meal.micros, key, next) })} />
      <div className="flex justify-between pt-0.5">
        <button
          type="button"
          onClick={() => void deleteMeal(meal.id)}
          className="type-caption font-medium text-alert/80 hover:text-alert"
        >
          Delete meal
        </button>
        <div className="flex items-center gap-3">
          {saved ? (
            <span className="type-caption font-medium text-accent">★ Saved</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                void saveMealAsFood(meal)
                setSaved(true)
              }}
              disabled={!meal.name.trim()}
              className="type-caption font-medium text-[var(--app-ink-soft)] hover:text-accent disabled:opacity-40"
              title="Save to your quick-add library"
            >
              ☆ Save food
            </button>
          )}
          <button type="button" onClick={onClose} className="type-caption font-medium text-[var(--app-ink-soft)] hover:text-[var(--app-ink)]">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function MacroChips({
  values,
}: {
  values: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null }
}) {
  const chips = MACRO_CHIPS.map((field) =>
    values[field.key] === null ? null : (
      <span
        key={field.key}
        className="tabular rounded-md px-1.5 py-0.5 type-caption font-semibold"
        style={{ color: field.color, backgroundColor: `${field.color}1a` }}
      >
        {Math.round(values[field.key] as number)}
        {field.key === 'calories' ? '' : field.unit}
      </span>
    ),
  )
  if (chips.every((chip) => chip === null)) {
    return <span className="type-caption text-[var(--app-muted)]">No macros yet — tap to add</span>
  }
  return <>{chips}</>
}

function MealRow({ meal, nested = false }: { meal: Meal; nested?: boolean }) {
  const [editing, setEditing] = useState(false)
  return (
    <div
      className={
        nested
          ? 'radius-control bg-[var(--app-inset)] p-2.5 ring-1 ring-inset ring-[var(--app-line)]'
          : 'radius-control bg-[var(--app-inset)] p-3 ring-1 ring-inset ring-[var(--app-line)]'
      }
    >
      <button type="button" onClick={() => setEditing((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className={`truncate font-medium text-[var(--app-ink)] ${nested ? 'type-caption' : 'type-caption'}`}>
            {meal.name || 'Untitled meal'}
            {meal.quantity !== null ? (
              <span className="ml-1.5 type-caption font-normal text-[var(--app-muted)]">
                {meal.quantity}
                {meal.unit ? ` ${meal.unit}` : ''}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MacroChips values={meal} />
          </div>
        </div>
        {!nested && meal.time ? <span className="tabular shrink-0 type-caption text-[var(--app-muted)]">{meal.time}</span> : null}
      </button>
      {editing ? <MealEditor meal={meal} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}

function MealGroupCard({ group }: { group: MealGroup }) {
  const [open, setOpen] = useState(false)
  if (group.meals.length === 1) {
    const only = group.meals[0]
    return only ? <MealRow meal={only} /> : null
  }
  const totals = groupMacroTotals(group.meals)
  return (
    <div className="radius-control bg-[var(--app-inset)] p-3 ring-1 ring-inset ring-[var(--app-line)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="truncate type-caption font-medium text-[var(--app-ink)]">{groupName(group.meals)}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MacroChips values={totals} />
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {group.time ? <span className="tabular type-caption text-[var(--app-muted)]">{group.time}</span> : null}
          <span className={`text-[var(--app-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>⌄</span>
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5">
          {group.meals.map((meal) => (
            <MealRow key={meal.id} meal={meal} nested />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Today's meals grouped by slot, then by the batch they were saved with. */
export function MealTimeline({ meals }: { meals: Meal[] }) {
  if (meals.length === 0) {
    return (
      <Card className="text-center">
        <div className="type-caption font-medium text-[var(--app-ink)]">No meals logged today</div>
        <p className="mx-auto mt-1 max-w-xs type-caption leading-relaxed text-[var(--app-muted)]">
          Use the logger above to describe what you ate — the coach reads every meal you add.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {SLOT_ORDER.map((slot) => {
        const groups = groupMeals(meals.filter((meal) => meal.slot === slot))
        if (groups.length === 0) return null
        return (
          <div key={slot}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span>{SLOT_META[slot].icon}</span>
              <span className="type-caption font-semibold text-[var(--app-ink)]">{SLOT_META[slot].label}</span>
              <span className="type-caption text-[var(--app-muted)]">
                {groups.length} meal{groups.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-2">
              {groups.map((group) => (
                <MealGroupCard key={group.key} group={group} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
