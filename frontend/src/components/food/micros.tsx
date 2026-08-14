import { useState } from 'react'

/**
 * Curated micronutrients the UI can display and edit. The store is a flexible
 * `Record<string, number>`, but the app only surfaces these known keys (units
 * are encoded in the key suffix). `target` is a rough daily reference.
 */
export const MICRO_DEFS = [
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg', target: 3400 },
  { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg', target: 300 },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg', target: 1000 },
  { key: 'ironMg', label: 'Iron', unit: 'mg', target: 8 },
  { key: 'vitaminCMg', label: 'Vitamin C', unit: 'mg', target: 90 },
  { key: 'vitaminDMcg', label: 'Vitamin D', unit: 'mcg', target: 20 },
] as const

export type Micros = Record<string, number> | null

/** Immutably set/remove one micro, collapsing to null when the map empties. */
export function setMicro(micros: Micros, key: string, value: number | null): Micros {
  const next: Record<string, number> = { ...(micros ?? {}) }
  if (value === null) delete next[key]
  else next[key] = value
  return Object.keys(next).length === 0 ? null : next
}

function num(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

/** Read-only day totals for each known micro, with a rough % of daily target. */
export function MicroDaySummary({ micros }: { micros: Micros }) {
  const anyLogged = micros && MICRO_DEFS.some((def) => micros[def.key] != null)
  if (!anyLogged) {
    return (
      <p className="text-[12px] leading-relaxed text-ink-400">
        Log meals with the AI estimator and it captures micronutrients here — potassium, calcium, iron, and more.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {MICRO_DEFS.map((def) => {
        const value = micros?.[def.key] ?? null
        const pct = value === null ? null : Math.min(100, Math.round((value / def.target) * 100))
        return (
          <div key={def.key} className="rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-inset ring-white/8">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[11px] text-ink-400">{def.label}</span>
              {pct !== null ? <span className="tabular text-[10px] text-ink-500">{pct}%</span> : null}
            </div>
            <div className="tabular mt-0.5 text-[13px] font-semibold text-ink-50">
              {value === null ? <span className="text-ink-600">—</span> : Math.round(value)}
              <span className="ml-0.5 text-[10px] font-normal text-ink-500">{def.unit}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Collapsible grid of micro inputs, shared by the logger and the meal editor. */
export function MicroFields({ value, onSet }: { value: Micros; onSet: (key: string, next: number | null) => void }) {
  const filled = value ? Object.keys(value).length : 0
  const [open, setOpen] = useState(filled > 0)
  return (
    <div className="rounded-lg bg-white/[0.03] ring-1 ring-inset ring-white/8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-ink-300"
      >
        <span>Micronutrients{filled > 0 ? ` · ${filled}` : ''}</span>
        <span className={`text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
          {MICRO_DEFS.map((def) => (
            <label key={def.key} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] text-ink-400">{def.label}</span>
              <input
                type="number"
                inputMode="decimal"
                defaultValue={value?.[def.key] ?? ''}
                onBlur={(e) => onSet(def.key, num(e.target.value))}
                placeholder="—"
                className="tabular w-12 rounded bg-white/5 px-1 py-1 text-center text-[12px] text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
              />
              <span className="w-7 text-[9px] text-ink-500">{def.unit}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
