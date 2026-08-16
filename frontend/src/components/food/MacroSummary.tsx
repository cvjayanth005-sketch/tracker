import { Card } from '@/components/ui'
import { fmtInt } from '@/components/format'
import { weekdayName, formatShort } from '@/domain/date'
import type { ConsistencyStrip, FoodContext } from '@/domain/foodContext'
import { MacroLegend, MacroRings, type MacroTotals } from './MacroRings'
import { SUBMACRO } from './palette'

const ON_COLOR = '#39ff14'

/** Trailing adherence dots + current streak — fills the card and rewards consistency. */
function ConsistencyRow({ strip }: { strip: ConsistencyStrip }) {
  return (
    <div className="mt-4 border-t border-[var(--app-line)] pt-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-muted)]">
          Last {strip.days.length} days
        </span>
        {strip.streak > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/20">
            🔥 {strip.streak}-day streak
          </span>
        ) : (
          <span className="text-[11px] text-[var(--app-muted)]">Hit calories + protein to build a streak</span>
        )}
      </div>
      <div className="flex items-center gap-[5px]">
        {strip.days.map((day) => {
          const title = `${weekdayName(day.date)} ${formatShort(day.date)} — ${
            day.status === 'on' ? 'on target' : day.status === 'off' ? 'missed' : 'not logged'
          }`
          return (
            <span
              key={day.date}
              title={title}
              className="h-2.5 flex-1 rounded-full"
              style={
                day.status === 'on'
                  ? { backgroundColor: ON_COLOR, boxShadow: `0 0 8px ${ON_COLOR}66` }
                  : day.status === 'off'
                    ? { backgroundColor: 'rgb(255 255 255 / 0.16)' }
                    : { boxShadow: 'inset 0 0 0 1.5px rgb(255 255 255 / 0.12)' }
              }
            />
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--app-muted)]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ON_COLOR }} /> on target
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--app-inset)]" /> missed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full ring-1 ring-inset ring-[var(--app-line)]" /> not logged
        </span>
      </div>
    </div>
  )
}

/** Today's macro rings + legend, driven by the shared food context. */
export function MacroSummary({ food, consistency }: { food: FoodContext; consistency?: ConsistencyStrip }) {
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
                  <div className="text-sm font-semibold text-[var(--app-ink-soft)]">No food yet</div>
                  <div className="mt-1 text-[11px] text-[var(--app-muted)]">{targets.calories.toLocaleString()} kcal</div>
                </>
              ) : (
                <>
                  <div className="tabular text-[26px] font-semibold leading-none text-[var(--app-ink)]">{fmtInt(today.calories)}</div>
                  <div className="mt-1 text-[10px] text-[var(--app-muted)]">of {targets.calories.toLocaleString()} kcal</div>
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
          {today.fiberG !== null || today.sugarG !== null || today.satFatG !== null || today.mealCount > 0 ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[var(--app-line)] pt-3 text-[11px] text-[var(--app-muted)]">
              {today.fiberG !== null ? (
                <span>
                  Fiber <span className="font-semibold text-[var(--app-ink-soft)]">{Math.round(today.fiberG)} g</span>
                </span>
              ) : null}
              {today.sugarG !== null ? (
                <span>
                  Sugar <span className="font-semibold" style={{ color: SUBMACRO.sugarG.color }}>{Math.round(today.sugarG)} g</span>
                </span>
              ) : null}
              {today.satFatG !== null ? (
                <span>
                  Sat fat <span className="font-semibold" style={{ color: SUBMACRO.satFatG.color }}>{Math.round(today.satFatG)} g</span>
                </span>
              ) : null}
              <span className="text-[var(--app-muted)]">·</span>
              <span>
                {today.mealCount} meal{today.mealCount === 1 ? '' : 's'} logged
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {consistency ? <ConsistencyRow strip={consistency} /> : null}
    </Card>
  )
}
