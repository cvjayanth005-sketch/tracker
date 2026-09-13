import { useMemo, useState } from 'react'
import { calculatePlates, METRIC_PLATES } from '@/domain/plateCalculator'
import { Button } from '@/components/ui'

interface PlateCalculatorProps {
  initialWeight?: number | null
  onClose: () => void
  onApply?: (weightKg: number) => void
}

const BAR_OPTIONS = [
  { label: 'Olympic Men (20 kg)', weight: 20 },
  { label: 'Olympic Women (15 kg)', weight: 15 },
  { label: 'Technique / EZ (10 kg)', weight: 10 },
]

export function PlateCalculator({ initialWeight, onClose, onApply }: PlateCalculatorProps) {
  const [targetWeight, setTargetWeight] = useState<number>(initialWeight && initialWeight > 0 ? initialWeight : 60)
  const [barWeight, setBarWeight] = useState<number>(20)

  const result = useMemo(
    () => calculatePlates(targetWeight, barWeight, METRIC_PLATES),
    [targetWeight, barWeight],
  )

  const adjustWeight = (delta: number) => {
    setTargetWeight((prev) => Math.max(barWeight, Math.round((prev + delta) * 2) / 2))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md animate-slide-up rounded-t-3xl border border-[var(--app-line)] bg-[var(--app-card)] p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏋️</span>
            <h3 className="type-title font-semibold text-[var(--app-ink)]">Plate Calculator</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-[var(--app-inset)] text-center text-lg leading-none text-[var(--app-muted)] transition hover:text-[var(--app-ink)]"
          >
            ×
          </button>
        </div>

        {/* Target weight selector */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[var(--app-inset)] p-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustWeight(-5)}
              className="h-9 w-9 rounded-xl bg-[var(--app-card)] type-body font-bold text-[var(--app-ink)] shadow-sm transition hover:bg-[var(--app-card)]/80"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => adjustWeight(-2.5)}
              className="h-9 w-10 rounded-xl bg-[var(--app-card)] type-dense font-bold text-[var(--app-ink)] shadow-sm transition hover:bg-[var(--app-card)]/80"
            >
              -2.5
            </button>
          </div>

          <div className="text-center">
            <div className="tabular text-3xl font-black text-[var(--app-ink)]">
              {targetWeight} <span className="type-caption font-normal text-[var(--app-muted)]">kg</span>
            </div>
            <div className="type-micro text-[var(--app-muted)]">
              {result.weightPerSide > 0 ? `${result.weightPerSide} kg per side` : 'Bar only'}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustWeight(2.5)}
              className="h-9 w-10 rounded-xl bg-[var(--app-card)] type-dense font-bold text-[var(--app-ink)] shadow-sm transition hover:bg-[var(--app-card)]/80"
            >
              +2.5
            </button>
            <button
              type="button"
              onClick={() => adjustWeight(5)}
              className="h-9 w-9 rounded-xl bg-[var(--app-card)] type-body font-bold text-[var(--app-ink)] shadow-sm transition hover:bg-[var(--app-card)]/80"
            >
              +5
            </button>
          </div>
        </div>

        {/* Barbell Weight Options */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {BAR_OPTIONS.map((bar) => (
            <button
              key={bar.weight}
              type="button"
              onClick={() => setBarWeight(bar.weight)}
              className={`flex-1 rounded-xl px-2.5 py-1.5 type-micro font-semibold transition ${
                barWeight === bar.weight
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-[var(--app-inset)] text-[var(--app-muted)] hover:text-[var(--app-ink)]'
              }`}
            >
              {bar.weight} kg bar
            </button>
          ))}
        </div>

        {/* Visual Barbell Sleeve */}
        <div className="mt-5 rounded-2xl border border-[var(--app-line)] bg-gradient-to-b from-slate-900 to-slate-950 p-4 shadow-inner">
          <div className="relative flex h-28 items-center justify-center">
            {/* Bar sleeve shaft */}
            <div className="absolute left-4 right-4 h-5 rounded-full bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400 shadow-md" />
            <div className="absolute left-8 h-10 w-3 rounded-sm bg-slate-500 shadow-md" />

            {/* Stacked plates per side */}
            <div className="relative z-10 flex items-center justify-start gap-1 pl-12">
              {result.plateSequence.length > 0 ? (
                result.plateSequence.map((plate, index) => (
                  <div
                    key={`${plate.weight}-${index}`}
                    style={{
                      backgroundColor: plate.color,
                      color: plate.textColor,
                      height: `${Math.round(plate.heightPct * 96)}px`,
                      width: `${Math.max(14, Math.min(26, plate.weight * 0.9 + 10))}px`,
                    }}
                    className="flex flex-col items-center justify-center rounded-[4px] shadow-lg ring-1 ring-black/20"
                  >
                    <span className="tabular rotate-90 text-[10px] font-black tracking-tighter">
                      {plate.weight}
                    </span>
                  </div>
                ))
              ) : (
                <div className="type-micro font-medium text-slate-400">Empty Bar ({barWeight} kg)</div>
              )}
            </div>
          </div>
        </div>

        {/* Breakdown summary */}
        <div className="mt-4">
          <div className="type-micro font-semibold uppercase tracking-wider text-[var(--app-muted)]">
            Plates Per Side
          </div>
          {result.plates.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {result.plates.map(({ spec, count }) => (
                <div
                  key={spec.weight}
                  className="flex items-center justify-between rounded-xl bg-[var(--app-inset)] px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: spec.color }}
                    />
                    <span className="type-caption font-bold text-[var(--app-ink)]">
                      {spec.weight} kg
                    </span>
                  </div>
                  <span className="rounded-md bg-[var(--app-card)] px-2 py-0.5 type-dense font-black text-[var(--app-ink)] shadow-sm">
                    × {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 type-caption text-[var(--app-muted)]">
              No plates required. Lift the bare bar.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex gap-2">
          {onApply ? (
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                onApply(targetWeight)
                onClose()
              }}
            >
              Use {targetWeight} kg
            </Button>
          ) : null}
          <Button onClick={onClose} className={onApply ? '' : 'w-full'}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
