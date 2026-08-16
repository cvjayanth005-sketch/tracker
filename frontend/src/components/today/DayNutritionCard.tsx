import { MicroDaySummary } from '@/components/food/micros'
import { fmtInt, statInt } from '@/components/format'
import { Card, Stat } from '@/components/ui'
import { addWater } from '@/db/repo'
import type { LocalDate } from '@/domain/types'

export function DayNutritionCard({
  date,
  waterMl,
  waterTargetMl,
  fiberG,
  sugarG,
  satFatG,
  micros,
}: {
  date: LocalDate
  waterMl: number | null
  waterTargetMl: number
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  micros: Record<string, number> | null
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-info">Water</div>
          <div className="tabular mt-1 text-xl font-semibold text-[var(--app-ink)]">
            {waterMl === null ? <span className="text-[var(--app-muted)]">—</span> : fmtInt(waterMl)}
            <span className="ml-1 text-xs font-normal text-[var(--app-muted)]">
              / {fmtInt(waterTargetMl)} ml
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[250, 500].map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => void addWater(date, delta)}
              className="min-h-11 radius-control bg-[var(--app-inset)] px-3 text-[12px] font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors active:bg-[var(--app-inset)]"
            >
              +{delta} ml
            </button>
          ))}
          <button
            type="button"
            onClick={() => void addWater(date, -250)}
            disabled={waterMl === null || waterMl <= 0}
            className="min-h-11 radius-control bg-[var(--app-inset)] px-3 text-[12px] font-semibold text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)] transition-colors active:bg-[var(--app-inset)] disabled:opacity-40"
          >
            -250 ml
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--app-line)] pt-4">
        <Stat label="Fiber" value={statInt(fiberG)} unit="g" />
        <Stat label="Sugar" value={statInt(sugarG)} unit="g" />
        <Stat label="Saturated fat" value={statInt(satFatG)} unit="g" />
      </div>

      <div className="mt-4 border-t border-[var(--app-line)] pt-4">
        <div className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">
          Micronutrients
        </div>
        <MicroDaySummary micros={micros} />
      </div>
    </Card>
  )
}
