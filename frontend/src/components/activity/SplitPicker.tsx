import { useState } from 'react'
import { TRAINING_SPLITS } from '@/domain/trainingSplits'
import type { Settings } from '@/domain/types'
import { Button } from '@/components/ui'

const BUCKET_OPTIONS: Array<{ value: Settings['customSplitDays'][number]['bucket']; label: string }> = [
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'full', label: 'Full body' },
]

/**
 * Step 1 of planning: pick a training split before seeing any exercises.
 * The split decides how the day cards below get named and grouped — showing
 * exercises first, split second (the old design) skipped the question this
 * screen exists to answer.
 */
export function SplitPicker({
  onPick,
  onPickCustom,
}: {
  onPick: (splitId: string) => void
  onPickCustom: (days: Settings['customSplitDays']) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customDays, setCustomDays] = useState<Settings['customSplitDays']>([])
  const [dayName, setDayName] = useState('')
  const [dayBucket, setDayBucket] = useState<Settings['customSplitDays'][number]['bucket']>('upper')

  const addCustomDay = () => {
    const label = dayName.trim()
    if (!label) return
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `day-${customDays.length + 1}`
    setCustomDays((prev) => [...prev, { key: `${key}-${prev.length}`, label, bucket: dayBucket }])
    setDayName('')
  }

  if (customOpen) {
    return (
      <div className="app-panel p-4">
        <h2 className="type-title text-[var(--app-ink)]">Build your split</h2>
        <p className="type-caption text-[var(--app-muted)] mt-1">
          Name each training day and pick what it mostly works.
        </p>

        {customDays.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {customDays.map((day, i) => (
              <li
                key={day.key}
                className="flex items-center justify-between gap-2 radius-control bg-[var(--app-inset)] px-3 py-2"
              >
                <span className="type-caption font-medium text-[var(--app-ink)]">{day.label}</span>
                <div className="flex items-center gap-2">
                  <span className="type-micro text-[var(--app-muted)] capitalize">{day.bucket}</span>
                  <button
                    type="button"
                    onClick={() => setCustomDays((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${day.label}`}
                    className="motion-press type-micro text-[var(--app-muted)] hover:text-alert"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={dayName}
            onChange={(e) => setDayName(e.target.value)}
            placeholder="e.g. Arms + Abs"
            className="min-w-0 flex-1 radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
          />
        </div>
        <div className="mt-2 flex gap-1 rounded-full border border-[var(--app-line)] p-0.5 w-fit">
          {BUCKET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDayBucket(opt.value)}
              className={`radius-pill px-2.5 py-1 type-micro font-semibold ${
                dayBucket === opt.value
                  ? 'bg-[var(--app-selected-fill)] text-[var(--app-selected-ink)]'
                  : 'text-[var(--app-muted)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={addCustomDay} disabled={!dayName.trim()}>
            + Add day
          </Button>
        </div>

        <div className="mt-4 flex gap-2 border-t border-[var(--app-line)] pt-3">
          <Button variant="ghost" onClick={() => setCustomOpen(false)}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => onPickCustom(customDays)}
            disabled={customDays.length === 0}
          >
            Use this split
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="type-title text-[var(--app-ink)]">What's your training split?</h2>
        <p className="type-caption text-[var(--app-muted)] mt-1">
          Pick how you divide your training days — you'll build the actual exercise list next.
        </p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {TRAINING_SPLITS.map((split) => (
          <button
            key={split.id}
            type="button"
            onClick={() => (split.isCustom ? setCustomOpen(true) : onPick(split.id))}
            className="app-panel motion-press p-3.5 text-left hover:ring-1 hover:ring-accent/40 transition-shadow"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{split.emoji}</span>
              <span className="type-caption font-bold text-[var(--app-ink)]">{split.name}</span>
            </div>
            <p className="type-micro text-[var(--app-muted)] mt-1.5">{split.description}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="type-micro font-medium text-accent">{split.frequency}</span>
              <span className="type-micro text-[var(--app-muted)]">{split.goodFor}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
