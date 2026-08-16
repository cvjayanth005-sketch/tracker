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
import { Card } from '@/components/ui'
import { fmtInt } from '@/components/format'
import { addDays, formatShort, weekdayName } from '@/domain/date'
import type { DailyLog, LocalDate } from '@/domain/types'
import { MACRO, type MacroKey } from './palette'

const FIELD: Record<MacroKey, keyof DailyLog> = {
  calories: 'calories',
  protein: 'proteinG',
  carbs: 'carbsG',
  fat: 'fatG',
}

function FoodAreaChart({
  macro,
  data,
  target,
}: {
  macro: MacroKey
  data: Array<{ date: LocalDate; day: string; value: number | null }>
  target?: number
}) {
  const meta = MACRO[macro]
  const known = data.filter((point) => point.value !== null)
  const average = known.length === 0 ? null : known.reduce((sum, p) => sum + (p.value ?? 0), 0) / known.length
  const gradientId = `food-${macro}`
  const maxValue = Math.max(1, target ?? 0, ...known.map((p) => p.value ?? 0))
  const domainMax = Math.ceil(maxValue * 1.18)

  return (
    <Card className="overflow-hidden !p-0">
      <div className="flex items-start justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color, boxShadow: `0 0 12px ${meta.glow}` }} />
          <div>
            <div className="text-sm font-semibold text-[var(--app-ink)]">{meta.label}</div>
            <div className="mt-0.5 text-[11px] text-[var(--app-muted)]">
              {known.length}/7 logged{target ? ` · target ${target.toLocaleString()} ${meta.unit}` : ''}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-xl font-semibold leading-none text-[var(--app-ink)]">
            {fmtInt(average)}
            <span className="ml-1 text-[11px] font-normal text-[var(--app-muted)]">{meta.unit}</span>
          </div>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--app-muted)]">7-day avg</div>
        </div>
      </div>

      <div className="mt-2 h-40 w-full px-1">
        {known.length === 0 ? (
          <div className="m-4 flex h-28 flex-col items-center justify-center radius-control border border-dashed border-[var(--app-line)] text-center">
            <div className="text-[13px] font-medium text-[var(--app-ink-soft)]">No {meta.label.toLowerCase()} logged</div>
            <div className="mt-1 text-[11px] text-[var(--app-muted)]">Your weekly trend appears here.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 14, bottom: 2, left: -12 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.color} stopOpacity={0.3} />
                  <stop offset="72%" stopColor={meta.color} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.07)" strokeDasharray="2 7" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#8888aa', fontSize: 10, fontWeight: 600 }}
                tickMargin={10}
                interval={0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#5a5a80', fontSize: 10 }}
                width={40}
                domain={[0, domainMax]}
                tickCount={4}
              />
              {target ? (
                <ReferenceLine
                  y={target}
                  stroke="rgb(240 240 255 / 0.4)"
                  strokeDasharray="5 6"
                  label={{ value: 'GOAL', position: 'insideTopRight', fill: '#8888aa', fontSize: 9, fontWeight: 700 }}
                />
              ) : null}
              <Tooltip
                cursor={{ stroke: 'rgb(255 255 255 / 0.18)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const item = payload?.[0]?.payload as { date: LocalDate; value: number | null } | undefined
                  if (!active || !item) return null
                  return (
                    <div className="radius-control border border-[var(--app-line)] bg-[var(--app-ink-raised)]/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
                      <div className="text-[10px] font-semibold uppercase text-[var(--app-muted)]">
                        {weekdayName(item.date)} · {formatShort(item.date)}
                      </div>
                      <div className="tabular mt-1 text-sm font-semibold text-[var(--app-ink)]">
                        {item.value === null ? 'Not logged' : `${Math.round(item.value)} ${meta.unit}`}
                      </div>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                connectNulls={false}
                stroke={meta.color}
                strokeWidth={3}
                fill={`url(#${gradientId})`}
                dot={{ r: 3, fill: '#08080d', stroke: meta.color, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: meta.color, stroke: '#08080d', strokeWidth: 3 }}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/** 7-day area charts for each macro, targets shown where the phase defines one. */
export function MacroTrends({
  today,
  logs,
  calorieTarget,
  proteinTarget,
}: {
  today: LocalDate
  logs: DailyLog[]
  calorieTarget: number
  proteinTarget: number
}) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)))
  const byDate = new Map(logs.map((log) => [log.date, log]))
  const series = (macro: MacroKey) =>
    dates.map((date) => ({
      date,
      day: formatShort(date),
      value: (byDate.get(date)?.[FIELD[macro]] as number | null | undefined) ?? null,
    }))

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <FoodAreaChart macro="calories" data={series('calories')} target={calorieTarget} />
      <FoodAreaChart macro="protein" data={series('protein')} target={proteinTarget} />
      <FoodAreaChart macro="carbs" data={series('carbs')} />
      <FoodAreaChart macro="fat" data={series('fat')} />
    </div>
  )
}
