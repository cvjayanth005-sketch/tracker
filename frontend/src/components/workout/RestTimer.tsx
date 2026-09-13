import { useRestTimer } from '@/hooks/useRestTimer'

export function RestTimer() {
  const {
    isActive,
    isPaused,
    remainingSec,
    totalSec,
    exerciseName,
    addSeconds,
    pause,
    resume,
    skip,
  } = useRestTimer()

  if (!isActive) return null

  const minutes = Math.floor(remainingSec / 60)
  const seconds = remainingSec % 60
  const formattedTime = `${minutes}:${String(seconds).padStart(2, '0')}`
  const progressPct = totalSec > 0 ? Math.min(100, Math.max(0, ((totalSec - remainingSec) / totalSec) * 100)) : 0

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-lg animate-slide-up sm:bottom-6 sm:right-6 sm:left-auto sm:w-96">
      <div className="overflow-hidden rounded-2xl border border-[var(--app-line-strong)] bg-[var(--app-card)]/95 shadow-2xl backdrop-blur-xl transition-all">
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-[var(--app-inset)]">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-amber-400' : 'animate-ping bg-sky-400 opacity-75'}`} />
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-sky-500'}`} />
                </span>
                <span className="type-micro font-semibold uppercase tracking-wider text-[var(--app-muted)]">
                  {isPaused ? 'Rest Paused' : 'Resting'}
                </span>
              </div>
              {exerciseName ? (
                <div className="truncate type-dense font-medium text-[var(--app-ink)]">
                  {exerciseName}
                </div>
              ) : null}
            </div>

            <div className="tabular text-3xl font-bold tracking-tight text-[var(--app-ink)]">
              {formattedTime}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 pt-1 border-t border-[var(--app-line)]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => addSeconds(-30)}
                disabled={remainingSec <= 30}
                className="h-8 rounded-lg bg-[var(--app-inset)] px-2.5 type-micro font-semibold text-[var(--app-muted)] transition hover:text-[var(--app-ink)] disabled:opacity-40"
              >
                -30s
              </button>
              <button
                type="button"
                onClick={() => addSeconds(30)}
                className="h-8 rounded-lg bg-[var(--app-inset)] px-2.5 type-micro font-semibold text-[var(--app-muted)] transition hover:text-[var(--app-ink)]"
              >
                +30s
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {isPaused ? (
                <button
                  type="button"
                  onClick={resume}
                  className="h-8 rounded-lg bg-sky-500/15 px-3 type-dense font-semibold text-sky-500 transition hover:bg-sky-500/25"
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pause}
                  className="h-8 rounded-lg bg-[var(--app-inset)] px-3 type-dense font-medium text-[var(--app-muted)] transition hover:text-[var(--app-ink)]"
                >
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={skip}
                className="h-8 rounded-lg bg-amber-500/15 px-3 type-dense font-semibold text-amber-500 transition hover:bg-amber-500/25"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
