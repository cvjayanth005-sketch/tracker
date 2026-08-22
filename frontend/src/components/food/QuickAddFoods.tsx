import { useLiveQuery } from 'dexie-react-hooks'
import { deleteFood, favouriteFoods, logMealTemplate, logSavedFood, recentMealTemplates } from '@/db/repo'
import { Card } from '@/components/ui'
import type { LocalDate } from '@/domain/types'
import { SLOT_META } from './palette'

function macroLabel(calories: number | null, proteinG: number | null): string {
  const parts: string[] = []
  if (calories !== null) parts.push(`${Math.round(calories)} kcal`)
  if (proteinG !== null) parts.push(`${Math.round(proteinG)}P`)
  return parts.join(' · ')
}

function Chip({
  name,
  slot,
  sub,
  onAdd,
  onRemove,
}: {
  name: string
  slot: keyof typeof SLOT_META
  sub: string
  onAdd: () => void
  onRemove?: () => void
}) {
  return (
    <div className="flex shrink-0 items-center overflow-hidden radius-control bg-[var(--app-inset)] ring-1 ring-inset ring-[var(--app-line)]">
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 py-2 pl-3 pr-2.5 text-left transition-colors hover:bg-[var(--app-inset)] active:bg-[var(--app-inset)]"
        title={`Add ${name} to ${SLOT_META[slot].label}`}
      >
        <span className="type-caption">{SLOT_META[slot].icon}</span>
        <span className="min-w-0">
          <span className="block max-w-[10rem] truncate type-caption font-medium text-[var(--app-ink)]">{name}</span>
          {sub ? <span className="block type-caption text-[var(--app-muted)]">{sub}</span> : null}
        </span>
        <span className="ml-1 type-caption font-semibold text-accent">＋</span>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="self-stretch border-l border-[var(--app-line)] px-2 type-caption text-[var(--app-muted)] hover:text-alert"
          aria-label={`Remove ${name} from saved`}
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

/**
 * One-tap re-logging from the user's own history. "Saved" are curated
 * favourites; "Recent" are distinct dishes pulled straight from the meal log.
 * Logging a repeat copies the exact macros, so the same meal always reads the
 * same — which is what keeps daily totals and the coach's averages honest.
 */
export function QuickAddFoods({ date }: { date: LocalDate }) {
  const favourites = useLiveQuery(() => favouriteFoods(12), [], [])
  const recents = useLiveQuery(() => recentMealTemplates(12), [], [])

  const hasFavourites = (favourites ?? []).length > 0
  const hasRecents = (recents ?? []).length > 0
  /*
   * First-time state kept visible instead of nothing at all. Someone with a
   * blank history should still see the promise — "log a meal, it comes back
   * as a one-tap chip" — otherwise the feature is invisible until they have
   * already done the harder version of the same thing.
   */
  if (!hasFavourites && !hasRecents) {
    return (
      <Card>
        <div className="type-micro font-semibold text-[var(--app-muted)]">One-tap re-log</div>
        <p className="mt-1.5 type-caption text-[var(--app-ink-soft)]">
          After you log a meal it appears here as a chip. Tap once to log it again — same macros,
          no re-typing.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      {hasFavourites ? (
        <div className={hasRecents ? 'mb-3' : ''}>
          <div className="mb-2 type-micro font-semibold text-[var(--app-muted)]">Saved</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(favourites ?? []).map((food) => (
              <Chip
                key={food.id}
                name={food.name}
                slot={food.defaultSlot ?? 'snack'}
                sub={macroLabel(food.calories, food.proteinG)}
                onAdd={() => void logSavedFood(date, food)}
                onRemove={() => void deleteFood(food.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hasRecents ? (
        <div>
          <div className="mb-2 type-micro font-semibold text-[var(--app-muted)]">Recent</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(recents ?? []).map((template) => (
              <Chip
                key={`${template.slot}-${template.name}`}
                name={template.name}
                slot={template.slot}
                sub={macroLabel(template.calories, template.proteinG)}
                onAdd={() => void logMealTemplate(date, template)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}
