import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addRun,
  allPhases,
  deleteRun,
  getLog,
  getMeasurement,
  getSettings,
  mealsForDate,
  resolvePhaseForDate,
  runsForDate,
  updateRun,
  upsertLog,
  upsertMeasurement,
} from '@/db/repo'
import { asLocalDate, formatShort, isLocalDate, todayIn } from '@/domain/date'
import { planDayLabel } from '@/domain/plan'
import type { LocalDate, Rating, RunType } from '@/domain/types'
import { NumberField, RatingField, TextArea, TriToggle } from '@/components/fields'
import { Card, EmptyState, PageHeader, Pill, SectionTitle } from '@/components/ui'
import { DayFoodSection } from '@/components/food/DayFoodSection'

const RUN_TYPES: RunType[] = ['recovery', 'easy', 'long', 'tempo', 'intervals']

function validDate(raw: string | undefined): LocalDate | null {
  return raw && isLocalDate(raw) ? asLocalDate(raw) : null
}

export default function DayDetail() {
  const params = useParams()
  const date = validDate(params.date)
  const settings = useLiveQuery(() => getSettings(), [])
  const phases = useLiveQuery(() => allPhases(), [], [])
  const log = useLiveQuery(() => (date ? getLog(date) : Promise.resolve(undefined)), [date])
  const measurement = useLiveQuery(
    () => (date ? getMeasurement(date) : Promise.resolve(undefined)),
    [date],
  )
  const runs = useLiveQuery(() => (date ? runsForDate(date) : Promise.resolve([])), [date], [])
  const meals = useLiveQuery(() => (date ? mealsForDate(date) : Promise.resolve([])), [date], [])

  if (!date) {
    return <EmptyState title="Invalid day" body="That calendar day could not be opened." />
  }
  if (!settings || !phases.length) {
    return <EmptyState title="Loading day" body="Preparing your plan context." />
  }

  const phase = resolvePhaseForDate(phases, date)
  // The Training screen (/workout) is always TODAY's live set-logging session —
  // it has no historical mode — so linking to it from a past day silently
  // jumped the user to today's workout. Only offer it when this day is today.
  const isToday = date === todayIn(settings.timezone)
  const save = (patch: Parameters<typeof upsertLog>[1]) => void upsertLog(date, patch)
  const targetProp = (target: string | undefined) => (target ? { target } : {})

  return (
    <div className="pb-4">
      <PageHeader
        eyebrow={planDayLabel(settings.planStartDate, date)}
        title={formatShort(date, true)}
        action={
          <Link
            to="/calendar"
            className="glass-inset radius-control px-3 py-2 type-caption font-semibold text-[var(--app-ink)]"
          >
            Calendar
          </Link>
        }
      />

      {phase ? (
        <Card className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="type-caption font-semibold text-[var(--app-ink)]">{phase.name}</div>
              <div className="mt-1 type-caption text-[var(--app-muted)]">
                {phase.calories} kcal · {phase.proteinG} g protein · {phase.steps.toLocaleString()} steps
              </div>
            </div>
            <Pill tone="info">{phase.targetWeightKg} kg target</Pill>
          </div>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <section>
          <SectionTitle>Food</SectionTitle>
          <DayFoodSection date={date} meals={meals} log={log} phase={phase} />

          <SectionTitle>Daily log</SectionTitle>
          <div className="space-y-3">
            <NumberField label="Weight" value={log?.weightKg ?? null} unit="kg" onCommit={(weightKg) => save({ weightKg })} />
            <NumberField label="Steps" value={log?.steps ?? null} {...targetProp(phase ? `Target ${phase.steps.toLocaleString()}` : undefined)} inputMode="numeric" onCommit={(steps) => save({ steps })} />
            <NumberField label="Sleep" value={log?.sleepHours ?? null} unit="h" {...targetProp(phase ? `Target ${phase.sleepHours}` : undefined)} onCommit={(sleepHours) => save({ sleepHours })} />
            <TriToggle label="Gym" value={log?.gymDone ?? null} onChange={(gymDone) => save({ gymDone })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <RatingField label="Energy" value={log?.energy ?? null} onChange={(energy) => save({ energy: energy as Rating | null })} lowLabel="low" highLabel="high" />
              <RatingField label="Hunger" value={log?.hunger ?? null} onChange={(hunger) => save({ hunger: hunger as Rating | null })} lowLabel="easy" highLabel="hard" />
              <RatingField label="Soreness" value={log?.soreness ?? null} onChange={(soreness) => save({ soreness: soreness as Rating | null })} lowLabel="fresh" highLabel="sore" />
            </div>
            <TextArea label="Notes" value={log?.notes ?? null} onCommit={(notes) => save({ notes })} />
          </div>
        </section>

        <aside className="space-y-5">
          <div>
            <SectionTitle>Measurements</SectionTitle>
            <div className="space-y-3">
              <NumberField label="Waist" value={measurement?.waistCm ?? null} unit="cm" onCommit={(waistCm) => void upsertMeasurement(date, { waistCm })} />
              <NumberField label="Chest" value={measurement?.chestCm ?? null} unit="cm" onCommit={(chestCm) => void upsertMeasurement(date, { chestCm })} />
              <NumberField label="Hips" value={measurement?.hipsCm ?? null} unit="cm" onCommit={(hipsCm) => void upsertMeasurement(date, { hipsCm })} />
              <NumberField label="Thigh" value={measurement?.thighCm ?? null} unit="cm" onCommit={(thighCm) => void upsertMeasurement(date, { thighCm })} />
              <NumberField label="Arm" value={measurement?.armCm ?? null} unit="cm" onCommit={(armCm) => void upsertMeasurement(date, { armCm })} />
            </div>
          </div>

          <div id="runs" className="scroll-mt-6">
            <SectionTitle
              action={
                <button
                  type="button"
                  onClick={() => void addRun(date, 'easy')}
                  className="rounded-full bg-accent/15 px-3 py-1 type-caption font-semibold text-accent ring-1 ring-inset ring-accent/25"
                >
                  Add run
                </button>
              }
            >
              Runs
            </SectionTitle>
            <div className="space-y-3">
              {runs.length === 0 ? (
                <Card>
                  <div className="type-caption text-[var(--app-ink-soft)]">No runs logged for this day.</div>
                </Card>
              ) : (
                runs.map((run) => (
                  <Card key={run.id}>
                    <div className="flex gap-1">
                      {RUN_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => void updateRun(run.id, { type })}
                          className={`rounded-full px-2.5 py-1 type-caption font-semibold ${ run.type === type ? 'bg-info text-ink-950' : 'bg-[var(--app-inset)] text-[var(--app-muted)]' }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <NumberField label="Distance" value={run.distanceKm} unit="km" onCommit={(distanceKm) => void updateRun(run.id, { distanceKm })} />
                      <NumberField label="Duration" value={run.durationMin} unit="min" onCommit={(durationMin) => void updateRun(run.id, { durationMin })} />
                      <NumberField label="RPE" value={run.rpe} onCommit={(rpe) => void updateRun(run.id, { rpe })} />
                      <NumberField label="Avg HR" value={run.avgHr} unit="bpm" onCommit={(avgHr) => void updateRun(run.id, { avgHr })} />
                    </div>
                    <TextArea label="Run notes" value={run.notes} onCommit={(notes) => void updateRun(run.id, { notes })} />
                    <button
                      type="button"
                      onClick={() => void deleteRun(run.id)}
                      className="mt-3 radius-control bg-alert/15 px-3 py-2 type-caption font-semibold text-alert ring-1 ring-inset ring-alert/25"
                    >
                      Delete run
                    </button>
                  </Card>
                ))
              )}
            </div>
          </div>

          <Card>
            <div className="type-caption font-semibold text-[var(--app-ink)]">Training detail</div>
            <p className="mt-1 type-caption leading-relaxed text-[var(--app-muted)]">
              {isToday
                ? 'Set-by-set lifting still lives in Training for now. Day Detail keeps the daily facts, run log, measurements, and notes editable.'
                : 'Set-by-set lifting for past sessions is not editable here yet. Use the daily log above for this day; the Gym toggle records whether the session happened.'}
            </p>
            {isToday ? (
              <Link
                to="/workout"
                className="mt-3 inline-flex radius-control bg-[var(--app-inset)] px-3 py-2 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]"
              >
                Open Training
              </Link>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  )
}
