import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '@/components/Icon'
import { dayOfWeek } from '@/domain/date'
import type { LocalDate } from '@/domain/types'
import { getWeighInCadence } from '@/domain/weighInCadence'
import { useDashboard } from '@/hooks/useDashboard'
import { addWater, upsertLog } from '@/db/repo'
import { buildTodayActions } from '@/components/today/todayActions'

/**
 * The one universal entry point for "I want to log something right now".
 *
 * Mobile gets a raised round button on the dock; desktop gets the same trigger
 * in the sidebar. Both open the same sheet, because the point is that there is
 * only one place this lives — Food, Activity, and Today each had their own
 * scattered entry points before this, and adding a fourth would not have fixed
 * that.
 *
 * The list adapts to the moment rather than always showing five equal options:
 * a due weigh-in or an unlogged scheduled session moves to the top, so the
 * common case is a single tap rather than a search through a menu.
 */

type QuickActionId = 'meal' | 'workout' | 'weighIn' | 'water' | 'steps'

/**
 * Last-used action, kept in localStorage so it wins the priority sort next
 * time. A small bump (subtracting 0.75) rather than pinning to the top —
 * that way an urgent unlogged workout still beats "the thing I tapped
 * yesterday", but ordinary ties resolve toward what you already use.
 */
const LAST_USED_KEY = 'formara-quick-action-last'
function readLastUsed(): QuickActionId | null {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY)
    if (raw === 'meal' || raw === 'workout' || raw === 'weighIn' || raw === 'water' || raw === 'steps') return raw
  } catch {
    // localStorage can be blocked (Safari private mode); the sheet still works.
  }
  return null
}
function rememberLastUsed(id: QuickActionId): void {
  try {
    localStorage.setItem(LAST_USED_KEY, id)
  } catch {
    // As above — best-effort.
  }
}

interface QuickActionItem {
  id: QuickActionId
  label: string
  sub: string
  icon: 'food' | 'workout' | 'scale' | 'water' | 'activity'
  priority: number
}

