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
    <span className={`rounded-full px-2 py-0.5 type-caption font-semibold capitalize ${tone}`}>
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
        <div className="type-caption font-semibold text-[var(--app-ink)]">Measured maintenance</div>
        <p className="mt-1 type-caption leading-relaxed text-[var(--app-muted)]">
          Log calories and weigh-ins for about two weeks and I&apos;ll measure your real maintenance
          calories from the data — more accurate than any formula.
        </p>
        <div className="mt-3 flex gap-2 type-caption text-[var(--app-muted)]">
          <span className="radius-control bg-[var(--app-inset)] px-2 py-1 ring-1 ring-inset ring-[var(--app-line)]">
            Weigh-ins <span className="tabular font-semibold text-[var(--app-ink)]">{weightDays}</span>/{needDays}
          </span>
          <span className="radius-control bg-[var(--app-inset)] px-2 py-1 ring-1 ring-inset ring-[var(--app-line)]">
            Calorie days <span className="tabular font-semibold text-[var(--app-ink)]">{calorieDays}</span>/{needDays}
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
          <div className="type-caption font-semibold text-[var(--app-ink)]">Measured maintenance</div>
          <div className="mt-0.5 type-caption text-[var(--app-muted)]">from your last {est.windowDays} days of intake + weight</div>
        </div>
        <ConfidenceBadge confidence={est.confidence} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="tabular-display type-heading leading-none text-accent">{fmtInt(est.tdeeKcal)}</span>
        <span className="type-caption text-[var(--app-muted)]">kcal/day</span>
        <span className="tabular ml-auto type-caption text-[var(--app-muted)]">
          range {fmtInt(est.lowKcal)}–{fmtInt(est.highKcal)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 type-caption">
        <div className="radius-control bg-[var(--app-inset)] px-2.5 py-2 ring-1 ring-inset ring-[var(--app-line)]">
          <div className="text-[var(--app-muted)]">Avg intake</div>
          <div className="tabular mt-0.5 font-semibold text-[var(--app-ink)]">{fmtInt(est.avgIntakeKcal)} kcal</div>
        </div>
        <div className="radius-control bg-[var(--app-inset)] px-2.5 py-2 ring-1 ring-inset ring-[var(--app-line)]">
          <div className="text-[var(--app-muted)]">Weight trend</div>
          <div className="tabular mt-0.5 font-semibold text-[var(--app-ink)]">
            {est.weightChangePerWeekKg > 0 ? '+' : ''}
            {est.weightChangePerWeekKg.toFixed(2)} kg/wk
          </div>
        </div>
      </div>

      <div className="mt-3 radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption leading-relaxed text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)]">
        Your <span className="font-semibold text-[var(--app-ink)]">{fmtInt(targetKcal)}</span> target is about{' '}
        <span className="font-semibold text-[var(--app-ink)]">{fmtInt(Math.abs(dailyDeltaKcal))} kcal/day {deltaWord}</span>{' '}
        maintenance
        {direction !== 'maintenance' ? (
          <>
            {' '}— roughly{' '}
            <span className="font-semibold text-[var(--app-ink)]">
              {Math.abs(weeklyChangeKg).toFixed(2)} kg/week {direction}
            </span>
          </>
        ) : null}
        . Estimated from your data and updates as you log; it doesn&apos;t change your plan.
      </div>
    </Card>
  )
}
