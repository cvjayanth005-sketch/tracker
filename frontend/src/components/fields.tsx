import { useEffect, useRef, useState } from 'react'
import type { Rating } from '@/domain/types'

/**
 * Input primitives.
 *
 * The rule the whole app hangs on: an empty field commits `null`, never `0`.
 * Clearing a value has to be possible and has to mean "unknown", otherwise
 * every average downstream is quietly wrong.
 */

const COMMIT_DELAY_MS = 500

export function NumberField({
  id,
  label,
  value,
  onCommit,
  unit,
  target,
  step = 'any',
  placeholder = '—',
  inputMode = 'decimal',
  onDraftChange,
}: {
  id?: string
  label: string
  value: number | null
  onCommit: (next: number | null) => void
  unit?: string
  target?: string
  step?: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
  onDraftChange?: (next: number | null) => void
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  // Re-sync when the record behind the field changes (e.g. the day rolls over
  // or an import lands) — but never while the user is mid-edit.
  useEffect(() => {
    if (dirty.current) return
    setText(value === null ? '' : String(value))
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      dirty.current = false
      onCommit(null)
      return
    }
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed)) return
    dirty.current = false
    onCommit(parsed)
  }

  const handleChange = (raw: string) => {
    setText(raw)
    const parsed = Number(raw)
    onDraftChange?.(raw.trim() === '' || Number.isNaN(parsed) ? null : parsed)
    dirty.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commit(raw), COMMIT_DELAY_MS)
  }

  return (
    <label className="glass-tile flex items-center justify-between gap-3 rounded-3xl px-4 py-3.5 transition-colors focus-within:bg-white/[0.07]">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink-200">{label}</span>
        {target ? <span className="block text-[11px] text-ink-400">{target}</span> : null}
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <input
          id={id}
          type="number"
          inputMode={inputMode}
          step={step}
          value={text}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => {
            window.clearTimeout(timer.current)
            commit(e.target.value)
          }}
          className="tabular w-24 rounded-2xl bg-black/25 px-3 py-2 text-right text-base font-semibold text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:font-normal placeholder:text-ink-600 focus:ring-accent/60"
        />
        {/* Always rendered, so inputs with and without a unit stay aligned. */}
        <span className="w-8 text-xs text-ink-400">{unit ?? ''}</span>
      </span>
    </label>
  )
}

/**
 * Three-state control. Neither option selected means "not logged"; tapping the
 * active option again returns to that state.
 */
export function TriToggle({
  label,
  sub,
  value,
  onChange,
  yesLabel = 'Done',
  noLabel = 'Skipped',
}: {
  label: string
  sub?: string
  value: boolean | null
  onChange: (next: boolean | null) => void
  yesLabel?: string
  noLabel?: string
}) {
  const option = (optionValue: boolean, text: string, activeClass: string) => {
    const active = value === optionValue
    return (
      <button
        type="button"
        onClick={() => onChange(active ? null : optionValue)}
        className={`min-h-10 rounded-2xl px-3 text-[13px] font-medium transition-colors ${
          active ? activeClass : 'bg-black/25 text-ink-400 ring-1 ring-inset ring-white/10'
        }`}
      >
        {text}
      </button>
    )
  }

  return (
    <div className="glass-tile flex items-center justify-between gap-3 rounded-3xl px-4 py-3.5 transition-colors focus-within:bg-white/[0.07]">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink-200">{label}</span>
        {sub ? <span className="block text-[11px] text-ink-400">{sub}</span> : null}
      </span>
      <span className="flex shrink-0 gap-1.5">
        {option(true, yesLabel, 'bg-accent text-ink-950 shadow-[0_6px_18px_-6px] shadow-accent/60')}
        {option(false, noLabel, 'bg-alert/20 text-alert ring-1 ring-inset ring-alert/40')}
      </span>
    </div>
  )
}

export function RatingField({
  label,
  sub,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string
  sub?: string
  value: Rating | null
  onChange: (next: Rating | null) => void
  lowLabel?: string
  highLabel?: string
}) {
  return (
    <div className="glass-tile rounded-3xl px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-200">{label}</span>
        {sub ? <span className="text-[11px] text-ink-400">{sub}</span> : null}
      </div>
      <div className="mt-2 flex gap-1.5">
        {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`tabular h-9 flex-1 rounded-lg text-sm font-semibold transition-colors ${
              value === n
                ? 'bg-info text-ink-950 shadow-[0_10px_26px_-10px] shadow-info/70'
                : 'bg-black/25 text-ink-400 ring-1 ring-inset ring-white/10'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {lowLabel && highLabel ? (
        <div className="mt-1 flex justify-between text-[10px] text-ink-600">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

export function TextArea({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string
  value: string | null
  onCommit: (next: string | null) => void
  placeholder?: string
}) {
  const [text, setText] = useState(value ?? '')
  const dirty = useRef(false)

  useEffect(() => {
    if (dirty.current) return
    setText(value ?? '')
  }, [value])

  return (
    <label className="glass-tile block rounded-3xl px-4 py-3.5">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-200">{label}</span>
      <textarea
        value={text}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => {
          dirty.current = true
          setText(e.target.value)
        }}
        onBlur={() => {
          dirty.current = false
          onCommit(text.trim() === '' ? null : text)
        }}
        className="w-full resize-none rounded-2xl bg-black/25 px-3 py-2 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
      />
    </label>
  )
}
