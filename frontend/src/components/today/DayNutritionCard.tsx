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
          <div className="tabular mt-1 text-xl font-semibold text-ink-50">
            {waterMl === null ? <span className="text-ink-600">—</span> : fmtInt(waterMl)}
            <span className="ml-1 text-xs font-normal text-ink-400">
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
              className="min-h-11 rounded-xl bg-white/8 px-3 text-[12px] font-semibold text-ink-100 ring-1 ring-inset ring-white/10 transition-colors active:bg-white/14"
            >
              +{delta} ml
            </button>
          ))}
          <button
            type="button"
            onClick={() => void addWater(date, -250)}
            disabled={waterMl === null || waterMl <= 0}
            className="min-h-11 rounded-xl bg-white/8 px-3 text-[12px] font-semibold text-ink-300 ring-1 ring-inset ring-white/10 transition-colors active:bg-white/14 disabled:opacity-40"
          >
            -250 ml
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/8 pt-4">
        <Stat label="Fiber" value={statInt(fiberG)} unit="g" />
        <Stat label="Sugar" value={statInt(sugarG)} unit="g" />
        <Stat label="Saturated fat" value={statInt(satFatG)} unit="g" />
      </div>

      <div className="mt-4 border-t border-white/8 pt-4">
        <div className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          Micronutrients
        </div>
        <MicroDaySummary micros={micros} />
      </div>
    </Card>
  )
}
