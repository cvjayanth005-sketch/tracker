import { useState } from 'react'
import { Card } from '@/components/ui'
import { fmtInt } from '@/components/format'
import { compareDates, formatShort, weekdayName } from '@/domain/date'
import type { MacroTargets } from '@/domain/foodContext'
import type { DailyLog, LocalDate, Meal } from '@/domain/types'
import { MACRO, SLOT_META, SLOT_ORDER } from './palette'
import { MacroRings, type MacroTotals } from './MacroRings'

const MACRO_CHIPS = [
  { key: 'calories', ...MACRO.calories },
  { key: 'proteinG', ...MACRO.protein },
  { key: 'carbsG', ...MACRO.carbs },
  { key: 'fatG', ...MACRO.fat },
] as const

interface DayEntry {
  date: LocalDate
  totals: MacroTotals
  meals: Meal[]
}

function DayCard({ entry, targets }: { entry: DayEntry; targets: MacroTargets }) {
  const [open, setOpen] = useState(false)
  const { totals, meals } = entry
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-inset ring-white/8">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <MacroRings
          totals={totals}
          targets={targets}
          size={54}
          stroke={5}
          gap={2}
          center={<span className="tabular text-[10px] font-semibold text-ink-200">{meals.length}</span>}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-50">
            {weekdayName(entry.date)} <span className="font-normal text-ink-400">· {formatShort(entry.date)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {MACRO_CHIPS.map((field) =>
              totals[field.key as keyof MacroTotals] === null ? null : (
                <span key={field.key} className="tabular text-[11px]" style={{ color: field.color }}>
                  {Math.round(totals[field.key as keyof MacroTotals] as number)}
                  {field.key === 'calories' ? '' : field.unit}
                </span>
              ),
            )}
          </div>
        </div>
        <span className="tabular shrink-0 text-right text-[11px] text-ink-500">
          <span className="block font-semibold text-ink-200">{fmtInt(totals.calories)}</span>
          kcal
        </span>
        <span className={`shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-white/8 px-3 pb-3 pt-2">
          {meals.length === 0 ? (
            <div className="text-[12px] text-ink-500">Daily totals only — no itemized meals for this day.</div>
          ) : (
            SLOT_ORDER.map((slot) => {
              const slotMeals = meals.filter((meal) => meal.slot === slot)
              if (slotMeals.length === 0) return null
              return (
                <div key={slot} className="flex gap-2 text-[12px]">
                  <span className="w-16 shrink-0 text-ink-500">{SLOT_META[slot].label}</span>
                  <span className="min-w-0 text-ink-200">
                    {slotMeals.map((meal, i) => (
                      <span key={meal.id}>
                        {i > 0 ? ', ' : ''}
                        {meal.name || 'Untitled'}
                        {meal.calories !== null ? (
                          <span className="text-ink-500"> ({Math.round(meal.calories)})</span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Day-by-day history so progress is visible over time. Each past day shows its
 * macro rings and expands to the meals logged that day. Today is excluded — it
 * already has the full summary above.
 */
export function MealHistory({
  today,
  logs,
  meals,
  targets,
  days = 14,
}: {
  today: LocalDate
  logs: DailyLog[]
  meals: Meal[]
  targets: MacroTargets
  days?: number
}) {
  const mealsByDate = new Map<LocalDate, Meal[]>()
  for (const meal of meals) {
    const list = mealsByDate.get(meal.date) ?? []
    list.push(meal)
    mealsByDate.set(meal.date, list)
  }

  const entries: DayEntry[] = logs
    .filter((log) => log.date !== today)
    .map((log) => ({
      date: log.date,
      totals: { calories: log.calories, proteinG: log.proteinG, carbsG: log.carbsG, fatG: log.fatG },
      meals: mealsByDate.get(log.date) ?? [],
    }))
    .filter(
      (entry) =>
        entry.meals.length > 0 ||
        entry.totals.calories !== null ||
        entry.totals.proteinG !== null,
    )
    .sort((a, b) => compareDates(b.date, a.date))
    .slice(0, days)

  if (entries.length === 0) {
    return (
      <Card className="text-center">
        <div className="text-sm font-medium text-ink-200">No history yet</div>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-400">
          As you log meals each day, they stack up here so you can watch your macros over time.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <DayCard key={entry.date} entry={entry} targets={targets} />
      ))}
    </div>
  )
}
