import { Card } from '@/components/ui'
import { fmtInt } from '@/components/format'
import { estimateTdee, targetVsMaintenance, type TdeeConfidence } from '@/domain/metabolism'
import type { DailyLog, LocalDate } from '@/domain/types'

function ConfidenceBadge({ confidence }: { confidence: TdeeConfidence }) {
  const tone =
    confidence === 'high'
      ? 'bg-accent/12 text-accent'
      : confidence === 'medium'
        ? 'bg-info/12 text-info'
        : 'bg-warn/15 text-warn'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${tone}`}>
      {confidence} confidence
    </span>
  )
}

/**
 * Measured maintenance calories from intake + weight trend. Read-only and
 * advisory: it never changes the plan's target, only shows what the data says
 * and what the current target implies. Stays quiet until there's enough data.
 */
export function AdaptiveTDEE({
  today,
  logs,
  targetKcal,
}: {
  today: LocalDate
  logs: DailyLog[]
  targetKcal: number
}) {
  const result = estimateTdee(today, logs)

  if (result.status !== 'ok') {
    const { calorieDays, weightDays, needDays } = result
    return (
      <Card>
        <div className="text-sm font-semibold text-ink-50">Measured maintenance</div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
          Log calories and weigh-ins for about two weeks and I&apos;ll measure your real maintenance
          calories from the data — more accurate than any formula.
        </p>
        <div className="mt-3 flex gap-2 text-[11px] text-ink-500">
          <span className="rounded-lg bg-white/5 px-2 py-1 ring-1 ring-inset ring-white/10">
            Weigh-ins <span className="tabular font-semibold text-ink-200">{weightDays}</span>/{needDays}
          </span>
          <span className="rounded-lg bg-white/5 px-2 py-1 ring-1 ring-inset ring-white/10">
            Calorie days <span className="tabular font-semibold text-ink-200">{calorieDays}</span>/{needDays}
          </span>
        </div>
      </Card>
    )
  }

  const est = result.estimate
  const { dailyDeltaKcal, weeklyChangeKg } = targetVsMaintenance(targetKcal, est.tdeeKcal)
  const direction = dailyDeltaKcal < -50 ? 'loss' : dailyDeltaKcal > 50 ? 'gain' : 'maintenance'
  const deltaWord = direction === 'loss' ? 'under' : direction === 'gain' ? 'over' : 'at'

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-50">Measured maintenance</div>
          <div className="mt-0.5 text-[11px] text-ink-500">from your last {est.windowDays} days of intake + weight</div>
        </div>
        <ConfidenceBadge confidence={est.confidence} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="tabular-display text-3xl font-semibold leading-none text-accent">{fmtInt(est.tdeeKcal)}</span>
        <span className="text-[12px] text-ink-400">kcal/day</span>
        <span className="tabular ml-auto text-[11px] text-ink-500">
          range {fmtInt(est.lowKcal)}–{fmtInt(est.highKcal)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-white/5 px-2.5 py-2 ring-1 ring-inset ring-white/10">
          <div className="text-ink-500">Avg intake</div>
          <div className="tabular mt-0.5 font-semibold text-ink-100">{fmtInt(est.avgIntakeKcal)} kcal</div>
        </div>
        <div className="rounded-lg bg-white/5 px-2.5 py-2 ring-1 ring-inset ring-white/10">
          <div className="text-ink-500">Weight trend</div>
          <div className="tabular mt-0.5 font-semibold text-ink-100">
            {est.weightChangePerWeekKg > 0 ? '+' : ''}
            {est.weightChangePerWeekKg.toFixed(2)} kg/wk
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[12px] leading-relaxed text-ink-300 ring-1 ring-inset ring-white/8">
        Your <span className="font-semibold text-ink-100">{fmtInt(targetKcal)}</span> target is about{' '}
        <span className="font-semibold text-ink-100">{fmtInt(Math.abs(dailyDeltaKcal))} kcal/day {deltaWord}</span>{' '}
        maintenance
        {direction !== 'maintenance' ? (
          <>
            {' '}— roughly{' '}
            <span className="font-semibold text-ink-100">
              {Math.abs(weeklyChangeKg).toFixed(2)} kg/week {direction}
            </span>
          </>
        ) : null}
        . Estimated from your data and updates as you log; it doesn&apos;t change your plan.
      </div>
    </Card>
  )
}
