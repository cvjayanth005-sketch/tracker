import { Card } from '@/components/ui'
import { fmtInt } from '@/components/format'
import type { FoodContext } from '@/domain/foodContext'
import { MacroLegend, MacroRings, type MacroTotals } from './MacroRings'

/** Today's macro rings + legend, driven by the shared food context. */
export function MacroSummary({ food }: { food: FoodContext }) {
  const { today, targets, macroTargets } = food
  const totals: MacroTotals = {
    calories: today.calories,
    proteinG: today.proteinG,
    carbsG: today.carbsG,
    fatG: today.fatG,
  }
  const remaining = today.caloriesRemaining
  const over = remaining !== null && remaining < 0

  return (
    <Card>
      <div className="grid items-center gap-5 sm:grid-cols-[12rem_1fr]">
        <div className="mx-auto">
          <MacroRings
            totals={totals}
            targets={macroTargets}
            size={188}
            center={
              today.calories === null ? (
                <>
                  <div className="text-sm font-semibold text-ink-300">No food yet</div>
                  <div className="mt-1 text-[11px] text-ink-500">{targets.calories.toLocaleString()} kcal</div>
                </>
              ) : (
                <>
                  <div className="tabular text-[26px] font-semibold leading-none text-ink-50">{fmtInt(today.calories)}</div>
                  <div className="mt-1 text-[10px] text-ink-500">of {targets.calories.toLocaleString()} kcal</div>
                  <div
                    className={`mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      over ? 'bg-alert/15 text-alert' : 'bg-accent/15 text-accent'
                    }`}
                  >
                    {over ? `${Math.abs(remaining ?? 0)} over` : `${remaining} left`}
                  </div>
                </>
              )
            }
          />
        </div>
        <div>
          <MacroLegend totals={totals} targets={macroTargets} />
          {today.fiberG !== null || today.mealCount > 0 ? (
            <div className="mt-3.5 border-t border-white/8 pt-3 text-[11px] text-ink-500">
              {today.fiberG !== null ? (
                <>
                  Fiber <span className="font-semibold text-ink-300">{Math.round(today.fiberG)} g</span> ·{' '}
                </>
              ) : null}
              {today.mealCount} meal{today.mealCount === 1 ? '' : 's'} logged
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
