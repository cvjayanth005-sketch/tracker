import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatShort, weekdayName } from '@/domain/date'
import type { SleepScore } from '@/domain/sleep'
import type { DailyLog, LocalDate } from '@/domain/types'
import { Card, Pill } from '@/components/ui'

function scoreTone(score: number | null): 'neutral' | 'good' | 'warn' | 'bad' | 'info' {
  if (score == null) return 'neutral'
  if (score >= 85) return 'good'
  if (score >= 70) return 'info'
  if (score >= 50) return 'warn'
  return 'bad'
}

function componentText(value: number | null, fallback = 'Not logged') {
  return value == null ? fallback : `${Math.round(value)}%`
}

export function SleepScoreCard({
  log,
  score,
  scores,
  targetHours,
}: {
  log: DailyLog | undefined
  score: SleepScore
  scores: Array<{ date: LocalDate; result: SleepScore | undefined }>
  targetHours: number
}) {
  const chartData = scores.map(({ date, result }) => ({
    date,
    day: formatShort(date).slice(0, 5),
    score: result?.score ?? null,
  }))
  const known = chartData.filter((night) => night.score != null)
  const ringStyle =
    score.score == null
      ? undefined
      : { background: `conic-gradient(#00f0ff ${score.score}%, rgb(255 255 255 / 0.09) 0)` }

  return (
    <Card className="flex min-h-[29rem] flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-info">Sleep score</div>
          <div className="mt-1 text-xl font-semibold text-ink-50">Last night&apos;s recovery</div>
        </div>
        <Pill tone={scoreTone(score.score)}>{score.score == null ? 'Needs check-in' : `${score.confidence} confidence`}</Pill>
      </div>

      {score.score == null ? (
        <div className="mt-5 flex min-h-44 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.025] px-6 text-center">
          <div className="text-lg font-semibold text-ink-100">No score yet</div>
          <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-ink-400">
            Log sleep hours and a quality rating in Today to create a recovery score. Your optional timing and wake-ups sharpen it over time.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-[8.25rem_minmax(0,1fr)] items-center gap-4">
            <div className="relative mx-auto grid h-32 w-32 place-items-center rounded-full p-2" style={ringStyle}>
              <div className="grid h-full w-full place-items-center rounded-full bg-ink-950 text-center shadow-inner">
                <div>
                  <div className="tabular text-4xl font-semibold leading-none text-ink-50">{score.score}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">out of 100</div>
                </div>
              </div>
            </div>
            <div>
              <div className="text-lg font-semibold text-ink-50">{score.label}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
                {log?.sleepHours ?? '—'}h against a {targetHours}h target · quality {log?.sleepQuality ?? '—'}/5
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div><span className="text-ink-500">Duration</span><span className="float-right tabular font-semibold text-ink-200">{componentText(score.durationScore)}</span></div>
                <div><span className="text-ink-500">Quality</span><span className="float-right tabular font-semibold text-ink-200">{componentText(score.qualityScore)}</span></div>
                <div><span className="text-ink-500">Rhythm</span><span className="float-right tabular font-semibold text-ink-200">{componentText(score.consistencyScore, 'Learning')}</span></div>
                <div><span className="text-ink-500">Wake-ups</span><span className="float-right tabular font-semibold text-ink-200">{componentText(score.awakeningsScore)}</span></div>
              </div>
            </div>
          </div>

          <div className="mt-5 h-40 min-h-40 border-t border-white/8 pt-4">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-medium text-ink-400">Seven-night trend</span>
              <span className="tabular text-ink-500">{known.length}/7 scored</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 2, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="sleep-score-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.36} />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.07)" strokeDasharray="2 7" />
                <ReferenceLine y={80} stroke="rgb(255 255 255 / 0.24)" strokeDasharray="4 6" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#8888aa', fontSize: 10, fontWeight: 600 }} interval={0} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ stroke: 'rgb(255 255 255 / 0.16)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const night = payload?.[0]?.payload as { date: LocalDate; score: number | null } | undefined
                    if (!active || !night) return null
                    return (
                      <div className="rounded-xl border border-white/12 bg-ink-900/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
                        <div className="text-[10px] font-semibold uppercase text-ink-400">{weekdayName(night.date)} · {formatShort(night.date)}</div>
                        <div className="mt-1 tabular text-sm font-semibold text-ink-50">{night.score == null ? 'No complete check-in' : `${night.score}/100`}</div>
                      </div>
                    )
                  }}
                />
                <Area type="monotone" dataKey="score" connectNulls={false} stroke="#00f0ff" strokeWidth={3} fill="url(#sleep-score-fill)" dot={{ r: 3, fill: '#08080d', stroke: '#00f0ff', strokeWidth: 2 }} activeDot={{ r: 4, fill: '#00f0ff', stroke: '#08080d', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  )
}
