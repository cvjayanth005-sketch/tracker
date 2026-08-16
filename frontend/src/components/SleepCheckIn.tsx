import { useEffect, useRef, useState } from 'react'
import { Card, Pill } from '@/components/ui'
import type { SleepScore } from '@/domain/sleep'
import type { DailyLog, NightAwakenings, Rating } from '@/domain/types'

const COMMIT_DELAY_MS = 500
const AWAKENING_OPTIONS: NightAwakenings[] = [0, 1, 2, 3, 4]

function SleepHoursField({
  value,
  targetHours,
  onCommit,
}: {
  value: number | null
  targetHours: number
  onCommit: (next: number | null) => void
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) setText(value == null ? '' : String(value))
  }, [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (raw: string) => {
    const parsed = Number(raw)
    if (raw.trim() === '') onCommit(null)
    else if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 24) onCommit(parsed)
    dirty.current = false
  }

  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        Sleep hours <span className="normal-case tracking-normal text-ink-500">target {targetHours}h</span>
      </span>
      <div className="flex h-11 items-center rounded-xl bg-black/25 px-3 ring-1 ring-inset ring-white/10 focus-within:ring-info/60">
        <input
          id="today-log-sleep"
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          max="24"
          value={text}
          placeholder="—"
          onChange={(event) => {
            const raw = event.target.value
            setText(raw)
            dirty.current = true
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => commit(raw), COMMIT_DELAY_MS)
          }}
          onBlur={(event) => {
            window.clearTimeout(timer.current)
            commit(event.target.value)
          }}
          className="tabular min-w-0 flex-1 bg-transparent text-right text-base font-semibold text-ink-50 outline-none placeholder:font-normal placeholder:text-ink-600"
        />
        <span className="ml-1 text-xs text-ink-400">h</span>
      </div>
    </label>
  )
}

function optionClass(active: boolean, tone: 'info' | 'accent' = 'info') {
  if (active) {
    return tone === 'accent'
      ? 'bg-accent text-ink-950 shadow-[0_8px_22px_-12px] shadow-accent/80'
      : 'bg-info text-ink-950 shadow-[0_8px_22px_-12px] shadow-info/70'
  }
  return 'bg-black/25 text-ink-400 ring-1 ring-inset ring-white/10 active:bg-white/8'
}

export function SleepCheckIn({
  log,
  targetHours,
  score,
  onSave,
}: {
  log: DailyLog | undefined
  targetHours: number
  score: SleepScore
  onSave: (patch: Partial<DailyLog>) => void
}) {
  const tone = score.score == null ? 'neutral' : score.score >= 70 ? 'good' : score.score >= 50 ? 'warn' : 'bad'

  return (
    <Card className="mt-4 overflow-hidden lg:mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-info">Last night</div>
          {/* Semantic h2: card titles built as divs silently miss the heading face. */}
          <h2 className="mt-1 text-lg font-semibold text-ink-50">Morning sleep check-in</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="tabular-display text-2xl font-semibold leading-none text-ink-50">
              {score.score ?? '—'}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              Sleep score
            </div>
          </div>
          <Pill tone={tone}>{score.score == null ? 'Needs core data' : score.label}</Pill>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(8rem,.7fr)_minmax(12rem,1fr)_minmax(8rem,.65fr)_minmax(8rem,.65fr)_minmax(13rem,1fr)] md:items-end">
        <SleepHoursField
          value={log?.sleepHours ?? null}
          targetHours={targetHours}
          onCommit={(sleepHours) => onSave({ sleepHours })}
        />
        <div className="min-w-0">
          <div className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            Sleep quality <span className="normal-case tracking-normal text-ink-500">1–5</span>
          </div>
          <div className="grid h-11 grid-cols-5 gap-1">
            {([1, 2, 3, 4, 5] as Rating[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`Sleep quality ${value} of 5`}
                aria-pressed={log?.sleepQuality === value}
                onClick={() => onSave({ sleepQuality: log?.sleepQuality === value ? null : value })}
                className={`tabular rounded-xl text-sm font-semibold transition-colors ${optionClass(log?.sleepQuality === value)}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Bedtime</span>
          <input
            type="time"
            value={log?.sleepBedtime ?? ''}
            onChange={(event) => onSave({ sleepBedtime: event.target.value || null })}
            className="tabular h-11 w-full rounded-xl bg-black/25 px-3 text-sm font-medium text-ink-100 outline-none ring-1 ring-inset ring-white/10 focus:ring-info/60"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Wake time</span>
          <input
            type="time"
            value={log?.sleepWakeTime ?? ''}
            onChange={(event) => onSave({ sleepWakeTime: event.target.value || null })}
            className="tabular h-11 w-full rounded-xl bg-black/25 px-3 text-sm font-medium text-ink-100 outline-none ring-1 ring-inset ring-white/10 focus:ring-info/60"
          />
        </label>
        <div className="min-w-0">
          <div className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            Awakenings <span className="normal-case tracking-normal text-ink-500">overnight</span>
          </div>
          <div className="grid h-11 grid-cols-5 gap-1">
            {AWAKENING_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={value === 4 ? '4 or more awakenings' : `${value} awakenings`}
                aria-pressed={log?.nightAwakenings === value}
                onClick={() => onSave({ nightAwakenings: log?.nightAwakenings === value ? null : value })}
                className={`tabular rounded-xl text-xs font-semibold transition-colors ${optionClass(log?.nightAwakenings === value, 'accent')}`}
              >
                {value === 4 ? '4+' : value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
        Duration and quality create the score. Timing learns your rhythm after three nights; awakenings improve confidence when logged.
      </p>
    </Card>
  )
}
