import type { ReactNode } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  advancePhase,
  allMeasurements,
  applyCalorieChange,
  updatePhase,
  updateSettings,
  upsertMeasurement,
} from '@/db/repo'
import { Button, EmptyState, Meter, PageHeader, Pill } from '@/components/ui'
import { NumberField } from '@/components/fields'
import { fmt } from '@/components/format'
import { formatShort } from '@/domain/date'
import type { Phase } from '@/domain/types'
import { SPLIT_LABEL, describeSchedule } from './plan/training'
import type { PhaseReview, Recommendation } from '@/domain/rules'
import { useDashboard } from '@/hooks/useDashboard'
import {
  expectedPaceCopy,
  isActionableCalorieRecommendation,
  presentNextDecision,
  roadmapStatus,
  snapshotRemainingKg,
} from './plan/decision'
import './plan/plan.css'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export default function Plan() {
  const dash = useDashboard()
  const { phase, phases, settings, today, recommendation, review, change } = dash
  const measurements = useLiveQuery(() => allMeasurements(), [], [])
  const [status, setStatus] = useState<string | null>(null)

  if (!phase || !settings) {
    return <EmptyState title="Setting up your plan" body="Your active phase will appear here." />
  }

  const latestMeasurement = measurements.at(-1)
  const trendWeightKg = review?.trendWeightKg ?? change?.current.averageKg ?? null
  const remainingKg = snapshotRemainingKg(review?.remainingKg, trendWeightKg)
  const span = phase.startWeightKg - phase.targetWeightKg
  const progressPct =
    trendWeightKg !== null && span > 0
      ? clamp(((phase.startWeightKg - trendWeightKg) / span) * 100, 0, 100)
      : null
  const pace = expectedPaceCopy(
    change?.lossKgPerWeek,
    settings.targetLossPerWeekMin,
    settings.targetLossPerWeekMax,
  )

  const applyRecommendation = async () => {
    if (!isActionableCalorieRecommendation(recommendation)) return
    const ok = window.confirm(
      `Set the daily calorie target to ${recommendation.proposedCalories.toLocaleString()} kcal?`,
    )
    if (!ok) return
    await applyCalorieChange(phase.id, recommendation.proposedCalories)
    setStatus(`Daily calories updated to ${recommendation.proposedCalories.toLocaleString()} kcal.`)
  }

  const advance = async () => {
    const next = phases.find((candidate) => candidate.order === phase.order + 1)
    const ok = window.confirm(
      next
        ? `Close ${phase.name} and begin ${next.name}?`
        : `Close ${phase.name}? There is no later phase.`,
    )
    if (!ok) return
    await advancePhase(phase.id, today)
    setStatus(next ? `${next.name} is now active.` : `${phase.name} was completed.`)
  }

  return (
    <div className="plan-page">
      <PageHeader
        eyebrow="Rules decide, you confirm"
        title="Plan"
        action={
          <Pill tone={settings.manualPhaseOverrideId ? 'warn' : 'good'}>
            {phase.name}{settings.manualPhaseOverrideId ? ' · override' : ''}
          </Pill>
        }
      />

      {status ? (
        <p className="plan-status app-tone-success" role="status">
          {status}
        </p>
      ) : null}

      <section className="plan-command-grid" aria-label="Plan decision and progress">
        <NextDecision
          phase={phase}
          recommendation={recommendation}
          review={review}
          onApply={() => void applyRecommendation()}
        />

        <div className="plan-snapshot app-panel">
          <div className="plan-section-heading">
            <p className="app-eyebrow">Current phase</p>
            <h2>Your progress</h2>
          </div>
          <div className="plan-metric-grid">
            <Metric label="Trend weight" value={fmt(trendWeightKg, 1)} unit="kg" />
            <Metric label="Target" value={fmt(phase.targetWeightKg, 1)} unit="kg" />
            <Metric label="Remaining" value={fmt(remainingKg, 1)} unit="kg" />
            <Metric label="Weekly pace" value={pace.current} />
          </div>
          <div className="plan-progress">
            <div>
              <span>Phase progress</span>
              <strong>{progressPct === null ? '—' : `${Math.round(progressPct)}%`}</strong>
            </div>
            <Meter value={progressPct} tone="info" />
            <p>Expected pace {pace.range}</p>
          </div>
        </div>
      </section>

      <section className="plan-section" aria-labelledby="current-plan-title">
        <div className="plan-section-heading">
          <p className="app-eyebrow">Current plan</p>
          <h2 id="current-plan-title">What you are working toward</h2>
        </div>
        <div className="plan-current-grid">
          <div className="plan-targets app-panel">
            <div className="plan-metric-grid">
              <Metric label="Calories" value={phase.calories.toLocaleString()} unit="kcal" />
              <Metric label="Protein" value={phase.proteinG.toLocaleString()} unit="g" />
              <Metric label="Steps" value={phase.steps.toLocaleString()} />
              <Metric label="Sleep" value={fmt(phase.sleepHours, 1)} unit="h" />
            </div>
            <p className="plan-target-note">
              {phase.startWeightKg} to {phase.targetWeightKg} kg · {phase.calorieCutsApplied}/
              {settings.maxCalorieCutsPerPhase} calorie adjustments used
            </p>
          </div>
          <PhaseRoadmap phases={phases} activeId={phase.id} />
        </div>
      </section>

      <section className="plan-section" aria-labelledby="training-plan-title">
        <div className="plan-section-heading">
          <p className="app-eyebrow">Training</p>
          <h2 id="training-plan-title">How your week is built</h2>
        </div>
        <TrainingPlan phase={phase} />
      </section>

      <section className="plan-section" aria-labelledby="manage-plan-title">
        <div className="plan-section-heading">
          <p className="app-eyebrow">Manage</p>
          <h2 id="manage-plan-title">Controls and safeguards</h2>
        </div>

        <Manage title="Targets">
          <div className="plan-fields">
            <NumberField
              label="Daily calories"
              unit="kcal"
              inputMode="numeric"
              value={phase.calories}
              onCommit={(calories) => calories != null && void updatePhase(phase.id, { calories })}
              target={`Floor ${settings.calorieFloor} kcal · manual edits do not count as recommendations`}
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
              label="Target weight"
              unit="kg"
              step="0.1"
              value={phase.targetWeightKg}
              onCommit={(targetWeightKg) => targetWeightKg != null && void updatePhase(phase.id, { targetWeightKg })}
            />
            <NumberField
              label="Target waist"
              unit="cm"
              step="0.5"
              value={phase.targetWaistCm}
              onCommit={(targetWaistCm) => void updatePhase(phase.id, { targetWaistCm })}
            />
          </div>
        </Manage>

        <Manage title="Phase control">
          <ul className="plan-phase-list">
            {phases.map((candidate) => {
              const active = candidate.id === phase.id
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={`plan-phase-radio ${active ? 'is-active' : ''}`}
                    onClick={() =>
                      void updateSettings({
                        manualPhaseOverrideId:
                          settings.manualPhaseOverrideId === candidate.id ? null : candidate.id,
                      })
                    }
                    aria-label={`${active ? 'Clear' : 'Set'} ${candidate.name} phase override`}
                  />
                  <span>{candidate.name}</span>
                  <span className="plan-phase-meta">
                    {candidate.startWeightKg} to {candidate.targetWeightKg} kg
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="plan-manage-actions">
            <Button variant="danger" onClick={() => void advance()}>
              Advance phase
            </Button>
            {settings.manualPhaseOverrideId ? (
              <Button variant="ghost" onClick={() => void updateSettings({ manualPhaseOverrideId: null })}>
                Clear override
              </Button>
            ) : null}
          </div>
        </Manage>

        <Manage title="Measurements">
          <div className="plan-fields">
            <NumberField
              label="Waist"
              unit="cm"
              step="0.5"
              value={latestMeasurement?.date === today ? (latestMeasurement.waistCm ?? null) : null}
              onCommit={(waistCm) => void upsertMeasurement(today, { waistCm })}
              target={
                latestMeasurement?.waistCm != null
                  ? `Last ${latestMeasurement.waistCm} cm on ${formatShort(latestMeasurement.date)}`
                  : 'Measure relaxed at the navel'
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

        <Manage title="Recommendation safeguards">
          <div className="plan-fields">
            <NumberField
              label="Calorie floor"
              unit="kcal"
              inputMode="numeric"
              value={settings.calorieFloor}
              onCommit={(calorieFloor) => calorieFloor != null && void updateSettings({ calorieFloor })}
            />
            <NumberField
              label="Target loss, min"
              unit="kg/wk"
              step="0.1"
              value={settings.targetLossPerWeekMin}
              onCommit={(targetLossPerWeekMin) =>
                targetLossPerWeekMin != null && void updateSettings({ targetLossPerWeekMin })
              }
            />
            <NumberField
              label="Target loss, max"
              unit="kg/wk"
              step="0.1"
              value={settings.targetLossPerWeekMax}
              onCommit={(targetLossPerWeekMax) =>
                targetLossPerWeekMax != null && void updateSettings({ targetLossPerWeekMax })
              }
            />
            <NumberField
              label="Max cuts per phase"
              inputMode="numeric"
              value={settings.maxCalorieCutsPerPhase}
              onCommit={(maxCalorieCutsPerPhase) =>
                maxCalorieCutsPerPhase != null && void updateSettings({ maxCalorieCutsPerPhase })
              }
            />
            <NumberField
              label="Days held before review"
              inputMode="numeric"
              value={settings.phaseHoldDays}
              onCommit={(phaseHoldDays) => phaseHoldDays != null && void updateSettings({ phaseHoldDays })}
            />
            <NumberField
              label="Minimum weekly weigh-ins"
              inputMode="numeric"
              value={settings.minReadingsPerWindow}
              onCommit={(minReadingsPerWindow) =>
                minReadingsPerWindow != null && void updateSettings({ minReadingsPerWindow })
              }
            />
          </div>
        </Manage>
      </section>
    </div>
  )
}

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
  const presentation = presentNextDecision(recommendation, review)
  const actionable = isActionableCalorieRecommendation(recommendation)
  const title = recommendation?.headline ?? review?.headline ?? 'Keep executing the plan'
  const detail =
    recommendation?.detail ??
    review?.detail ??
    'Keep logging. Formara will surface the next decision when there is enough evidence.'

  return (
    <div className={`plan-decision app-panel ${actionable ? 'app-tone-action' : 'app-tone-coach'}`}>
      <div className="plan-section-heading">
        <p className="app-eyebrow">Next decision</p>
        <h2>{title}</h2>
      </div>
      <p className="plan-decision-copy">{detail}</p>

      {actionable ? (
        <div className="plan-decision-action">
          <div>
            <span>Daily target</span>
            <strong>
              {phase.calories.toLocaleString()} to {recommendation.proposedCalories.toLocaleString()} kcal
            </strong>
          </div>
          <Button variant="primary" onClick={onApply}>
            Apply change
          </Button>
        </div>
      ) : null}

      {presentation.showHoldMeter && review ? (
        <div className="plan-hold">
          <div>
            <span>Holding under target</span>
            <strong>{review.daysHeld}/{review.daysRequired} days</strong>
          </div>
          <Meter value={clamp((review.daysHeld / review.daysRequired) * 100, 0, 100)} tone="info" />
        </div>
      ) : null}

      {presentation.showWarnCallout && recommendation ? (
        <p className="plan-warning app-tone-energy">{recommendation.detail}</p>
      ) : null}

      {(presentation.showReviewSecondary || (!actionable && review?.headline !== title)) && review ? (
        <p className="plan-secondary-note">
          <strong>{review.headline}.</strong> {review.detail}
        </p>
      ) : null}
    </div>
  )
}

function PhaseRoadmap({ phases, activeId }: { phases: Phase[]; activeId: string }) {
  return (
    <div className="plan-roadmap app-panel">
      <ol>
        {phases.map((phase) => {
          const state = roadmapStatus(phase.endedOn, phase.id === activeId)
          return (
            <li key={phase.id} className={`is-${state}`}>
              <span className="plan-roadmap-index">{state === 'completed' ? '✓' : phase.order}</span>
              <div>
                <strong>{phase.name}</strong>
                <span>{phase.startWeightKg} to {phase.targetWeightKg} kg</span>
              </div>
              <span className="plan-roadmap-state">{state}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * The training half of the plan.
 *
 * Plan was nutrition-only — calories, protein, steps, sleep — while the split
 * and weekly schedule that drive every training decision lived nowhere the
 * user could see them. This makes Plan the whole programme rather than half
 * of it, and states the reasoning in plain language rather than presenting the
 * schedule as a given.
 */
function TrainingPlan({ phase }: { phase: Phase }) {
  const summary = describeSchedule(phase.schedule)

  return (
    <div className="plan-current-grid">
      <div className="plan-targets app-panel">
        <div className="plan-metric-grid">
          <Metric label="Gym days" value={summary.gymDays} unit="/wk" />
          <Metric label="Run days" value={summary.runDays} unit="/wk" />
          <Metric label="Weekly run" value={summary.weeklyRunKm} unit="km" />
          <Metric label="Rest days" value={summary.restDays} unit="/wk" />
        </div>
        <p className="plan-target-note">{summary.rationale}</p>
      </div>

      <div className="plan-roadmap app-panel">
        <ol>
          {phase.schedule.map((day) => (
            <li key={day.dow} className={day.gym || day.runKm ? 'is-current' : ''}>
              <span className="plan-roadmap-index">{SPLIT_LABEL[day.dow]}</span>
              <div>
                <strong className="capitalize">{day.gym ? day.sessionType : 'Rest'}</strong>
                <span>{day.runKm ? `${day.runKm} km ${day.runType ?? 'run'}` : 'No run'}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="plan-metric app-inset">
      <span>{label}</span>
      <strong>
        {value ?? '—'}{value !== null && unit ? <small>{unit}</small> : null}
      </strong>
    </div>
  )
}

function Manage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="plan-manage app-surface">
      <summary>
        <span>{title}</span>
        <span className="plan-manage-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="plan-manage-body">{children}</div>
    </details>
  )
}
