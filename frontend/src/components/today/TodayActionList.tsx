import type { MetricKey } from '@/domain/compliance'
import type { ActionStatus, TodayAction } from './todayActions'

/**
 * "What should I do today?" — the top of the screen and the only thing a user
 * has to read to know where they stand.
 *
 * Three rows, one per lane, always in the same order of urgency. Finished work
 * stays visible but recedes: removing a completed row would make the list jump
 * as the day progresses and would hide the fact that the thing was done.
 */

const LANE_LABEL: Record<TodayAction['lane'], string> = {
  training: 'Training',
  nutrition: 'Nutrition',
  movement: 'Movement',
}

const STATUS_TEXT: Record<ActionStatus, string> = {
  done: 'Done',
  todo: 'To do',
  attention: 'Needs attention',
  rest: 'Rest',
}

function statusClass(status: ActionStatus): string {
  if (status === 'done') return 'today-outcome-hit'
  if (status === 'attention') return 'today-outcome-missed'
  if (status === 'rest') return 'today-outcome-not-scheduled'
  return 'today-outcome-unknown'
}

export function TodayActionList({
  actions,
  onOpenWorkout,
  onFocusMetric,
}: {
  actions: TodayAction[]
  onOpenWorkout: () => void
  onFocusMetric: (metric: MetricKey) => void
}) {
  return (
    <section className="app-panel p-4 sm:p-5" aria-labelledby="today-actions-heading">
      <h2 id="today-actions-heading" className="type-heading">
        What should I do today?
      </h2>

      <ul className="mt-4 space-y-2">
        {actions.map((action) => {
          const done = action.status === 'done' || action.status === 'rest'
          return (
            <li
              key={action.lane}
              className={`radius-inset motion-press border p-3 sm:p-3.5 ${
                done ? 'today-action-done border-transparent' : 'border-[var(--app-line)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="type-micro text-[var(--app-muted)]">{LANE_LABEL[action.lane]}</div>
                  <div
                    className={`today-action-title type-title mt-1 ${done ? '' : 'text-[var(--app-ink)]'}`}
                  >
                    {action.title}
                  </div>
                  <p className="type-caption mt-1 text-[var(--app-ink-soft)]">{action.reason}</p>
                </div>

                <span
                  className={`radius-pill shrink-0 border px-2 py-0.5 text-[11px] font-semibold ${statusClass(
                    action.status,
                  )}`}
                >
                  {STATUS_TEXT[action.status]}
                </span>
              </div>

              {action.command ? (
                <div className="mt-3">
                  <button
                    type="button"
                    className="app-button app-button-secondary radius-control motion-press text-[13px]"
                    onClick={() =>
                      action.command!.kind === 'workout'
                        ? onOpenWorkout()
                        : onFocusMetric(action.command!.metric)
                    }
                  >
                    {action.command.label}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
