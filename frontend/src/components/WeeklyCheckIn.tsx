import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getWeeklyCheckIn, upsertWeeklyCheckIn } from '@/db/repo'
import type { LocalDate, WeeklyIntent } from '@/domain/types'
import { Button, Card, Pill } from '@/components/ui'

const INTENTS: Array<{ value: WeeklyIntent; label: string }> = [
  { value: 'build', label: 'Build' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'recover', label: 'Recover' },
]

export function WeeklyCheckIn({ weekStart }: { weekStart: LocalDate }) {
  const saved = useLiveQuery(() => getWeeklyCheckIn(weekStart), [weekStart])
  const [win, setWin] = useState('')
  const [friction, setFriction] = useState('')
  const [intent, setIntent] = useState<WeeklyIntent | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setWin(saved?.win ?? '')
    setFriction(saved?.friction ?? '')
    setIntent(saved?.intent ?? null)
  }, [saved?.friction, saved?.intent, saved?.win])

  const save = async () => {
    setSaving(true)
    try {
      await upsertWeeklyCheckIn(weekStart, {
        win: win.trim() || null,
        friction: friction.trim() || null,
        intent,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex min-h-[26rem] flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="type-micro font-semibold text-[var(--app-muted)]">Weekly check-in</div>
          <div className="mt-1 type-body font-semibold text-[var(--app-ink)]">Shape the next week</div>
        </div>
        <Pill tone={saved?.updatedAt ? 'good' : 'neutral'}>{saved?.updatedAt ? 'saved' : 'open'}</Pill>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block type-caption font-semibold text-[var(--app-ink)]">What felt strong?</span>
        <textarea
          value={win}
          onChange={(event) => setWin(event.target.value)}
          rows={3}
          placeholder="A lift, run, habit, or routine that worked"
          className="w-full resize-none radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption leading-relaxed text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-accent/60"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1.5 block type-caption font-semibold text-[var(--app-ink)]">What got in the way?</span>
        <textarea
          value={friction}
          onChange={(event) => setFriction(event.target.value)}
          rows={3}
          placeholder="Schedule, recovery, equipment, or anything else"
          className="w-full resize-none radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption leading-relaxed text-[var(--app-ink)] outline-none ring-1 ring-inset ring-[var(--app-line)] placeholder:text-[var(--app-muted)] focus:ring-alert/60"
        />
      </label>

      <div className="mt-3">
        <div className="mb-1.5 type-caption font-semibold text-[var(--app-ink)]">Next week</div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Next week intent">
          {INTENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setIntent((current) => (current === option.value ? null : option.value))}
              className={`min-h-10 radius-control type-caption font-semibold transition-colors ${ intent === option.value ? 'bg-accent text-ink-950' : 'bg-[var(--app-inset)] text-[var(--app-ink-soft)] ring-1 ring-inset ring-[var(--app-line)]' }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-[var(--app-line)] pt-3">
        <Button variant="primary" onClick={() => void save()} disabled={saving} className="w-full">
          {saving ? 'Saving...' : 'Save check-in'}
        </Button>
      </div>
    </Card>
  )
}
