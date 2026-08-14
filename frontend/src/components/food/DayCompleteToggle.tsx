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
      className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/25"
      title="Reopen the day's food log"
    >
      ✓ Day complete
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void setFoodComplete(date, true)}
      className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-ink-200 ring-1 ring-inset ring-white/12 transition-colors hover:bg-white/12 hover:text-ink-50"
      title="Mark today's eating as finished"
    >
      Mark day complete
    </button>
  )
}
