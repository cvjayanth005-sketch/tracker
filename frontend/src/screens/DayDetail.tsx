import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addRun,
  allPhases,
  deleteRun,
  getLog,
  getMeasurement,
  getSettings,
  resolvePhaseForDate,
  runsForDate,
  updateRun,
  upsertLog,
  upsertMeasurement,
} from '@/db/repo'
import { asLocalDate, formatShort, isLocalDate } from '@/domain/date'
import { planDayLabel } from '@/domain/plan'
import type { LocalDate, Rating, RunType } from '@/domain/types'
import { NumberField, RatingField, TextArea, TriToggle } from '@/components/fields'
import { Card, EmptyState, PageHeader, Pill, SectionTitle } from '@/components/ui'

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

  if (!date) {
    return <EmptyState title="Invalid day" body="That calendar day could not be opened." />
  }
  if (!settings || !phases.length) {
    return <EmptyState title="Loading day" body="Preparing your plan context." />
  }

  const phase = resolvePhaseForDate(phases, date)
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
            className="glass-inset rounded-xl px-3 py-2 text-[12px] font-semibold text-ink-200"
          >
            Calendar
          </Link>
        }
      />

      {phase ? (
        <Card className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-50">{phase.name}</div>
              <div className="mt-1 text-[12px] text-ink-400">
                {phase.calories} kcal · {phase.proteinG} g protein · {phase.steps.toLocaleString()} steps
              </div>
            </div>
            <Pill tone="info">{phase.targetWeightKg} kg target</Pill>
          </div>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <section>
          <SectionTitle>Daily log</SectionTitle>
          <div className="space-y-3">
            <NumberField label="Weight" value={log?.weightKg ?? null} unit="kg" onCommit={(weightKg) => save({ weightKg })} />
            <NumberField label="Calories" value={log?.calories ?? null} unit="kcal" {...targetProp(phase ? `Target ${phase.calories}` : undefined)} inputMode="numeric" onCommit={(calories) => save({ calories })} />
            <NumberField label="Protein" value={log?.proteinG ?? null} unit="g" {...targetProp(phase ? `Target ${phase.proteinG}` : undefined)} onCommit={(proteinG) => save({ proteinG })} />
            <NumberField label="Steps" value={log?.steps ?? null} {...targetProp(phase ? `Target ${phase.steps.toLocaleString()}` : undefined)} inputMode="numeric" onCommit={(steps) => save({ steps })} />
            <NumberField label="Sleep" value={log?.sleepHours ?? null} unit="h" {...targetProp(phase ? `Target ${phase.sleepHours}` : undefined)} onCommit={(sleepHours) => save({ sleepHours })} />
            <NumberField label="Meals on plan" value={log?.mealsOnPlan ?? null} {...targetProp(phase ? `Out of ${phase.mealsPerDay}` : undefined)} inputMode="numeric" onCommit={(mealsOnPlan) => save({ mealsOnPlan })} />
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
                  className="rounded-full bg-accent/15 px-3 py-1 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/25"
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
                  <div className="text-sm text-ink-300">No runs logged for this day.</div>
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
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            run.type === type ? 'bg-info text-ink-950' : 'bg-white/8 text-ink-400'
                          }`}
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
                      className="mt-3 rounded-xl bg-alert/15 px-3 py-2 text-[12px] font-semibold text-alert ring-1 ring-inset ring-alert/25"
                    >
                      Delete run
                    </button>
                  </Card>
                ))
              )}
            </div>
          </div>

          <Card>
            <div className="text-sm font-semibold text-ink-50">Training detail</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
              Set-by-set lifting still lives in Training for now. Day Detail keeps the daily facts, run log, measurements, and notes editable.
            </p>
            <Link
              to="/workout"
              className="mt-3 inline-flex rounded-xl bg-white/8 px-3 py-2 text-[12px] font-semibold text-ink-100 ring-1 ring-inset ring-white/10"
            >
              Open Training
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  )
}
