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
  alcoholUnits,
  sodiumMg,
  eatingWindow,
}: {
  date: LocalDate
  waterMl: number | null
  waterTargetMl: number
  caffeineMg: number | null
  alcoholUnits: number | null
  sodiumMg: number | null
  eatingWindow?: { firstMealTime: string; lastMealTime: string; windowHours: number } | null
}) {
  const save = (patch: Parameters<typeof upsertLog>[1]) => void upsertLog(date, patch)
  const water = waterMl ?? 0
  const pct = waterTargetMl > 0 ? (water / waterTargetMl) * 100 : null

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink-100">Hydration &amp; extras</span>
        {eatingWindow ? (
          <span className="tabular text-[11px] text-ink-500">
            Eating window {eatingWindow.firstMealTime}–{eatingWindow.lastMealTime} · {eatingWindow.windowHours}h
          </span>
        ) : null}
      </div>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-[12px] font-medium text-ink-200">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MACRO_BLUE, boxShadow: `0 0 8px ${MACRO_BLUE}66` }} />
          Water
        </span>
        <span className="tabular text-[12px] text-ink-300">
          <span className="font-semibold text-ink-50">{water}</span>
          <span className="text-ink-500"> / {waterTargetMl} ml</span>
        </span>
      </div>
      <div style={{ ['--tw-shadow-color' as string]: MACRO_BLUE }}>
        <Meter value={pct} tone="info" />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void addWater(date, WATER_STEP_ML)}
          className="flex-1 rounded-xl bg-white/8 py-2 text-[12px] font-semibold text-ink-100 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/12"
        >
          +250 ml
        </button>
        <button
          type="button"
          onClick={() => void addWater(date, WATER_STEP_ML * 2)}
          className="flex-1 rounded-xl bg-white/8 py-2 text-[12px] font-semibold text-ink-100 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/12"
        >
          +500 ml
        </button>
        <button
          type="button"
          onClick={() => void addWater(date, -WATER_STEP_ML)}
          disabled={water <= 0}
          className="rounded-xl bg-white/8 px-3 py-2 text-[12px] font-semibold text-ink-300 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/12 disabled:opacity-40"
          aria-label="Remove 250 ml of water"
        >
          −
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <NumberField label="Caffeine" value={caffeineMg} unit="mg" inputMode="numeric" onCommit={(v) => save({ caffeineMg: v })} />
        <NumberField label="Alcohol" value={alcoholUnits} unit="units" onCommit={(v) => save({ alcoholUnits: v })} />
        <NumberField label="Sodium" value={sodiumMg} unit="mg" inputMode="numeric" onCommit={(v) => save({ sodiumMg: v })} />
      </div>
    </Card>
  )
}
