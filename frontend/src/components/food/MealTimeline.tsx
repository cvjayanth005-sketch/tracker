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
    <div className="mt-2 space-y-2 rounded-2xl bg-black/25 p-3 ring-1 ring-inset ring-white/10">
      <input
        defaultValue={meal.name}
        onBlur={(e) => {
          const name = e.target.value.trim()
          if (name && name !== meal.name) void updateMeal(meal.id, { name })
        }}
        className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-ink-50 outline-none ring-1 ring-inset ring-white/10 focus:ring-accent/60"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Portion</span>
        <input
          type="number"
          inputMode="decimal"
          defaultValue={meal.quantity ?? ''}
          onBlur={(e) => {
            const next = num(e.target.value)
            if (next !== (meal.quantity ?? null)) void updateMeal(meal.id, { quantity: next })
          }}
          placeholder="—"
          className="tabular w-16 rounded-lg bg-white/5 px-2 py-1.5 text-center text-[13px] text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
        />
        <input
          defaultValue={meal.unit ?? ''}
          onBlur={(e) => {
            const next = e.target.value.trim() || null
            if (next !== (meal.unit ?? null)) void updateMeal(meal.id, { unit: next })
          }}
          placeholder="g / cup / piece"
          className="min-w-0 flex-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[13px] text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MACRO_CHIPS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide" style={{ color: field.color }}>
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
              className="tabular w-full rounded-lg bg-white/5 px-2 py-1.5 text-center text-[13px] font-semibold text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:font-normal placeholder:text-ink-600 focus:ring-accent/60"
            />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(SUBMACRO) as SubMacroKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1">
            <span className="text-[10px] font-semibold" style={{ color: SUBMACRO[key].color }}>
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
              className="tabular ml-auto w-14 rounded bg-white/5 px-1.5 py-1 text-center text-[12px] text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
            />
            <span className="text-[9px] text-ink-500">g</span>
          </label>
        ))}
      </div>
      <MicroFields value={meal.micros} onSet={(key, next) => void updateMeal(meal.id, { micros: setMicro(meal.micros, key, next) })} />
      <div className="flex justify-between pt-0.5">
        <button
          type="button"
          onClick={() => void deleteMeal(meal.id)}
          className="text-[12px] font-medium text-alert/80 hover:text-alert"
        >
          Delete meal
        </button>
        <div className="flex items-center gap-3">
          {saved ? (
            <span className="text-[12px] font-medium text-accent">★ Saved</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                void saveMealAsFood(meal)
                setSaved(true)
              }}
              disabled={!meal.name.trim()}
              className="text-[12px] font-medium text-ink-300 hover:text-accent disabled:opacity-40"
              title="Save to your quick-add library"
            >
              ☆ Save food
            </button>
          )}
          <button type="button" onClick={onClose} className="text-[12px] font-medium text-ink-300 hover:text-ink-100">
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
        className="tabular rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ color: field.color, backgroundColor: `${field.color}1a` }}
      >
        {Math.round(values[field.key] as number)}
        {field.key === 'calories' ? '' : field.unit}
      </span>
    ),
  )
  if (chips.every((chip) => chip === null)) {
    return <span className="text-[11px] text-ink-500">No macros yet — tap to add</span>
  }
  return <>{chips}</>
}

function MealRow({ meal, nested = false }: { meal: Meal; nested?: boolean }) {
  const [editing, setEditing] = useState(false)
  return (
    <div
      className={
        nested
          ? 'rounded-xl bg-black/20 p-2.5 ring-1 ring-inset ring-white/6'
          : 'rounded-2xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/8'
      }
    >
      <button type="button" onClick={() => setEditing((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className={`truncate font-medium text-ink-50 ${nested ? 'text-[13px]' : 'text-sm'}`}>
            {meal.name || 'Untitled meal'}
            {meal.quantity !== null ? (
              <span className="ml-1.5 text-[11px] font-normal text-ink-500">
                {meal.quantity}
                {meal.unit ? ` ${meal.unit}` : ''}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MacroChips values={meal} />
          </div>
        </div>
        {!nested && meal.time ? <span className="tabular shrink-0 text-[11px] text-ink-400">{meal.time}</span> : null}
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
    <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/8">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink-50">{groupName(group.meals)}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MacroChips values={totals} />
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {group.time ? <span className="tabular text-[11px] text-ink-400">{group.time}</span> : null}
          <span className={`text-ink-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>⌄</span>
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
        <div className="text-sm font-medium text-ink-200">No meals logged today</div>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-400">
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
              <span className="text-[12px] font-semibold text-ink-200">{SLOT_META[slot].label}</span>
              <span className="text-[11px] text-ink-500">
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
