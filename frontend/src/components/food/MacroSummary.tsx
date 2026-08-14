import { Card, Meter } from '@/components/ui'
import { fmtInt } from '@/components/format'
import type { FoodContext } from '@/domain/foodContext'
import { MACRO, type MacroKey } from './palette'

/** Single sweeping calorie ring with the remaining amount in the middle. */
function CalorieRing({ consumed, target }: { consumed: number | null; target: number }) {
  const size = 168
  const stroke = 15
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = consumed === null ? 0 : Math.min(1, target > 0 ? consumed / target : 0)
  const over = consumed !== null && consumed > target
  const color = over ? '#ff5470' : MACRO.calories.color
  const remaining = consumed === null ? null : Math.round(target - consumed)

  return (
    <div className="relative mx-auto h-44 w-44 shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.6s ease-out', filter: `drop-shadow(0 0 6px ${MACRO.calories.glow})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {consumed === null ? (
          <>
            <div className="text-sm font-semibold text-ink-300">No food yet</div>
            <div className="mt-1 text-[11px] text-ink-500">{target.toLocaleString()} kcal target</div>
          </>
        ) : (
          <>
            <div className="tabular text-3xl font-semibold leading-none text-ink-50">{fmtInt(consumed)}</div>
            <div className="mt-1 text-[11px] text-ink-500">of {target.toLocaleString()} kcal</div>
            <div
              className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                over ? 'bg-alert/15 text-alert' : 'bg-accent/15 text-accent'
              }`}
            >
              {over ? `${Math.abs(remaining ?? 0)} over` : `${remaining} left`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MacroBar({
  macro,
  grams,
  target,
  sharePct,
}: {
  macro: MacroKey
  grams: number | null
  target?: number
  sharePct?: number
}) {
  const meta = MACRO[macro]
  const meterTone = macro === 'protein' ? 'info' : macro === 'fat' ? 'warn' : 'accent'
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-200">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color, boxShadow: `0 0 10px ${meta.glow}` }} />
          {meta.label}
          {sharePct !== undefined ? <span className="text-[10px] text-ink-500">{sharePct}%</span> : null}
        </span>
        <span className="tabular text-[12px] text-ink-300">
          <span className="font-semibold text-ink-50">{grams === null ? '—' : Math.round(grams)}</span>
          {target ? <span className="text-ink-500"> / {target} g</span> : ' g'}
        </span>
      </div>
      <div style={{ ['--tw-shadow-color' as string]: meta.color }}>
        <Meter value={grams === null ? null : target ? (grams / target) * 100 : Math.min(100, grams)} tone={meterTone} />
      </div>
    </div>
  )
}

/** Today's calorie ring and macro breakdown, driven by the shared food context. */
export function MacroSummary({ food }: { food: FoodContext }) {
  const { today, targets } = food
  const split = today.macroSplitPct
  return (
    <Card>
      <div className="grid items-center gap-5 sm:grid-cols-[11rem_1fr]">
        <CalorieRing consumed={today.calories} target={targets.calories} />
        <div className="space-y-3.5">
          <MacroBar
            macro="protein"
            grams={today.proteinG}
            target={targets.proteinG}
            {...(split ? { sharePct: split.proteinPct } : {})}
          />
          <MacroBar
            macro="carbs"
            grams={today.carbsG}
            {...(split ? { sharePct: split.carbsPct } : {})}
          />
          <MacroBar
            macro="fat"
            grams={today.fatG}
            {...(split ? { sharePct: split.fatPct } : {})}
          />
          {today.fiberG !== null ? (
            <div className="pt-0.5 text-[11px] text-ink-500">
              Fiber <span className="font-semibold text-ink-300">{Math.round(today.fiberG)} g</span> ·{' '}
              {today.mealCount} meal{today.mealCount === 1 ? '' : 's'} logged
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
