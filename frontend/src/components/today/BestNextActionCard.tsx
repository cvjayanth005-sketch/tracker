import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BestNextAction } from '@/domain/bestNextAction'
import type { LocalDate } from '@/domain/types'
import { Card } from '@/components/ui'

export function BestNextActionCard({ action, date }: { action: BestNextAction; date: LocalDate }) {
  const key = `formara-best-action-dismissed`
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return sessionStorage.getItem(key) } catch { return null }
  })
  const dismiss = (value: string | null) => {
    setDismissed(value)
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key) } catch { /* Optional persistence. */ }
  }
  return <Card className="mt-4">
    {dismissed === date ? <div className="flex items-center justify-between gap-4">
      <p className="type-caption text-[var(--app-muted)]">Today’s suggestion is dismissed.</p>
      <button type="button" className="type-caption text-[var(--app-ink)] underline" onClick={() => dismiss(null)}>Show again</button>
    </div> : <>
      <div className="flex justify-between items-center gap-3">
        <p className="type-micro text-[var(--app-muted)]">Your best next action</p>
        <button type="button" onClick={() => dismiss(date)} className="type-caption px-2 py-2 text-[var(--app-muted)]" aria-label="Dismiss today’s suggestion">Dismiss</button>
      </div>
      <h2 className="type-title text-[var(--app-ink)]">{action.title}</h2>
      <p className="mt-2 type-caption text-[var(--app-ink-soft)]">{action.reason}</p>
      <Link to={action.href} className="mt-4 inline-flex radius-control bg-[var(--app-selected-fill)] px-4 py-3 type-caption font-semibold text-[var(--app-selected-ink)]">{action.label}</Link>
    </>}
  </Card>
}
