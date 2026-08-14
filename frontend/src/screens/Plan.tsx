import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  advancePhase,
  allMeasurements,
  applyCalorieChange,
  importDailyLogs,
  updatePhase,
  updateSettings,
  upsertMeasurement,
} from '@/db/repo'
import { formatShort } from '@/domain/date'
import type { Phase } from '@/domain/types'
import type { PhaseReview, Recommendation } from '@/domain/rules'
import {
  API_BASE,
  downloadBackup,
  importState,
  requestPersistentStorage,
  sync,
  type StateDocument,
} from '@/sync/client'
import { getAuthState, signOut } from '@/auth/session'
import { previewExcel } from '@/import/excel'
import { useDashboard, useSyncMeta } from '@/hooks/useDashboard'
import { NumberField } from '@/components/fields'
import { fmt } from '@/components/format'
import { Button, Card, EmptyState, Meter, PageHeader, Pill, SectionTitle, Stat } from '@/components/ui'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export default function Plan() {
  const dash = useDashboard()
  const { phase, phases, settings, today, recommendation, review, change } = dash
  const meta = useSyncMeta()
  const measurements = useLiveQuery(() => allMeasurements(), [], [])
  const [status, setStatus] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [editingTargets, setEditingTargets] = useState(false)
  const auth = getAuthState()
  const pendingChanges = meta ? Math.max(0, meta.localVersion - meta.syncedVersion) : 0

  if (!phase || !settings) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const latestMeasurement = measurements?.at(-1)
  const trendWeightKg = review?.trendWeightKg ?? change?.current.averageKg ?? null

  const advance = async () => {
    const next = phases.find((p) => p.order === phase.order + 1)
    const ok = window.confirm(
      next
        ? `Close ${phase.name} and start ${next.name}? This is one-way — you can still ` +
            `override the active phase below.`
        : `Close ${phase.name}? There is no phase after this one.`,
    )
    if (!ok) return
    await advancePhase(phase.id, today)
    setStatus(`Advanced to ${next?.name ?? 'the end of the plan'}.`)
  }

  const applyRecommendation = async () => {
    if (recommendation?.proposedCalories == null) return
    const ok = window.confirm(
      `Change the daily calorie target from ${phase.calories} to ` +
        `${recommendation.proposedCalories} kcal?`,
    )
    if (!ok) return
    await applyCalorieChange(phase.id, recommendation.proposedCalories)
    setStatus(`Calorie target set to ${recommendation.proposedCalories} kcal.`)
  }

  const restore = async (file: File) => {
    const text = await file.text()
    const doc = JSON.parse(text) as StateDocument
    if (!doc.tables || typeof doc.version !== 'number') {
      setStatus('That file is not a ledger backup.')
      return
    }
    const rows = Object.values(doc.tables).reduce((n, t) => n + (t?.length ?? 0), 0)
    const ok = window.confirm(
      `Restore ${rows} records from this backup? This REPLACES everything currently ` +
        `in the app.`,
    )
    if (!ok) return
    await importState(doc)
    setStatus(`Restored ${rows} records.`)
  }

  const syncNow = async () => {
    setWorking(true)
    const result = await sync()
    setWorking(false)
    if (result.status === 'pushed') setStatus(`Synced version ${result.version} to the server.`)
    else if (result.status === 'pulled') setStatus(`Pulled version ${result.version} from the server.`)
    else if (result.status === 'clean') setStatus('Server and this device are already in sync.')
    else if (result.status === 'unauthorized') {
      setStatus('Session expired. Sign in again.')
      void signOut()
    } else if (result.status === 'conflict') {
      setStatus('Both copies changed. Download a backup before choosing which copy to keep.')
    } else if (result.status === 'offline') setStatus('Offline — your changes remain on this device.')
    else if (result.status === 'error') setStatus(`Sync failed: ${result.message}`)
    else setStatus('No sync server is configured; download a backup instead.')
  }

  const importHistory = async (file: File) => {
    setWorking(true)
    try {
      const preview = await previewExcel(file)
      if (preview.logs.length === 0) {
        setStatus('The workbook is a blank template — no dated history was found to import.')
        return
      }
      const ok = window.confirm(
        `Merge ${preview.logs.length} dated rows into the ledger? Existing fields are kept ` +
          `unless the workbook contains a value for them.`,
      )
      if (!ok) return
      await importDailyLogs(preview.logs)
      setStatus(`Imported ${preview.logs.length} dated rows from ${file.name}.`)
    } catch (error) {
      setStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setWorking(false)
    }
  }

  const span = phase.startWeightKg - phase.targetWeightKg
  const progressPct =
    trendWeightKg !== null && span > 0
      ? clamp(((phase.startWeightKg - trendWeightKg) / span) * 100, 0, 100)
      : null

  return (
    <div className="pb-4">
      <PageHeader
        title="Plan"
        action={
          <Pill tone={settings.manualPhaseOverrideId ? 'warn' : 'good'}>
            {phase.name}
            {settings.manualPhaseOverrideId ? ' · override' : ''}
          </Pill>
        }
      />
      <p className="mt-1 text-[13px] text-ink-400">Your command center. Nothing here changes on its own.</p>

      {status ? (
        <div className="mt-3 rounded-2xl bg-accent/10 px-3.5 py-2.5 text-[12px] text-accent ring-1 ring-inset ring-accent/20">
          {status}
        </div>
      ) : null}

      {/* Phase snapshot */}
      <Card className="mt-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Trend weight" value={fmt(trendWeightKg, 1)} unit="kg" sub={`in ${phase.name}`} />
          <Stat label="Phase target" value={fmt(phase.targetWeightKg, 1)} unit="kg" />
          <Stat
            label="Remaining"
            value={review?.remainingKg != null ? fmt(review.remainingKg, 1) : trendWeightKg === null ? null : '0.0'}
            unit="kg"
            tone={review?.remainingKg === 0 ? 'good' : 'default'}
          />
          <Stat
            label="Phase"
            value={`${phase.order}`}
            sub={`of ${phases.length}`}
          />
        </div>
        {progressPct !== null ? (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] text-ink-400">
              <span>{phase.startWeightKg} kg start</span>
              <span>{Math.round(progressPct)}% · {phase.targetWeightKg} kg</span>
            </div>
            <Meter value={progressPct} tone={progressPct >= 100 ? 'accent' : 'info'} />
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-ink-500">
            Log a few weigh-ins and phase progress appears here.
          </p>
        )}
      </Card>

      {/* Next decision */}
      <SectionTitle>Next decision</SectionTitle>
      <NextDecision
        phase={phase}
        recommendation={recommendation}
        review={review}
        onApply={() => void applyRecommendation()}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        {/* Operating targets */}
        <div>
          <SectionTitle
            action={
              <button
                type="button"
                onClick={() => setEditingTargets((v) => !v)}
                className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold text-ink-200 ring-1 ring-inset ring-white/12 hover:bg-white/12"
              >
                {editingTargets ? 'Done' : 'Edit targets'}
              </button>
            }
          >
            Operating targets
          </SectionTitle>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Calories" value={phase.calories.toLocaleString()} unit="kcal" sub={`floor ${settings.calorieFloor}`} />
              <Stat label="Protein" value={phase.proteinG} unit="g" />
              <Stat label="Steps" value={phase.steps.toLocaleString()} />
              <Stat label="Sleep" value={phase.sleepHours} unit="h" />
            </div>
            <p className="mt-3 border-t border-white/8 pt-3 text-[11px] text-ink-400">
              Phase goal {phase.startWeightKg} → {phase.targetWeightKg} kg
              {phase.targetWaistCm != null ? ` · waist ${phase.targetWaistCm} cm` : ''} ·{' '}
              {phase.calorieCutsApplied}/{settings.maxCalorieCutsPerPhase} cuts used
            </p>

            {editingTargets ? (
              <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                <NumberField
                  label="Daily calories"
                  unit="kcal"
                  inputMode="numeric"
                  value={phase.calories}
                  onCommit={(calories) => calories != null && void updatePhase(phase.id, { calories })}
                  target={`Floor is ${settings.calorieFloor} kcal · a manual edit does not count as a cut`}
                />
                <NumberField
                  label="Protein"
                  unit="g"
                  inputMode="numeric"
                  value={phase.proteinG}
                  onCommit={(proteinG) => proteinG != null && void updatePhase(phase.id, { proteinG })}
                />
                <NumberField
                  label="Steps"
                  inputMode="numeric"
                  value={phase.steps}
                  onCommit={(steps) => steps != null && void updatePhase(phase.id, { steps })}
                />
                <NumberField
                  label="Sleep"
                  unit="h"
                  step="0.25"
                  value={phase.sleepHours}
                  onCommit={(sleepHours) => sleepHours != null && void updatePhase(phase.id, { sleepHours })}
                />
                <NumberField
                  label="Meals per day"
                  inputMode="numeric"
                  value={phase.mealsPerDay}
                  onCommit={(mealsPerDay) => mealsPerDay != null && void updatePhase(phase.id, { mealsPerDay })}
                />
                <NumberField
                  label="Phase target weight"
                  unit="kg"
                  step="0.1"
                  value={phase.targetWeightKg}
                  onCommit={(targetWeightKg) =>
                    targetWeightKg != null && void updatePhase(phase.id, { targetWeightKg })
                  }
                />
                <NumberField
                  label="Phase target waist"
                  unit="cm"
                  step="0.5"
                  value={phase.targetWaistCm}
                  onCommit={(targetWaistCm) => void updatePhase(phase.id, { targetWaistCm })}
                />
                <p className="text-[11px] leading-relaxed text-ink-500">
                  Edits save as you type and only change {phase.name}.
                </p>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Phase roadmap */}
        <div>
          <SectionTitle>Phase roadmap</SectionTitle>
          <PhaseRoadmap phases={phases} activeId={phase.id} />
        </div>
      </div>

      {/* Manage */}
      <SectionTitle>Manage</SectionTitle>

      <Manage title="Phase management">
        <ul className="space-y-1.5">
          {phases.map((p) => {
            const active = p.id === phase.id
            return (
              <li key={p.id} className="flex items-center gap-2.5 text-[13px]">
                <button
                  type="button"
                  onClick={() =>
                    void updateSettings({
                      manualPhaseOverrideId: settings.manualPhaseOverrideId === p.id ? null : p.id,
                    })
                  }
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    active ? 'bg-accent text-ink-950' : 'bg-white/8 text-ink-600 ring-1 ring-inset ring-white/10'
                  }`}
                  aria-label={`Make ${p.name} active`}
                >
                  {active ? '●' : ''}
                </button>
                <span className={active ? 'text-ink-50' : 'text-ink-400'}>{p.name}</span>
                <span className="tabular ml-auto text-[12px] text-ink-400">
                  {p.startWeightKg} → {p.targetWeightKg} kg · {p.calories} kcal
                </span>
                {p.endedOn ? <span className="text-[10px] text-ink-600">{formatShort(p.endedOn)}</span> : null}
              </li>
            )
          })}
        </ul>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void advance()}>Advance phase</Button>
          {settings.manualPhaseOverrideId ? (
            <Button variant="ghost" onClick={() => void updateSettings({ manualPhaseOverrideId: null })}>
              Clear override
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          Phases never advance on their own. Tapping a dot overrides which phase is active without closing
          the current one.
        </p>
      </Manage>

      <Manage title="Measurements">
        <div className="space-y-2">
          <NumberField
            label="Waist"
            unit="cm"
            step="0.5"
            value={latestMeasurement?.date === today ? (latestMeasurement.waistCm ?? null) : null}
            onCommit={(waistCm) => void upsertMeasurement(today, { waistCm })}
            target={
              latestMeasurement?.waistCm != null
                ? `Last ${latestMeasurement.waistCm} cm on ${formatShort(latestMeasurement.date)}`
                : 'Measure at the navel, first thing, relaxed'
            }
          />
          <NumberField
            label="Chest"
            unit="cm"
            step="0.5"
            value={latestMeasurement?.date === today ? (latestMeasurement.chestCm ?? null) : null}
            onCommit={(chestCm) => void upsertMeasurement(today, { chestCm })}
          />
          <NumberField
            label="Thigh"
            unit="cm"
            step="0.5"
            value={latestMeasurement?.date === today ? (latestMeasurement.thighCm ?? null) : null}
            onCommit={(thighCm) => void upsertMeasurement(today, { thighCm })}
          />
          <NumberField
            label="Arm"
            unit="cm"
            step="0.5"
            value={latestMeasurement?.date === today ? (latestMeasurement.armCm ?? null) : null}
            onCommit={(armCm) => void upsertMeasurement(today, { armCm })}
          />
        </div>
      </Manage>

      <Manage title="Rules & safeguards">
        <div className="space-y-2">
          <NumberField
            label="Calorie floor"
            unit="kcal"
            inputMode="numeric"
            value={settings.calorieFloor}
            onCommit={(calorieFloor) => calorieFloor != null && void updateSettings({ calorieFloor })}
            target="No recommendation will ever go below this"
          />
          <NumberField
            label="Target loss, min"
            unit="kg/wk"
            step="0.1"
            value={settings.targetLossPerWeekMin}
            onCommit={(v) => v != null && void updateSettings({ targetLossPerWeekMin: v })}
          />
          <NumberField
            label="Target loss, max"
            unit="kg/wk"
            step="0.1"
            value={settings.targetLossPerWeekMax}
            onCommit={(v) => v != null && void updateSettings({ targetLossPerWeekMax: v })}
          />
          <NumberField
            label="Too-fast threshold"
            unit="kg/wk"
            step="0.1"
            value={settings.fastLossPerWeekThreshold}
            onCommit={(v) => v != null && void updateSettings({ fastLossPerWeekThreshold: v })}
            target="Above this, the engine suggests adding calories back"
          />
          <NumberField
            label="Plateau threshold"
            unit="kg/wk"
            step="0.05"
            value={settings.plateauLossPerWeekThreshold}
            onCommit={(v) => v != null && void updateSettings({ plateauLossPerWeekThreshold: v })}
          />
          <NumberField
            label="Plateau weeks before a cut"
            inputMode="numeric"
            value={settings.plateauWeeksBeforeCut}
            onCommit={(v) => v != null && void updateSettings({ plateauWeeksBeforeCut: v })}
          />
          <NumberField
            label="Max cuts per phase"
            inputMode="numeric"
            value={settings.maxCalorieCutsPerPhase}
            onCommit={(v) => v != null && void updateSettings({ maxCalorieCutsPerPhase: v })}
          />
          <NumberField
            label="Days to hold under target"
            inputMode="numeric"
            value={settings.phaseHoldDays}
            onCommit={(v) => v != null && void updateSettings({ phaseHoldDays: v })}
            target="Hysteresis before a phase review is offered"
          />
          <NumberField
            label="Min weigh-ins per week"
            inputMode="numeric"
            value={settings.minReadingsPerWindow}
            onCommit={(v) => v != null && void updateSettings({ minReadingsPerWindow: v })}
            target="Below this, the trend reports insufficient data"
          />
          <NumberField
            label="Good compliance"
            unit="%"
            inputMode="numeric"
            value={settings.goodCompliancePct}
            onCommit={(v) => v != null && void updateSettings({ goodCompliancePct: v })}
          />
        </div>
      </Manage>

      <Manage title="Data & device">
        <label className="block">
          <span className="text-[13px] font-medium text-ink-200">Local calendar timezone</span>
          <select
            value={settings.timezone}
            onChange={(e) => void updateSettings({ timezone: e.target.value })}
            className="mt-2 w-full rounded-xl bg-black/25 px-3 py-2.5 text-sm text-ink-50 outline-none ring-1 ring-inset ring-white/10 focus:ring-accent/60"
          >
            {timezoneOptions(settings.timezone).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
          Decides which calendar day a late-night entry belongs to. Changing it does not move logs you have
          already written.
        </p>

        <div className="mt-4 flex items-start gap-3 border-t border-white/8 pt-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-lg font-bold text-ink-950">
            {auth?.user.picture ? (
              <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              (auth?.user.name ?? auth?.user.email ?? 'A').charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-50">{auth?.user.name ?? 'Signed in'}</div>
            <div className="truncate text-[12px] text-ink-400">{auth?.user.email ?? 'Google account'}</div>
          </div>
          <Pill tone={pendingChanges === 0 ? 'good' : 'info'}>
            {pendingChanges === 0 ? 'Synced' : `${pendingChanges} pending`}
          </Pill>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {API_BASE ? (
            <Button variant="primary" onClick={() => void syncNow()} disabled={working}>
              {working ? 'Working…' : 'Sync now'}
            </Button>
          ) : null}
          <Button
            variant={API_BASE ? 'secondary' : 'primary'}
            onClick={() => void downloadBackup().then(() => setStatus('Downloaded a complete JSON backup.'))}
          >
            Download backup
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white/8 px-4 text-sm ring-1 ring-inset ring-white/12 active:bg-white/12">
            Restore from file
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void restore(file)
                e.target.value = ''
              }}
            />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white/8 px-4 text-sm text-ink-50 ring-1 ring-inset ring-white/12 active:bg-white/12">
            {working ? 'Reading workbook…' : 'Import Excel'}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={working}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importHistory(file)
                event.target.value = ''
              }}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              void requestPersistentStorage().then((granted) =>
                setStatus(
                  granted
                    ? 'Browser granted persistent storage.'
                    : 'Browser declined persistent storage — keep downloading backups.',
                ),
              )
            }
          >
            Request persistent storage
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const ok = window.confirm(
                'Sign out and clear this device copy? Your synced cloud data stays with your Google account.',
              )
              if (ok) void signOut()
            }}
          >
            Sign out
          </Button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-ink-400">Local version</dt>
          <dd className="tabular text-right text-ink-200">{meta?.localVersion ?? 0}</dd>
          <dt className="text-ink-400">Server version</dt>
          <dd className="tabular text-right text-ink-200">{meta?.syncedVersion ?? 0}</dd>
          <dt className="text-ink-400">Last synced</dt>
          <dd className="tabular text-right text-ink-200">
            {meta?.lastSyncedAt ? new Date(meta.lastSyncedAt).toLocaleString() : 'Never'}
          </dd>
          <dt className="text-ink-400">Daily logs stored</dt>
          <dd className="tabular text-right text-ink-200">{dash.logs.length}</dd>
          {meta?.lastError ? (
            <>
              <dt className="text-ink-400">Last sync issue</dt>
              <dd className="text-right text-warn">{meta.lastError}</dd>
            </>
          ) : null}
        </dl>
      </Manage>
    </div>
  )
}

/**
 * The single most important thing to look at: an actionable calorie change to
 * accept, or otherwise where the phase review stands. Actionability is read from
 * the rule's own `severity`/`proposedCalories`, never by enumerating codes — so
 * warns like `floor_reached` correctly render as information, not an Apply.
 */
function NextDecision({
  phase,
  recommendation,
  review,
  onApply,
}: {
  phase: Phase
  recommendation: Recommendation | undefined
  review: PhaseReview | undefined
  onApply: () => void
}) {
  const actionable = recommendation?.severity === 'action' && recommendation.proposedCalories != null

  if (actionable && recommendation) {
    const isCut = recommendation.deltaKcal != null && recommendation.deltaKcal < 0
    return (
      <Card className="border border-info/30">
        <h3 className="text-[15px] font-semibold leading-snug text-ink-50">{recommendation.headline}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">{recommendation.detail}</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="tabular text-[13px] text-ink-400">
            {phase.calories} → <span className="font-semibold text-ink-50">{recommendation.proposedCalories}</span> kcal
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={onApply}>
            Set target to {recommendation.proposedCalories} kcal
          </Button>
          <span className="text-[11px] text-ink-400">
            {isCut ? 'Counts as a cut for this phase' : 'Does not count as a cut'}
          </span>
        </div>
      </Card>
    )
  }

  const holdMeter =
    review && (review.code === 'approaching' || review.code === 'ready_for_review') && review.daysRequired > 0

  return (
    <Card>
      <h3 className="text-[15px] font-semibold leading-snug text-ink-50">
        {review?.headline ?? 'Keep executing the plan'}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
        {review?.detail ?? 'No change is due. Keep logging and the engine will surface the next decision here.'}
      </p>

      {holdMeter && review ? (
        <div className="mt-3">
          <div className="mb-1.5 flex justify-between text-[11px] text-ink-400">
            <span>Holding under target</span>
            <span className="tabular">
              {review.daysHeld}/{review.daysRequired} days
            </span>
          </div>
          <Meter
            value={clamp((review.daysHeld / review.daysRequired) * 100, 0, 100)}
            tone={review.code === 'ready_for_review' ? 'accent' : 'info'}
          />
        </div>
      ) : null}

      {/* A non-actionable recommendation (e.g. at the floor, cuts capped) still
          carries useful guidance — surface it under the review, not as an Apply. */}
      {recommendation && !actionable && recommendation.severity === 'warn' ? (
        <div className="mt-3 rounded-xl bg-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
          <span className="font-semibold">{recommendation.headline}.</span> {recommendation.detail}
        </div>
      ) : null}

      {review?.code === 'ready_for_review' ? (
        <p className="mt-3 text-[11px] text-ink-500">
          Advance the phase from Manage → Phase management when you&apos;re ready. It never happens
          automatically.
        </p>
      ) : null}
    </Card>
  )
}

/** Ordered, read-only phase stages. Selection lives in Manage to avoid slips. */
function PhaseRoadmap({ phases, activeId }: { phases: Phase[]; activeId: string }) {
  return (
    <Card>
      <ol className="space-y-2.5">
        {phases.map((p) => {
          const active = p.id === activeId
          const done = p.endedOn != null
          return (
            <li key={p.id} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? 'bg-accent text-ink-950 shadow-[0_0_12px_-2px] shadow-accent/60'
                    : done
                      ? 'bg-info/20 text-info ring-1 ring-inset ring-info/30'
                      : 'bg-white/6 text-ink-500 ring-1 ring-inset ring-white/10'
                }`}
              >
                {done ? '✓' : p.order}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[13px] font-medium ${active ? 'text-ink-50' : done ? 'text-ink-300' : 'text-ink-400'}`}>
                    {p.name}
                    {active ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent">Active</span> : null}
                  </span>
                  {p.endedOn ? <span className="text-[10px] text-ink-600">{formatShort(p.endedOn)}</span> : null}
                </div>
                <div className="tabular mt-0.5 text-[11px] text-ink-500">
                  {p.startWeightKg} → {p.targetWeightKg} kg · {p.calories} kcal · {p.proteinG} g protein
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/** Collapsed disclosure for lower-risk and administrative controls. */
function Manage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group surface mt-2 overflow-hidden rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[13px] font-semibold text-ink-100 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-ink-500 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-white/8 px-4 py-4">{children}</div>
    </details>
  )
}

/** The device timezone plus a few likely alternatives, deduplicated. */
function timezoneOptions(current: string): string[] {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  const common = [
    'Asia/Kolkata',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'Australia/Sydney',
    'UTC',
  ]
  return Array.from(new Set([current, device, ...common].filter(Boolean)))
}
