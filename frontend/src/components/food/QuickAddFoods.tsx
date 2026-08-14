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
    <div className="flex shrink-0 items-center overflow-hidden rounded-xl bg-white/8 ring-1 ring-inset ring-white/10">
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 py-2 pl-3 pr-2.5 text-left transition-colors hover:bg-white/12 active:bg-white/16"
        title={`Add ${name} to ${SLOT_META[slot].label}`}
      >
        <span className="text-[13px]">{SLOT_META[slot].icon}</span>
        <span className="min-w-0">
          <span className="block max-w-[10rem] truncate text-[12px] font-medium text-ink-50">{name}</span>
          {sub ? <span className="block text-[10px] text-ink-500">{sub}</span> : null}
        </span>
        <span className="ml-1 text-sm font-semibold text-accent">＋</span>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="self-stretch border-l border-white/10 px-2 text-[11px] text-ink-500 hover:text-alert"
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
  if (!hasFavourites && !hasRecents) return null

  return (
    <Card>
      {hasFavourites ? (
        <div className={hasRecents ? 'mb-3' : ''}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Saved</div>
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
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Recent</div>
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