function useQuickActions(): {
  items: QuickActionItem[]
  today: LocalDate
  weightKg: number | null
  steps: number | null
  waterMl: number | null
} {
  const dash = useDashboard(7)
  const { today, phase, logs, index } = dash
  const todayLog = index.get(today)
  const hour = new Date().getHours()

  return useMemo(() => {
    if (!phase) return { items: [], today, weightKg: null, steps: null, waterMl: null }

    const schedule = phase.schedule.find((s) => s.dow === dayOfWeek(today))
    const cadence = getWeighInCadence(today, logs)
    const todayActions = buildTodayActions(phase, schedule, todayLog, today)
    const training = todayActions.find((action) => action.lane === 'training')
    const trainingTodo = training?.status === 'todo' || training?.status === 'attention'
    const weighInDue = cadence.due && (todayLog?.weightKg ?? null) === null

    const items: QuickActionItem[] = [
      {
        id: 'meal',
        label: 'Log meal',
        sub: 'Describe it in plain language',
        icon: 'food',
        priority: hour >= 11 ? 0.5 : 2,
      },
      {
        id: 'workout',
        label: schedule?.gym || schedule?.runKm ? 'Start workout' : 'Log activity',
        sub: schedule?.sessionType ?? (schedule?.runKm ? `${schedule.runKm} km run` : 'Nothing scheduled today'),
        icon: 'workout',
        priority: trainingTodo ? 0 : 4,
      },
      {
        id: 'weighIn',
        label: 'Weigh in',
        sub: weighInDue ? 'Due today' : 'Fasted, first thing',
        icon: 'scale',
        priority: weighInDue ? 0 : 3,
      },
      {
        id: 'water',
        label: 'Add water',
        sub: '+250 ml',
        icon: 'water',
        priority: 2.5,
      },
      {
        id: 'steps',
        label: 'Log steps',
        sub: (todayLog?.steps ?? null) === null ? 'Not logged yet' : `${todayLog?.steps} so far`,
        icon: 'activity',
        priority: hour >= 17 ? 1.5 : 3.5,
      },
    ]

    const lastUsed = readLastUsed()
    if (lastUsed) {
      const entry = items.find((item) => item.id === lastUsed)
      if (entry) entry.priority = Math.max(0, entry.priority - 0.75)
    }
    items.sort((a, b) => a.priority - b.priority)
    return {
      items,
      today,
      weightKg: todayLog?.weightKg ?? null,
      steps: todayLog?.steps ?? null,
      waterMl: todayLog?.waterMl ?? null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, today, logs, index, todayLog, hour])
}

function InlineNumberField({
  label,
  unit,
  initial,
  autoFocus,
  onSave,
}: {
  label: string
  unit: string
  initial: number | null
  autoFocus?: boolean
  onSave: (value: number) => void
}) {
  const [text, setText] = useState(initial === null ? '' : String(initial))

  const commit = () => {
    const value = Number(text)
    if (text.trim() === '' || Number.isNaN(value)) return
    onSave(value)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        autoFocus={autoFocus}
        value={text}
        placeholder="—"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        className="w-full min-w-0 radius-control border border-[var(--app-line)] bg-[var(--app-canvas)] px-3 py-2 type-metric-sm text-[var(--app-ink)] outline-none"
      />
      <span className="type-caption text-[var(--app-muted)]">{unit}</span>
      <button
        type="button"
        onClick={commit}
        className="app-button app-button-primary motion-press shrink-0 px-3 py-2 type-caption font-semibold"
      >
        Save
      </button>
    </div>
  )
}

export function QuickAction({
  open,
  onOpenChange,
}: {
  /** Controlled from the shell so the mobile trigger can live inline in the
   * dock row instead of floating separately — the sheet itself doesn't care
   * where the tap that opened it came from. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expanded, setExpanded] = useState<QuickActionId | null>(null)
  const [justAddedWater, setJustAddedWater] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { items, today, weightKg, steps, waterMl } = useQuickActions()

  const close = () => {
    onOpenChange(false)
    setExpanded(null)
    setJustAddedWater(false)
  }

  const openSheet = () => {
    setExpanded(null)
    setJustAddedWater(false)
    onOpenChange(true)
  }

  if (location.pathname === '/account' || items.length === 0) return null

  const handleTap = (item: QuickActionItem) => {
    // Every tap counts as "last used", so the sheet learns from ordinary use.
    rememberLastUsed(item.id)
    if (item.id === 'meal') {
      close()
      navigate('/food')
      return
    }
    if (item.id === 'workout') {
      close()
      navigate('/workout')
      return
    }
    if (item.id === 'water') {
      void addWater(today, 250)
      setJustAddedWater(true)
      window.setTimeout(() => setJustAddedWater(false), 1400)
      return
    }
    setExpanded(expanded === item.id ? null : item.id)
  }

  return (
    <>
      {/*
        No mobile trigger here: on a phone the plus lives inline at the right
        end of the dock row (rendered by the shell) in both states, so it
        never moves. This component only owns the sheet and the desktop
        trigger.
      */}
      <button
        type="button"
        onClick={openSheet}
        aria-label="Quick log"
        aria-haspopup="dialog"
        className="quick-action-fab quick-action-fab--desktop motion-press"
      >
        <Icon name="plus" className="h-4 w-4" />
        <span>Quick log</span>
      </button>

      {open ? (
        <div className="quick-action-backdrop" role="presentation" onClick={close}>
          <div
            className="quick-action-sheet radius-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Quick log"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1">
              <h2 className="type-title text-[var(--app-ink)]">Quick log</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="motion-press flex h-8 w-8 items-center justify-center radius-control text-[var(--app-muted)]"
              >
                <Icon name="plus" className="h-4 w-4 rotate-45" />
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleTap(item)}
                    className="quick-action-row motion-press radius-inset w-full"
                  >
                    <span className="quick-action-row-icon">
                      <Icon name={item.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block type-body font-medium text-[var(--app-ink)]">{item.label}</span>
                      <span className="block type-caption text-[var(--app-muted)]">
                        {item.id === 'water' && justAddedWater
                          ? `Added — ${(waterMl ?? 0) + 250} ml today`
                          : item.sub}
                      </span>
                    </span>
                  </button>

                  {expanded === item.id && item.id === 'weighIn' ? (
                    <div className="mt-2 px-1">
                      <InlineNumberField
                        label="Weight in kilograms"
                        unit="kg"
                        initial={weightKg}
                        autoFocus
                        onSave={(value) => {
                          void upsertLog(today, { weightKg: value })
                          close()
                        }}
                      />
                    </div>
                  ) : null}

                  {expanded === item.id && item.id === 'steps' ? (
                    <div className="mt-2 px-1">
                      <InlineNumberField
                        label="Steps today"
                        unit="steps"
                        initial={steps}
                        autoFocus
                        onSave={(value) => {
                          void upsertLog(today, { steps: Math.round(value) })
                          close()
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
