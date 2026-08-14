import { useState } from 'react'
import { parseMeals, type MealDraft } from '@/ai/foodParse'
import { addMeals } from '@/db/repo'
import { Button, Card } from '@/components/ui'
import type { LocalDate, MealSlot } from '@/domain/types'
import { MACRO, SLOT_META, SLOT_ORDER } from './palette'

function guessSlot(): MealSlot {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

function blankDraft(slot: MealSlot): MealDraft {
  return {
    slot,
    name: '',
    time: null,
    quantity: null,
    unit: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    notes: null,
  }
}

const MACRO_FIELDS = [
  { key: 'calories', ...MACRO.calories },
  { key: 'proteinG', ...MACRO.protein },
  { key: 'carbsG', ...MACRO.carbs },
  { key: 'fatG', ...MACRO.fat },
] as const

function SlotPicker({ value, onChange }: { value: MealSlot; onChange: (slot: MealSlot) => void }) {
  return (
    <div className="flex gap-1.5">
      {SLOT_ORDER.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onChange(slot)}
          className={`flex-1 rounded-xl px-2 py-2 text-[12px] font-medium transition-colors ${
            value === slot
              ? 'bg-accent text-ink-950'
              : 'bg-white/8 text-ink-300 ring-1 ring-inset ring-white/10 hover:bg-white/12'
          }`}
        >
          {SLOT_META[slot].label}
        </button>
      ))}
    </div>
  )
}

function DraftRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: MealDraft
  onChange: (patch: Partial<MealDraft>) => void
  onRemove: () => void
}) {
  const num = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }
  return (
    <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-inset ring-white/10">
      <div className="flex items-center gap-2">
        <input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Meal name"
          className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
        />
        <input
          value={draft.time ?? ''}
          onChange={(e) => onChange({ time: e.target.value.trim() || null })}
          placeholder="—:—"
          className="tabular w-16 rounded-xl bg-white/5 px-2 py-2 text-center text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/6 text-ink-400 ring-1 ring-inset ring-white/10 hover:text-alert"
          aria-label="Remove meal"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Portion</span>
        <input
          type="number"
          inputMode="decimal"
          value={draft.quantity ?? ''}
          onChange={(e) => onChange({ quantity: num(e.target.value) })}
          placeholder="—"
          className="tabular w-16 rounded-lg bg-white/5 px-2 py-1.5 text-center text-[13px] text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
        />
        <input
          value={draft.unit ?? ''}
          onChange={(e) => onChange({ unit: e.target.value.trim() || null })}
          placeholder="g / cup / piece"
          className="min-w-0 flex-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[13px] text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-accent/60"
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {MACRO_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide" style={{ color: field.color }}>
              {field.label}
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={draft[field.key] ?? ''}
              onChange={(e) => onChange({ [field.key]: num(e.target.value) })}
              placeholder="—"
              className="tabular w-full rounded-lg bg-white/5 px-2 py-1.5 text-center text-[13px] font-semibold text-ink-50 outline-none ring-1 ring-inset ring-white/10 placeholder:font-normal placeholder:text-ink-600 focus:ring-accent/60"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

/** "Describe what you ate" → AI estimate → editable review → save. Manual add too. */
export function MealLogger({ date }: { date: LocalDate }) {
  const [slot, setSlot] = useState<MealSlot>(guessSlot)
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<MealDraft[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [aiParsed, setAiParsed] = useState(false)

  const estimate = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await parseMeals(text, slot)
      setDrafts(result.meals.length > 0 ? result.meals : [blankDraft(slot)])
      setAiParsed(result.provider === 'groq')
      if (result.provider !== 'groq') {
        setNotice('AI estimation is offline — fill in the macros for each item and save.')
      } else if (result.needsManual) {
        setNotice('Saved your items — add the macros you know and save.')
      } else if (result.summary) {
        setNotice(result.summary)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const addManual = () => {
    setError(null)
    setNotice(null)
    setAiParsed(false)
    setDrafts((current) => [...(current ?? []), blankDraft(slot)])
  }

  const patchDraft = (index: number, patch: Partial<MealDraft>) =>
    setDrafts((current) => current?.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)) ?? null)

  const removeDraft = (index: number) =>
    setDrafts((current) => {
      const next = (current ?? []).filter((_, i) => i !== index)
      return next.length > 0 ? next : null
    })

  const save = async () => {
    if (!drafts || saving) return
    const valid = drafts.filter((draft) => draft.name.trim())
    if (valid.length === 0) {
      setError('Give each meal a name before saving.')
      return
    }
    setSaving(true)
    try {
      await addMeals(
        date,
        valid.map((draft) => ({ ...draft, name: draft.name.trim() })),
        aiParsed ? 'ai' : 'manual',
      )
      setDrafts(null)
      setText('')
      setNotice(null)
      setAiParsed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      {drafts === null ? (
        <div className="space-y-3">
          <SlotPicker value={slot} onChange={setSlot} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Describe what you ate — e.g. 2 scrambled eggs, oats with banana, black coffee"
            className="w-full resize-none rounded-2xl bg-black/30 px-3.5 py-3 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/12 placeholder:text-ink-500 focus:ring-accent/60"
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void estimate()} disabled={busy || !text.trim()} className="flex-1">
              {busy ? 'Estimating…' : '✨ Estimate with AI'}
            </Button>
            <Button variant="secondary" onClick={addManual}>
              Add manually
            </Button>
          </div>
          {error ? <p className="text-[12px] text-alert">{error}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-ink-50">
              Review {drafts.length} item{drafts.length === 1 ? '' : 's'}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                aiParsed ? 'bg-info/12 text-info' : 'bg-white/8 text-ink-300'
              }`}
            >
              {aiParsed ? 'AI estimate' : 'Manual'}
            </span>
          </div>
          {notice ? <p className="text-[12px] leading-relaxed text-ink-400">{notice}</p> : null}
          <div className="space-y-2">
            {drafts.map((draft, index) => (
              <DraftRow
                key={index}
                draft={draft}
                onChange={(patch) => patchDraft(index, patch)}
                onRemove={() => removeDraft(index)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addManual}
            className="w-full rounded-xl border border-dashed border-white/15 py-2 text-[12px] font-medium text-ink-400 hover:border-white/25 hover:text-ink-200"
          >
            + Add another item
          </button>
          {error ? <p className="text-[12px] text-alert">{error}</p> : null}
          <div className="flex gap-2 pt-1">
            <Button variant="primary" onClick={() => void save()} disabled={saving} className="flex-1">
              {saving ? 'Saving…' : `Save ${drafts.length} meal${drafts.length === 1 ? '' : 's'}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDrafts(null)
                setError(null)
                setNotice(null)
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
