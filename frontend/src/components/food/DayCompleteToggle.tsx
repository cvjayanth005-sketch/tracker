import { setFoodComplete } from '@/db/repo'
import type { LocalDate } from '@/domain/types'

/**
 * "Done eating" control. Marking a day complete tells the coach its totals are
 * final and safe to judge; until then the day is treated as still in progress.
 */
export function DayCompleteToggle({ date, complete }: { date: LocalDate; complete: boolean }) {
  return complete ? (
    <button
      type="button"
      onClick={() => void setFoodComplete(date, false)}
      className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 type-caption font-semibold text-accent ring-1 ring-inset ring-accent/25"
      title="Reopen the day's food log"
    >
      ✓ Day complete
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void setFoodComplete(date, true)}
      className="inline-flex items-center gap-1 rounded-full bg-[var(--app-inset)] px-2.5 py-1 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)] transition-colors hover:bg-[var(--app-inset)] hover:text-[var(--app-ink)]"
      title="Mark today's eating as finished"
    >
      Mark day complete
    </button>
  )
}
