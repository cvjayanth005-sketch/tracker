import { addWater, upsertLog } from '@/db/repo'
import { NumberField } from '@/components/fields'
import { Card, Meter } from '@/components/ui'
import type { LocalDate } from '@/domain/types'

const WATER_STEP_ML = 250
const MACRO_BLUE = '#4aa8ff'

/**
 * The cheap intake proxies — water, caffeine, alcohol, sodium — plus the eating
 * window. None need a wearable, and together they let the coach explain scale
 * moves and appetite. Water is tap-to-add; the rest are quick number entries.
 */
export function IntakeExtras({
  date,
  waterMl,
  waterTargetMl,
  caffeineMg,
  caffeineFromMealsMg,
  alcoholUnits,
  alcoholFromMealsUnits,
  sodiumMg,
  sodiumFromMealsMg,
  eatingWindow,
}: {
  date: LocalDate
  waterMl: number | null
  waterTargetMl: number
  caffeineMg: number | null
  caffeineFromMealsMg: number | null
  alcoholUnits: number | null
  alcoholFromMealsUnits: number | null
  sodiumMg: number | null
  sodiumFromMealsMg: number | null
  eatingWindow?: { firstMealTime: string; lastMealTime: string; windowHours: number } | null
}) {
  const save = (patch: Parameters<typeof upsertLog>[1]) => void upsertLog(date, patch)
  const saveIntakeTotal = (
    field: 'caffeineMg' | 'alcoholUnits' | 'sodiumMg',
    next: number | null,
    fromMeals: number | null,
  ) => {
    // The daily-log column is a manual addition. Meal estimates stay
    // attributable to their meal, and typing a total here adds only the amount
    // not already captured from meals. A user cannot accidentally erase the
    // caffeine or sodium attached to a logged coffee.
    const manual = next === null ? null : Math.max(0, next - (fromMeals ?? 0))
    save({ [field]: manual === null || manual <= 0.05 ? null : Math.round(manual * 10) / 10 })
  }
  const water = waterMl ?? 0
  const pct = waterTargetMl > 0 ? (water / waterTargetMl) * 100 : null

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="type-caption font-semibold text-[var(--app-ink)]">Hydration &amp; extras</span>
        {eatingWindow ? (
          <span className="tabular type-caption text-[var(--app-muted)]">
            Eating window {eatingWindow.firstMealTime}–{eatingWindow.lastMealTime} · {eatingWindow.windowHours}h
          </span>
        ) : null}
      </div>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="flex items-center gap-2 type-caption font-medium text-[var(--app-ink)]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MACRO_BLUE, boxShadow: `0 0 8px ${MACRO_BLUE}66` }} />
          Water
        </span>
        <span className="tabular type-caption text-[var(--app-ink-soft)]">
          <span className="font-semibold text-[var(--app-ink)]">{water}</span>
          <span className="text-[var(--app-muted)]"> / {waterTargetMl} ml</span>
        </span>
      </div>
      <div style={{ ['--tw-shadow-color' as string]: MACRO_BLUE }}>
        <Meter value={pct} tone="info" />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void addWater(date, WATER_STEP_ML)}
          className="flex-1 radius-control bg-[var(--app-inset)] py-2 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)]"
        >
          +250 ml
        </button>
        <button
          type="button"
          onClick={() => void addWater(date, WATER_STEP_ML * 2)}
          className="flex-1 radius-control bg-[var(--app-inset)] py-2 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)]"
        >
          +500 ml
        </button>
        <button
          type="button"
          onClick={() => void addWater(date, -WATER_STEP_ML)}
          disabled={water <= 0}
          className="radius-control bg-[var(--app-inset)] px-3 py-2 type-caption font-semibold text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)] disabled:opacity-40"
          aria-label="Remove 250 ml of water"
        >
          −
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <NumberField
          label="Caffeine"
          value={caffeineMg}
          unit="mg"
          inputMode="numeric"
          {...(caffeineFromMealsMg !== null ? { target: `${Math.round(caffeineFromMealsMg)} mg from logged meals` } : {})}
          onCommit={(next) => saveIntakeTotal('caffeineMg', next, caffeineFromMealsMg)}
        />
        <NumberField
          label="Alcohol"
          value={alcoholUnits}
          unit="units"
          {...(alcoholFromMealsUnits !== null ? { target: `${alcoholFromMealsUnits} from logged meals` } : {})}
          onCommit={(next) => saveIntakeTotal('alcoholUnits', next, alcoholFromMealsUnits)}
        />
        <NumberField
          label="Sodium"
          value={sodiumMg}
          unit="mg"
          inputMode="numeric"
          {...(sodiumFromMealsMg !== null ? { target: `${Math.round(sodiumFromMealsMg)} mg from logged meals` } : {})}
          onCommit={(next) => saveIntakeTotal('sodiumMg', next, sodiumFromMealsMg)}
        />
      </div>
    </Card>
  )
}
