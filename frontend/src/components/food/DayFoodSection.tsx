import { upsertLog } from '@/db/repo'
import { computeEatingWindow, waterTargetForWeight } from '@/domain/foodContext'
import { NumberField } from '@/components/fields'
import { Card } from '@/components/ui'
import type { DailyLog, LocalDate, Meal, Phase } from '@/domain/types'
import { DayCompleteToggle } from './DayCompleteToggle'
import { IntakeExtras } from './IntakeExtras'
import { MACRO } from './palette'
import { MealLogger } from './MealLogger'
import { MealTimeline } from './MealTimeline'

const MACRO_CHIPS = [
  { key: 'calories', ...MACRO.calories },
  { key: 'proteinG', ...MACRO.protein },
  { key: 'carbsG', ...MACRO.carbs },
  { key: 'fatG', ...MACRO.fat },
] as const

/**
 * The food block on a single day. When the day has itemized meals they are the
 * source of truth: macro totals are shown derived (read-only) and the meal list
 * is editable. Days with no meals keep the older manual calorie/protein entry so
 * imported and quick-logged history still works — adding a meal switches the day
 * over to itemized tracking automatically (the repo rolls meals into the totals).
 */
export function DayFoodSection({
  date,
  meals,
  log,
  phase,
}: {
  date: LocalDate
  meals: Meal[]
  log: DailyLog | undefined
  phase: Phase | undefined
}) {
  const hasMeals = meals.length > 0
  const save = (patch: Parameters<typeof upsertLog>[1]) => void upsertLog(date, patch)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DayCompleteToggle date={date} complete={log?.foodComplete === true} />
      </div>
      {hasMeals ? (
        <Card className="!p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="type-caption font-semibold text-[var(--app-ink)]">Totals from meals</span>
            <span className="type-caption text-[var(--app-muted)]">
              {meals.length}
              {phase ? ` / ${phase.mealsPerDay}` : ''} meal{meals.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MACRO_CHIPS.map((field) => {
              const value = log?.[field.key as keyof DailyLog] as number | null | undefined
              return (
                <span
                  key={field.key}
                  className="tabular radius-control px-2.5 py-1 type-caption font-semibold"
                  style={{ color: field.color, backgroundColor: `${field.color}1a` }}
                >
                  {value == null ? '—' : Math.round(value)}
                  {field.key === 'calories' ? ' kcal' : ` ${field.unit}`}
                </span>
              )
            })}
          </div>
        </Card>
      ) : (
        <>
          <NumberField
            label="Calories"
            value={log?.calories ?? null}
            unit="kcal"
            inputMode="numeric"
            {...(phase ? { target: `Target ${phase.calories}` } : {})}
            onCommit={(calories) => save({ calories })}
          />
          <NumberField
            label="Protein"
            value={log?.proteinG ?? null}
            unit="g"
            {...(phase ? { target: `Target ${phase.proteinG}` } : {})}
            onCommit={(proteinG) => save({ proteinG })}
          />
          <p className="px-1 type-caption leading-relaxed text-[var(--app-muted)]">
            Enter totals, or add a meal below to track this day item by item — meals fill these in for you.
          </p>
        </>
      )}

      <MealLogger date={date} />
      {hasMeals ? <MealTimeline meals={meals} /> : null}

      <IntakeExtras
        date={date}
        waterMl={log?.waterMl ?? null}
        waterTargetMl={waterTargetForWeight(log?.weightKg ?? phase?.startWeightKg ?? null)}
        caffeineMg={log?.caffeineMg ?? null}
        alcoholUnits={log?.alcoholUnits ?? null}
        sodiumMg={log?.sodiumMg ?? null}
        eatingWindow={computeEatingWindow(meals)}
      />
    </div>
  )
}
