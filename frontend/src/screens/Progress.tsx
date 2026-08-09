import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allMeasurements, recentSessions } from '@/db/repo'
import { complianceFor, type MetricKey } from '@/domain/compliance'
import { addDays, formatShort } from '@/domain/date'
import { sessionVolume } from '@/domain/progression'
import { windowAverage } from '@/domain/trend'
import { useDashboard } from '@/hooks/useDashboard'
import { ActivityRings } from '@/components/ActivityRings'
import { TrendChart } from '@/components/TrendChart'
import {
  Card,
  EmptyState,
  Meter,
  PageHeader,
  Pill,
  SectionTitle,
  Stat,
} from '@/components/ui'
import { changeLabel, fmt, fmtInt, statInt, statVal } from '@/components/format'

const RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
] as const

const METRIC_LABEL: Record<MetricKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  steps: 'Steps',
  sleep: 'Sleep',
  meals: 'Meals',
  gym: 'Gym',
  run: 'Run',
}

export default function Progress() {
  const [rangeDays, setRangeDays] = useState<number>(30)
  const dash = useDashboard(rangeDays)
  const { today, phase, settings, index, change, review, compliance } = dash

  const measurements = useLiveQuery(() => allMeasurements(), [], [])
  const sessions = useLiveQuery(() => recentSessions(60), [], [])

  // Previous week's compliance, for a like-for-like comparison.
  const lastWeek = useMemo(
    () => (phase ? complianceFor(index, addDays(today, -7), phase) : undefined),
    [index, today, phase],
  )

  const waist = useMemo(() => {
    const withWaist = (measurements ?? []).filter((m) => m.waistCm !== null)
    const latest = withWaist.at(-1)
    const previous = withWaist.at(-2)
    return {
      latest: latest?.waistCm ?? null,
      delta:
        latest?.waistCm != null && previous?.waistCm != null
          ? latest.waistCm - previous.waistCm
          : null,
      date: latest?.date ?? null,
    }
  }, [measurements])

  const training = useMemo(() => {
    const since = addDays(today, -27)
    const recent = (sessions ?? []).filter((s) => s.workout.date >= since)
    const byWeek = [0, 1, 2, 3].map((w) => {
      const from = addDays(today, -(7 * (w + 1)) + 1)
      const to = addDays(today, -(7 * w))
      const inWeek = recent.filter((s) => s.workout.date >= from && s.workout.date <= to)
      return {
        label: w === 0 ? 'This week' : `${w + 1}w ago`,
        sessions: inWeek.length,
        volume: inWeek.reduce((sum, s) => sum + sessionVolume(s.sets), 0),
      }
    })
    return byWeek
  }, [sessions, today])

  if (!phase || !settings) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const e = dash.recommendation?.evidence

  return (
    <div className="pb-4">
      <PageHeader
        title="Progress"
        action={
          <div className="glass-inset flex gap-1 rounded-xl p-1">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setRangeDays(r.days)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  rangeDays === r.days
                    ? 'bg-white/12 text-ink-50 ring-1 ring-inset ring-white/12'
                    : 'text-ink-400'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <SectionTitle>Weight</SectionTitle>
      <Card refract>
        <TrendChart series={dash.series} targetKg={phase.targetWeightKg} height={260} />
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat
          label="Trend"
          value={statVal(change?.current.averageKg, 2)}
          unit="kg"
          sub={`${change?.current.readings ?? 0} weigh-ins`}
        />
        <Stat
          label="Per week"
          value={changeLabel(change?.lossKgPerWeek)}
          unit="kg"
          tone={
            change?.lossKgPerWeek == null
              ? 'default'
              : change.lossKgPerWeek >= settings.targetLossPerWeekMin &&
                  change.lossKgPerWeek <= settings.targetLossPerWeekMax
                ? 'good'
                : 'warn'
          }
        />
        <Stat
          label="Waist"
          value={statVal(waist.latest, 1)}
          unit="cm"
          sub={
            waist.delta != null
              ? `${waist.delta > 0 ? '+' : ''}${waist.delta.toFixed(1)} vs last`
              : waist.date
                ? formatShort(waist.date)
                : 'not measured'
          }
        />
      </div>

      <SectionTitle>This week at a glance</SectionTitle>
      <Card>
        <ActivityRings compliance={compliance} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
          Solid arc = logged and hit. Faded arc = logged and missed. Grey arc = never
          logged. A week you did not track shows as gaps rather than as a full ring.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-4">
        <div>
      <SectionTitle>Phase</SectionTitle>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug">{review?.headline}</h3>
          <Pill tone={review?.code === 'ready_for_review' ? 'good' : 'neutral'}>
            {phase.name}
          </Pill>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">{review?.detail}</p>
        {review && review.daysRequired > 0 ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-ink-400">
              <span>Hold under target</span>
              <span className="tabular">
                {review.daysHeld}/{review.daysRequired} days
              </span>
            </div>
            <Meter
              value={Math.min(review.daysHeld, review.daysRequired)}
              max={review.daysRequired}
              tone={review.code === 'ready_for_review' ? 'accent' : 'info'}
            />
          </div>
        ) : null}
      </Card>

        </div>

        <div>
      <SectionTitle
        action={
          <span className="tabular text-xs text-ink-400">
            {fmt(compliance?.overallHitRatePct ?? null, 0)}% · {fmt(compliance?.overallCoveragePct ?? null, 0)}% logged
          </span>
        }
      >
        Compliance this week
      </SectionTitle>
      <Card>
        <div className="space-y-2.5">
          {(Object.keys(METRIC_LABEL) as MetricKey[]).map((metric) => {
            const m = compliance?.metrics[metric]
            const prev = lastWeek?.metrics[metric]
            if (!m) return null
            if (m.eligibleDays === 0) {
              return (
                <div key={metric} className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-400">{METRIC_LABEL[metric]}</span>
                  <span className="text-ink-400">not scheduled</span>
                </div>
              )
            }
            return (
              <div key={metric}>
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span className="text-ink-200">{METRIC_LABEL[metric]}</span>
                  <span className="tabular text-ink-400">
                    {m.hitRatePct === null ? (
                      <span className="text-ink-400">not logged</span>
                    ) : (
                      <>
                        {Math.round(m.hitRatePct)}%
                        <span className="text-ink-600">
                          {' '}
                          · {m.knownDays}/{m.eligibleDays} logged
                        </span>
                        {prev?.hitRatePct != null && m.hitRatePct !== prev.hitRatePct ? (
                          <span
                            className={
                              m.hitRatePct > prev.hitRatePct ? 'text-accent' : 'text-ink-600'
                            }
                          >
                            {' '}
                            {m.hitRatePct > prev.hitRatePct ? '↑' : '↓'}
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
                <Meter
                  value={m.hitRatePct}
                  tone={
                    m.hitRatePct === null
                      ? 'info'
                      : m.hitRatePct >= settings.goodCompliancePct
                        ? 'accent'
                        : m.hitRatePct >= 50
                          ? 'warn'
                          : 'alert'
                  }
                />
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
          Hit rate counts only the days you logged. The second number is how much of the
          week was logged at all — a high hit rate on low coverage is not a good week, and
          the rules engine treats it as unknown rather than good.
        </p>
      </Card>

        </div>
        </div>

        <div className="space-y-4">
        <div>
      <SectionTitle>Nutrition &amp; activity averages</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Stat
          label="Calories"
          value={statInt(dash.weekAverages?.calories)}
          unit="kcal"
          sub={`target ${phase.calories}`}
        />
        <Stat
          label="Protein"
          value={statInt(dash.weekAverages?.protein)}
          unit="g"
          sub={`target ${phase.proteinG}`}
        />
        <Stat
          label="Steps"
          value={statInt(dash.weekAverages?.steps)}
          sub={`target ${phase.steps.toLocaleString()}`}
        />
        <Stat
          label="Sleep"
          value={statVal(dash.weekAverages?.sleep, 1)}
          unit="h"
          sub={`target ${phase.sleepHours}`}
        />
        <Stat
          label="Run volume"
          value={statVal(dash.weekAverages?.runKmTotal, 1)}
          unit="km"
          sub="last 7 days"
        />
        <Stat
          label="Energy"
          value={statVal(windowAverage(index, today, (l) => l.energy).average, 1)}
          unit="/5"
          sub="last 7 days"
        />
      </div>

        </div>

        <div>
      <SectionTitle>Training</SectionTitle>
      <Card>
        <div className="space-y-2">
          {training.map((week) => (
            <div key={week.label} className="flex items-center justify-between text-[13px]">
              <span className="text-ink-300">{week.label}</span>
              <span className="tabular text-ink-200">
                {week.sessions} session{week.sessions === 1 ? '' : 's'}
                <span className="text-ink-600"> · {fmtInt(week.volume)} kg·reps</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

        </div>

      {e ? (
        <div>
          <SectionTitle>The working</SectionTitle>
          <Card>
            <p className="mb-3 text-[12px] leading-relaxed text-ink-400">
              Every number the recommendation engine used to reach{' '}
              <span className="text-ink-200">
                &ldquo;{dash.recommendation?.headline}&rdquo;
              </span>
              . Nothing here comes from the AI.
            </p>
            <dl className="glass-inset-deep grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl p-3.5 text-[12px]">
              <Row label="Loss rate" value={`${fmt(e.lossKgPerWeek, 2)} kg/wk`} />
              <Row label="Trend weight" value={`${fmt(e.trendWeightKg, 2)} kg`} />
              <Row label="Previous week" value={`${fmt(e.previousTrendWeightKg, 2)} kg`} />
              <Row label="Weigh-ins" value={`${e.weightReadings}/7`} />
              <Row label="Plateau weeks" value={String(e.plateauWeeks)} />
              <Row label="Adherence" value={e.adherence} />
              <Row label="Compliance" value={`${fmt(e.overallHitRatePct, 0)}%`} />
              <Row label="Coverage" value={`${fmt(e.overallCoveragePct, 0)}%`} />
              <Row
                label="Cuts this phase"
                value={`${e.cutsAppliedThisPhase}/${e.maxCutsPerPhase}`}
              />
              <Row label="Calorie floor" value={`${e.calorieFloor} kcal`} />
              {e.recoveryConcern ? (
                <Row
                  label="Recovery flag"
                  value={`${e.recoveryConcern.reason.replace(/_/g, ' ')} (${fmt(
                    e.recoveryConcern.averageValue,
                    1,
                  )})`}
                />
              ) : null}
              <div className="col-span-2 mt-1 text-[10px] text-ink-600">
                rules v{dash.recommendation?.rulesVersion}
              </div>
            </dl>
          </Card>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-400">{label}</dt>
      <dd className="tabular text-right text-ink-200">{value}</dd>
    </>
  )
}
