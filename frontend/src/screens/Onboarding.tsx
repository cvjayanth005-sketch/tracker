import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyOnboardingPlan,
  clearOnboardingDraft,
  ensureOnboardingDraft,
  saveOnboardingChapter,
  saveOnboardingProposal,
} from '@/db/repo'
import { todayIn } from '@/domain/date'
import { EQUIPMENT, defaultEquipmentFor } from '@/domain/onboarding/catalog/equipment'
import { EXERCISES } from '@/domain/onboarding/catalog/exercises'
import { maintenanceCalories } from '@/domain/onboarding/baseline'
import { emptyDraft } from '@/domain/onboarding/chapters'
import { requestProposal } from '@/domain/onboarding/proposalSource'
import { proposalToPlanDraft } from '@/domain/onboarding/toPlanDraft'
import type {
  ChapterId,
  ExerciseFamiliarity,
  GeneratedProposal,
  MuscleGroup,
  OnboardingDraft,
  TrainingEnvironment,
} from '@/domain/onboarding/types'
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from '@/domain/onboarding/units'
import { sync } from '@/sync/client'

type StepId =
  | 'about-you'
  | 'about-body'
  | 'about-support'
  | 'activity-day'
  | 'activity-week'
  | 'activity-recovery'
  | 'goals-primary'
  | 'goals-direction'
  | 'training-place'
  | 'training-equipment'
  | 'training-chest'
  | 'training-back'
  | 'training-biceps'
  | 'training-shoulders'
  | 'training-legs'
  | 'training-abs'
  | 'food-rhythm'
  | 'food-preferences'
  | 'review'

interface FlowStep {
  id: StepId
  chapter: ChapterId | 'review'
  eyebrow: string
  title: string
  description: string
}

const CHAPTERS: Array<{ id: ChapterId; label: string }> = [
  { id: 'about', label: 'About' },
  { id: 'activity', label: 'Activity' },
  { id: 'goals', label: 'Goals' },
  { id: 'training', label: 'Training' },
  { id: 'food', label: 'Food' },
]

const FLOW: FlowStep[] = [
  {
    id: 'about-you',
    chapter: 'about',
    eyebrow: 'About you',
    title: 'Let’s start with you.',
    description: 'Only the details needed to make your plan personal and safe.',
  },
  {
    id: 'about-body',
    chapter: 'about',
    eyebrow: 'About you',
    title: 'Your starting point.',
    description: 'These measurements create the baseline. You can change them later.',
  },
  {
    id: 'about-support',
    chapter: 'about',
    eyebrow: 'About you',
    title: 'What should training respect?',
    description: 'Tell Formara what to protect. Leave this blank when nothing is limiting you.',
  },
  {
    id: 'activity-day',
    chapter: 'activity',
    eyebrow: 'Activity',
    title: 'What does a normal day feel like?',
    description: 'Think about work, commuting, walking, and chores before planned exercise.',
  },
  {
    id: 'activity-week',
    chapter: 'activity',
    eyebrow: 'Activity',
    title: 'Build around your real week.',
    description: 'Choose a schedule you can repeat, not the most ambitious version of it.',
  },
  {
    id: 'activity-recovery',
    chapter: 'activity',
    eyebrow: 'Activity',
    title: 'How are you recovering lately?',
    description: 'Best estimates are useful. Missing values stay unknown rather than becoming zero.',
  },
  {
    id: 'goals-primary',
    chapter: 'goals',
    eyebrow: 'Goals',
    title: 'What should change first?',
    description: 'Pick the outcome that should guide your training and nutrition decisions.',
  },
  {
    id: 'goals-direction',
    chapter: 'goals',
    eyebrow: 'Goals',
    title: 'Choose the pace, not a promise.',
    description: 'Formara works with sustainable ranges and adjusts only after you confirm.',
  },
  {
    id: 'training-place',
    chapter: 'training',
    eyebrow: 'Training',
    title: 'Where and how do you train?',
    description: 'This sets the starting exercise pool before you fine-tune the equipment.',
  },
  {
    id: 'training-equipment',
    chapter: 'training',
    eyebrow: 'Training',
    title: 'What can you actually use?',
    description: 'Select equipment available most weeks. Your plan will not prescribe anything else.',
  },
  {
    id: 'training-chest',
    chapter: 'training',
    eyebrow: 'Training · Chest 1 of 6',
    title: 'Which chest movements do you know?',
    description: 'Mark what feels familiar, new, or uncomfortable. Unmarked movements stay neutral.',
  },
  {
    id: 'training-back',
    chapter: 'training',
    eyebrow: 'Training · Back 2 of 6',
    title: 'Which back movements do you know?',
    description: 'We will use this to choose pulling and hinge variations that suit your experience.',
  },
  {
    id: 'training-biceps',
    chapter: 'training',
    eyebrow: 'Training · Biceps 3 of 6',
    title: 'Which biceps movements do you know?',
    description: 'Choose only what you have actually performed. It is fine to leave everything neutral.',
  },
  {
    id: 'training-shoulders',
    chapter: 'training',
    eyebrow: 'Training · Shoulders 4 of 6',
    title: 'Which shoulder movements do you know?',
    description: 'Tell Formara what feels comfortable and flag any movement you prefer to avoid.',
  },
  {
    id: 'training-legs',
    chapter: 'training',
    eyebrow: 'Training · Legs 5 of 6',
    title: 'Which leg movements do you know?',
    description: 'Squats, hinges, lunges, and machine work are grouped here for an easier review.',
  },
  {
    id: 'training-abs',
    chapter: 'training',
    eyebrow: 'Training · Abs 6 of 6',
    title: 'Which core movements do you know?',
    description: 'Finish with the movements you use for bracing, flexion, and rotation.',
  },
  {
    id: 'food-rhythm',
    chapter: 'food',
    eyebrow: 'Food',
    title: 'How does eating fit your day?',
    description: 'Formara will suggest ranges and structure, not a rigid menu.',
  },
  {
    id: 'food-preferences',
    chapter: 'food',
    eyebrow: 'Food',
    title: 'Keep the food you can live with.',
    description: 'Preferences make a plan more usable. Allergies and intolerances are treated as constraints.',
  },
  {
    id: 'review',
    chapter: 'review',
    eyebrow: 'Your plan',
    title: 'A starting plan, ready for your approval.',
    description: 'Rules establish the safe baseline. Nothing becomes active until you confirm it.',
  },
]

const WEEKDAYS = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
]

const FAMILIARITY: Array<{ value: ExerciseFamiliarity; label: string }> = [
  { value: 'regular', label: 'Regular' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'unfamiliar', label: 'New' },
  { value: 'avoid', label: 'Avoid' },
  { value: 'discomfort', label: 'Discomfort' },
]

type TrainingMuscleStep = Extract<
  StepId,
  | 'training-chest'
  | 'training-back'
  | 'training-biceps'
  | 'training-shoulders'
  | 'training-legs'
  | 'training-abs'
>

const MUSCLES_BY_STEP: Record<TrainingMuscleStep, MuscleGroup[]> = {
  'training-chest': ['chest'],
  'training-back': ['lats', 'upper_back', 'traps', 'lower_back'],
  'training-biceps': ['biceps'],
  'training-shoulders': ['front_delts', 'side_delts', 'rear_delts'],
  'training-legs': ['quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors'],
  'training-abs': ['abs', 'obliques'],
}

const MUSCLE_STEP_LABELS: Array<{ id: TrainingMuscleStep; label: string }> = [
  { id: 'training-chest', label: 'Chest' },
  { id: 'training-back', label: 'Back' },
  { id: 'training-biceps', label: 'Biceps' },
  { id: 'training-shoulders', label: 'Shoulders' },
  { id: 'training-legs', label: 'Legs' },
  { id: 'training-abs', label: 'Abs' },
]

function arraysFromText(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function textFromArray(values: string[]): string {
  return values.join(', ')
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  suffix?: string
  min?: number
  max?: number
}) {
  return (
    <label className="onboarding-number-field">
      <span>{label}</span>
      <span className="onboarding-number-entry">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
        {suffix ? <strong>{suffix}</strong> : null}
      </span>
    </label>
  )
}

function ChoiceRows<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | null
  options: Array<{ value: T; label: string; detail?: string }>
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="onboarding-choice-group">
      <legend>{label}</legend>
      <div className="onboarding-choice-list">
        {options.map((option) => {
          const selected = value === option.value
          return (
            <button
              type="button"
              key={option.value}
              className={selected ? 'is-selected' : ''}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
            >
              <span>
                <strong>{option.label}</strong>
                {option.detail ? <small>{option.detail}</small> : null}
              </span>
              <i aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | null
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="onboarding-segmented-wrap">
      <legend>{label}</legend>
      <div className="onboarding-segmented">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? 'is-selected' : ''}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className="onboarding-text-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  )
}

function StepFields({
  step,
  draft,
  update,
}: {
  step: FlowStep
  draft: OnboardingDraft
  update: <K extends ChapterId>(chapter: K, patch: Partial<OnboardingDraft[K]>) => void
}) {
  const [equipmentCategory, setEquipmentCategory] = useState('free_weight')
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [exerciseSearch, setExerciseSearch] = useState('')
  const feetInches = cmToFeetInches(draft.about.heightCm)
  const currentWeightDisplay =
    draft.about.units === 'imperial' ? kgToLb(draft.about.currentWeightKg) : draft.about.currentWeightKg

  switch (step.id) {
    case 'about-you':
      return (
        <div className="onboarding-form-stack">
          <TextField
            label="What should we call you?"
            value={draft.about.preferredName}
            onChange={(preferredName) => update('about', { preferredName })}
            placeholder="Your name"
          />
          <NumberField
            label="Birth year"
            value={draft.about.birthYear}
            onChange={(birthYear) => update('about', { birthYear })}
            min={1900}
            max={new Date().getFullYear() - 13}
          />
          <ChoiceRows
            label="Which input should the calorie calculation use?"
            value={draft.about.calculationSex}
            onChange={(calculationSex) => update('about', { calculationSex })}
            options={[
              { value: 'male', label: 'Male calculation' },
              { value: 'female', label: 'Female calculation' },
              { value: 'unspecified', label: 'Use a neutral estimate', detail: 'Formara uses the midpoint.' },
            ]}
          />
        </div>
      )

    case 'about-body':
      return (
        <div className="onboarding-form-stack">
          <Segmented
            label="Units"
            value={draft.about.units}
            onChange={(units) => update('about', { units })}
            options={[
              { value: 'metric', label: 'Metric' },
              { value: 'imperial', label: 'Imperial' },
            ]}
          />
          {draft.about.units === 'imperial' ? (
            <div className="onboarding-measure-grid">
              <NumberField
                label="Height"
                value={feetInches?.feet ?? null}
                onChange={(feet) =>
                  update('about', {
                    heightCm: feetInchesToCm(feet, feetInches?.inches ?? 0),
                  })
                }
                suffix="ft"
                min={3}
                max={8}
              />
              <NumberField
                label=""
                value={feetInches?.inches ?? null}
                onChange={(inches) =>
                  update('about', {
                    heightCm: feetInchesToCm(feetInches?.feet ?? null, inches),
                  })
                }
                suffix="in"
                min={0}
                max={11}
              />
            </div>
          ) : (
            <NumberField
              label="Height"
              value={draft.about.heightCm}
              onChange={(heightCm) => update('about', { heightCm })}
              suffix="cm"
              min={120}
              max={230}
            />
          )}
          <NumberField
            label="Current weight"
            value={currentWeightDisplay}
            onChange={(value) =>
              update('about', {
                currentWeightKg: draft.about.units === 'imperial' ? lbToKg(value) : value,
              })
            }
            suffix={draft.about.units === 'imperial' ? 'lb' : 'kg'}
            min={draft.about.units === 'imperial' ? 66 : 30}
          />
        </div>
      )

    case 'about-support': {
      const limitation = draft.about.limitations[0]
      return (
        <div className="onboarding-form-stack">
          <TextField
            label="Injuries, pain, or movements to avoid"
            value={limitation?.label ?? null}
            onChange={(label) =>
              update('about', {
                limitations: label.trim()
                  ? [{ id: 'onboarding-general', label, affectedPatterns: [], notes: null }]
                  : [],
              })
            }
            placeholder="For example: right knee discomfort when squatting"
            multiline
          />
          <TextField
            label="Accessibility needs"
            value={draft.about.accessibilityNeeds}
            onChange={(accessibilityNeeds) => update('about', { accessibilityNeeds })}
            placeholder="Optional"
            multiline
          />
          <p className="onboarding-note">Formara uses this to remove risky movements. It does not diagnose injuries.</p>
        </div>
      )
    }

    case 'activity-day':
      return (
        <ChoiceRows
          label="Daily movement"
          value={draft.activity.activityLevel}
          onChange={(activityLevel) => update('activity', { activityLevel })}
          options={[
            { value: 'sedentary', label: 'Mostly seated', detail: 'Little movement outside exercise.' },
            { value: 'lightly_active', label: 'Some movement', detail: 'Walking or standing during parts of the day.' },
            { value: 'active', label: 'Active day', detail: 'Frequent walking or physical work.' },
            { value: 'very_active', label: 'Highly active', detail: 'Physical work or sustained daily movement.' },
          ]}
        />
      )

    case 'activity-week':
      return (
        <div className="onboarding-form-stack">
          <fieldset className="onboarding-choice-group">
            <legend>Days you can usually train</legend>
            <div className="onboarding-day-picker">
              {WEEKDAYS.map((day) => {
                const selected = draft.training.preferredDays.includes(day.value)
                return (
                  <button
                    type="button"
                    key={day.value}
                    className={selected ? 'is-selected' : ''}
                    onClick={() =>
                      update('training', {
                        preferredDays: selected
                          ? draft.training.preferredDays.filter((value) => value !== day.value)
                          : [...draft.training.preferredDays, day.value],
                      })
                    }
                    aria-pressed={selected}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Segmented
            label="Time per session"
            value={draft.activity.sessionMinutes === null ? null : String(draft.activity.sessionMinutes)}
            onChange={(value) =>
              update('activity', {
                sessionMinutes: Number(value),
                availableTrainingDays: draft.training.preferredDays.length,
              })
            }
            options={[
              { value: '30', label: '30 min' },
              { value: '45', label: '45 min' },
              { value: '60', label: '60 min' },
              { value: '90', label: '90 min' },
            ]}
          />
          <TextField
            label="Schedule constraints"
            value={draft.activity.scheduleNotes}
            onChange={(scheduleNotes) => update('activity', { scheduleNotes })}
            placeholder="Optional: late shifts, travel, childcare"
          />
        </div>
      )

    case 'activity-recovery':
      return (
        <div className="onboarding-measure-grid onboarding-measure-grid--three">
          <NumberField
            label="Typical steps"
            value={draft.activity.typicalSteps}
            onChange={(typicalSteps) => update('activity', { typicalSteps })}
            suffix="steps"
            min={0}
          />
          <NumberField
            label="Typical sleep"
            value={draft.activity.typicalSleepHours}
            onChange={(typicalSleepHours) => update('activity', { typicalSleepHours })}
            suffix="hours"
            min={0}
            max={16}
          />
          <Segmented
            label="Current stress"
            value={draft.activity.stress === null ? null : String(draft.activity.stress)}
            onChange={(value) => update('activity', { stress: Number(value) as 1 | 2 | 3 | 4 | 5 })}
            options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))}
          />
        </div>
      )

    case 'goals-primary':
      return (
        <ChoiceRows
          label="Primary goal"
          value={draft.goals.primaryGoal}
          onChange={(primaryGoal) => update('goals', { primaryGoal })}
          options={[
            { value: 'fat_loss', label: 'Lose fat', detail: 'Reduce body fat while protecting strength.' },
            { value: 'muscle_gain', label: 'Build muscle', detail: 'Prioritize training progression and recovery.' },
            { value: 'recomposition', label: 'Recomposition', detail: 'Build muscle while gradually reducing fat.' },
            { value: 'performance', label: 'Improve performance', detail: 'Train toward strength, running, or another outcome.' },
            { value: 'maintenance', label: 'Maintain', detail: 'Stay consistent without chasing scale change.' },
          ]}
        />
      )

    case 'goals-direction':
      return (
        <div className="onboarding-form-stack">
          <ChoiceRows
            label="Preferred pace"
            value={draft.goals.pace}
            onChange={(pace) => update('goals', { pace })}
            options={[
              { value: 'steady', label: 'Steady', detail: 'Easiest to sustain and recover from.' },
              { value: 'moderate', label: 'Moderate', detail: 'More demanding, with regular check-ins.' },
              { value: 'aggressive', label: 'Aggressive', detail: 'Used only inside Formara’s safety limits.' },
            ]}
          />
          <NumberField
            label="Goal weight"
            value={draft.goals.goalWeightKg}
            onChange={(goalWeightKg) => update('goals', { goalWeightKg })}
            suffix="kg"
            min={30}
          />
          <TextField
            label="What would success feel like?"
            value={draft.goals.successDefinition}
            onChange={(successDefinition) => update('goals', { successDefinition })}
            placeholder="Optional: stronger, more energetic, clothes fitting better"
          />
        </div>
      )

    case 'training-place':
      return (
        <div className="onboarding-form-stack">
          <ChoiceRows
            label="Experience"
            value={draft.training.experience}
            onChange={(experience) => update('training', { experience })}
            options={[
              { value: 'beginner', label: 'Beginner' },
              { value: 'returning', label: 'Returning after time away' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'advanced', label: 'Advanced' },
            ]}
          />
          <ChoiceRows
            label="Training environment"
            value={draft.training.environment}
            onChange={(environment) =>
              update('training', {
                environment,
                equipmentIds: defaultEquipmentFor(environment as TrainingEnvironment),
                sessionMinutes: draft.activity.sessionMinutes,
              })
            }
            options={[
              { value: 'commercial_gym', label: 'Commercial gym' },
              { value: 'home_gym', label: 'Home gym' },
              { value: 'minimal_equipment', label: 'Minimal equipment' },
              { value: 'bodyweight', label: 'Bodyweight' },
              { value: 'custom', label: 'Custom setup' },
            ]}
          />
          {/*
            Asked outright rather than inferred: a few weeks of partial logs
            cannot reliably distinguish an upper/lower from a full-body
            programme, and guessing wrong makes every training suggestion look
            uninformed. Editable later from Plan → Training.
          */}
          <ChoiceRows
            label="Current split"
            value={draft.training.currentSplit}
            onChange={(currentSplit) => update('training', { currentSplit })}
            options={[
              { value: 'full_body', label: 'Full body every session' },
              { value: 'upper_lower', label: 'Upper / lower' },
              { value: 'push_pull_legs', label: 'Push / pull / legs' },
              { value: 'bro_split', label: 'One body part per day' },
              { value: 'other', label: 'Something else' },
              { value: 'none', label: 'Not training regularly yet' },
            ]}
          />
        </div>
      )

    case 'training-equipment': {
      const categories = Array.from(new Set(EQUIPMENT.map((item) => item.category)))
      const visible = EQUIPMENT.filter(
        (item) =>
          item.category === equipmentCategory &&
          `${item.label} ${item.aliases.join(' ')}`.toLowerCase().includes(equipmentSearch.toLowerCase()),
      )
      return (
        <div className="onboarding-form-stack">
          <TextField
            label="Search equipment"
            value={equipmentSearch}
            onChange={setEquipmentSearch}
            placeholder="Bench, cable, leg press"
          />
          <div className="onboarding-category-tabs" role="tablist" aria-label="Equipment categories">
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={equipmentCategory === category ? 'is-selected' : ''}
                onClick={() => setEquipmentCategory(category)}
              >
                {category.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="onboarding-equipment-grid">
            {visible.map((item) => {
              const selected = draft.training.equipmentIds.includes(item.id)
              return (
                <button
                  type="button"
                  key={item.id}
                  className={selected ? 'is-selected' : ''}
                  onClick={() =>
                    update('training', {
                      equipmentIds: selected
                        ? draft.training.equipmentIds.filter((id) => id !== item.id)
                        : [...draft.training.equipmentIds, item.id],
                    })
                  }
                  aria-pressed={selected}
                >
                  <span>{item.label}</span>
                  <i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    case 'training-chest':
    case 'training-back':
    case 'training-biceps':
    case 'training-shoulders':
    case 'training-legs':
    case 'training-abs': {
      const availableIds = new Set(draft.training.equipmentIds)
      const muscleGroups = MUSCLES_BY_STEP[step.id]
      const currentMuscleIndex = MUSCLE_STEP_LABELS.findIndex((item) => item.id === step.id)
      const exercises = EXERCISES.filter(
        (exercise) =>
          exercise.primaryMuscles.some((muscle) => muscleGroups.includes(muscle)) &&
          exercise.requiredEquipment.some((equipment) =>
            equipment === 'bodyweight' || availableIds.has(equipment),
          ) &&
          (exercise.alsoRequires?.every((equipment) => availableIds.has(equipment)) ?? true) &&
          exercise.name.toLowerCase().includes(exerciseSearch.toLowerCase()),
      )
      return (
        <div className="onboarding-form-stack">
          <div className="onboarding-muscle-sequence" aria-label="Exercise muscle groups">
            {MUSCLE_STEP_LABELS.map((muscle, index) => {
              return (
                <span
                  key={muscle.id}
                  className={index === currentMuscleIndex ? 'is-current' : index < currentMuscleIndex ? 'is-complete' : ''}
                  aria-current={index === currentMuscleIndex ? 'step' : undefined}
                >
                  <i aria-hidden="true">{index < currentMuscleIndex ? '✓' : index + 1}</i>
                  {muscle.label}
                </span>
              )
            })}
          </div>
          <TextField
            label={`Find a ${MUSCLE_STEP_LABELS.find((item) => item.id === step.id)?.label.toLowerCase()} exercise`}
            value={exerciseSearch}
            onChange={setExerciseSearch}
            placeholder="Search this muscle group"
          />
          <div className="onboarding-exercise-list">
            {exercises.map((exercise) => (
              <div key={exercise.id}>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.compound ? 'Compound' : 'Isolation'} · {exercise.pattern.replace(/_/g, ' ')}</small>
                </span>
                <select
                  value={draft.training.familiarity[exercise.id] ?? ''}
                  onChange={(event) => {
                    const familiarity = { ...draft.training.familiarity }
                    if (!event.target.value) delete familiarity[exercise.id]
                    else familiarity[exercise.id] = event.target.value as ExerciseFamiliarity
                    update('training', { familiarity })
                  }}
                  aria-label={`Familiarity with ${exercise.name}`}
                >
                  <option value="">Not set</option>
                  {FAMILIARITY.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {exercises.length === 0 ? (
              <p className="onboarding-empty-list">No matching exercises are available with your selected equipment.</p>
            ) : null}
          </div>
        </div>
      )
    }

    case 'food-rhythm':
      return (
        <div className="onboarding-form-stack">
          <ChoiceRows
            label="Eating style"
            value={draft.food.dietStyle}
            onChange={(dietStyle) => update('food', { dietStyle })}
            options={[
              { value: 'omnivore', label: 'Omnivore' },
              { value: 'vegetarian', label: 'Vegetarian' },
              { value: 'vegan', label: 'Vegan' },
              { value: 'pescatarian', label: 'Pescatarian' },
              { value: 'other', label: 'Something else' },
            ]}
          />
          <Segmented
            label="Meals per day"
            value={draft.food.mealsPerDay === null ? null : String(draft.food.mealsPerDay)}
            onChange={(value) => update('food', { mealsPerDay: Number(value) })}
            options={[2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))}
          />
          <Segmented
            label="Food budget"
            value={draft.food.budget}
            onChange={(budget) => update('food', { budget })}
            options={[
              { value: 'low', label: 'Value-first' },
              { value: 'moderate', label: 'Balanced' },
              { value: 'flexible', label: 'Flexible' },
            ]}
          />
        </div>
      )

    case 'food-preferences':
      return (
        <div className="onboarding-form-stack">
          <TextField
            label="Allergies"
            value={textFromArray(draft.food.allergies)}
            onChange={(value) => update('food', { allergies: arraysFromText(value) })}
            placeholder="Comma separated"
          />
          <TextField
            label="Intolerances"
            value={textFromArray(draft.food.intolerances)}
            onChange={(value) => update('food', { intolerances: arraysFromText(value) })}
            placeholder="Comma separated"
          />
          <TextField
            label="Foods you enjoy"
            value={textFromArray(draft.food.foodsLiked)}
            onChange={(value) => update('food', { foodsLiked: arraysFromText(value) })}
            placeholder="Rice, eggs, yogurt, lentils"
          />
          <TextField
            label="Foods you avoid"
            value={textFromArray(draft.food.foodsAvoided)}
            onChange={(value) => update('food', { foodsAvoided: arraysFromText(value) })}
            placeholder="Optional"
          />
        </div>
      )

    case 'review':
      return null
  }
}

function stepIsComplete(step: FlowStep, draft: OnboardingDraft): boolean {
  switch (step.id) {
    case 'about-you':
      return draft.about.birthYear !== null && draft.about.calculationSex !== null
    case 'about-body':
      return draft.about.units !== null && draft.about.heightCm !== null && draft.about.currentWeightKg !== null
    case 'activity-day':
      return draft.activity.activityLevel !== null
    case 'activity-week':
      return draft.training.preferredDays.length > 0 && draft.activity.sessionMinutes !== null
    case 'goals-primary':
      return draft.goals.primaryGoal !== null
    case 'goals-direction':
      return draft.goals.pace !== null
    case 'training-place':
      return draft.training.experience !== null && draft.training.environment !== null
    case 'training-equipment':
      return draft.training.equipmentIds.length > 0
    case 'food-rhythm':
      return draft.food.mealsPerDay !== null
    default:
      return true
  }
}

const GOAL_STRATEGY = {
  fat_loss: {
    label: 'Fat loss',
    summary: 'Create a controlled energy deficit while protecting strength, recovery, and lean mass.',
  },
  muscle_gain: {
    label: 'Muscle gain',
    summary: 'Use progressive resistance training with a modest energy surplus and reliable recovery.',
  },
  recomposition: {
    label: 'Body recomposition',
    summary: 'Build strength and muscle while gradually reducing fat through consistency rather than an aggressive cut.',
  },
  performance: {
    label: 'Performance',
    summary: 'Support repeatable training quality, progression, and recovery before chasing scale changes.',
  },
  maintenance: {
    label: 'Maintenance',
    summary: 'Build a stable routine that preserves your current weight while improving fitness and consistency.',
  },
} as const

const MACRO_REASON = {
  calories: 'A flexible energy range based on your body data, activity, goal, and selected pace.',
  protein: 'Supports training recovery and helps preserve or build lean tissue.',
  carbs: 'Supplies training energy after protein and essential fat needs are covered.',
  fat: 'Keeps an essential intake floor while leaving room for foods you enjoy.',
  fiber: 'Supports fullness, digestion, and a more nutrient-dense food pattern.',
  hydration: 'A practical daily range scaled from your current body weight.',
} as const

function readable(value: string | null | undefined): string {
  return value ? value.replace(/_/g, ' ') : 'Not specified'
}

function familiarityLabel(value: ExerciseFamiliarity | undefined): string {
  if (value === 'regular') return 'Regular lift'
  if (value === 'comfortable') return 'Comfortable'
  if (value === 'unfamiliar') return 'New to explore'
  if (value === 'avoid') return 'Avoid'
  if (value === 'discomfort') return 'Discomfort flagged'
  return 'Equipment match'
}

function ReviewPlan({ proposal, draft }: { proposal: GeneratedProposal | null; draft: OnboardingDraft }) {
  if (!proposal) {
    return <div className="onboarding-review-loading" role="status">Building the safe baseline…</div>
  }
  const nutrition = proposal.nutrition
  const goal = draft.goals.primaryGoal ?? 'maintenance'
  const strategy = GOAL_STRATEGY[goal]
  const maintenance = maintenanceCalories(draft)
  const familiarities = Object.values(draft.training.familiarity)
  const knownCount = familiarities.filter((value) => value === 'regular' || value === 'comfortable').length
  const newCount = familiarities.filter((value) => value === 'unfamiliar').length
  const blockedCount = familiarities.filter((value) => value === 'avoid' || value === 'discomfort').length
  const weightUnit = draft.about.units === 'imperial' ? 'lb' : 'kg'
  const displayWeight = (weightKg: number) => {
    const value = draft.about.units === 'imperial' ? kgToLb(weightKg) : weightKg
    return `${value === null ? '—' : Math.round(value * 10) / 10} ${weightUnit}`
  }

  return (
    <div className="onboarding-plan-review">
      <section className="onboarding-plan-section">
        <header>
          <span>01 · Goal strategy</span>
          <h2>{strategy.label}, approached deliberately.</h2>
          <p>{strategy.summary}</p>
        </header>
        <div className="onboarding-strategy-grid">
          <div>
            <span>Starting point</span>
            <strong className="tabular">{draft.about.currentWeightKg === null ? '—' : displayWeight(draft.about.currentWeightKg)}</strong>
            <p>{readable(draft.activity.activityLevel)} daily activity</p>
          </div>
          <div>
            <span>Direction</span>
            <strong>{draft.goals.goalWeightKg === null ? 'Progress-led' : displayWeight(draft.goals.goalWeightKg)}</strong>
            <p>{readable(draft.goals.pace)} pace</p>
          </div>
          <div>
            <span>Plan structure</span>
            <strong>{proposal.phases.length} {proposal.phases.length === 1 ? 'phase' : 'phases'}</strong>
            <p>Reviewed against logged progress</p>
          </div>
        </div>
        <div className="onboarding-plan-explanation">
          <strong>How this plan moves you forward</strong>
          <p>
            Train {proposal.training.daysPerWeek} days each week, work within the nutrition ranges below,
            and use trend data rather than a single day to decide whether anything should change.
            Formara will suggest adjustments, but you confirm them.
          </p>
        </div>
      </section>

      <section className="onboarding-plan-section">
        <header>
          <span>02 · Training recommendation</span>
          <h2>{proposal.training.name}, built around your answers.</h2>
          <p>
            You selected {readable(draft.training.environment)}, {proposal.training.sessionMinutes}-minute sessions,
            and {proposal.training.daysPerWeek} training days. We found {knownCount} familiar movements,
            {newCount} you are open to exploring, and excluded {blockedCount} you marked to avoid or as uncomfortable.
          </p>
        </header>
        <div className="onboarding-training-days">
          {proposal.training.days.map((day) => (
            <article key={`${day.dow}-${day.name}`}>
              <div className="onboarding-training-day-heading">
                <span>Day {day.dow === 0 ? 7 : day.dow}</span>
                <h3>{day.name}</h3>
                <p>{day.focus.map(readable).join(' · ')}</p>
              </div>
              <div className="onboarding-plan-exercises">
                {day.exercises.map((exercise) => (
                  <div key={exercise.exerciseId}>
                    <span>
                      <strong>{exercise.exerciseName}</strong>
                      <small>{exercise.rationale}</small>
                    </span>
                    <span className="onboarding-exercise-dose">
                      <strong className="tabular">{exercise.sets.min}–{exercise.sets.max} × {exercise.reps.min}–{exercise.reps.max}</strong>
                      <small>{familiarityLabel(draft.training.familiarity[exercise.exerciseId])}</small>
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="onboarding-plan-section">
        <header>
          <span>03 · Food and recovery framework</span>
          <h2>Nutrition that supports the goal.</h2>
          <p>
            This framework respects a {readable(draft.food.dietStyle)} eating style and your preference for
            {` ${nutrition.mealsPerDay}`} meals per day. It uses ranges so normal day-to-day variation does not feel like failure.
          </p>
        </header>
        <div className="onboarding-macro-grid">
          <div>
            <span>Calories</span>
            <strong className="tabular">{nutrition.calories.min}–{nutrition.calories.max}</strong>
            <small>kcal / day</small>
            <p>{MACRO_REASON.calories}{maintenance ? ` Estimated maintenance is about ${maintenance} kcal.` : ''}</p>
          </div>
          <div>
            <span>Protein</span>
            <strong className="tabular">{nutrition.proteinG.min}–{nutrition.proteinG.max}</strong>
            <small>g / day</small>
            <p>{MACRO_REASON.protein}</p>
          </div>
          <div>
            <span>Carbohydrates</span>
            <strong className="tabular">{nutrition.carbsG.min}–{nutrition.carbsG.max}</strong>
            <small>g / day</small>
            <p>{MACRO_REASON.carbs}</p>
          </div>
          <div>
            <span>Fat</span>
            <strong className="tabular">{nutrition.fatG.min}–{nutrition.fatG.max}</strong>
            <small>g / day</small>
            <p>{MACRO_REASON.fat}</p>
          </div>
          <div>
            <span>Fiber</span>
            <strong className="tabular">{nutrition.fiberG.min}–{nutrition.fiberG.max}</strong>
            <small>g / day</small>
            <p>{MACRO_REASON.fiber}</p>
          </div>
          <div>
            <span>Hydration</span>
            <strong className="tabular">{nutrition.hydrationMl.min}–{nutrition.hydrationMl.max}</strong>
            <small>ml / day</small>
            <p>{MACRO_REASON.hydration}</p>
          </div>
        </div>
        <div className="onboarding-food-context">
          <div>
            <span>Foods to build around</span>
            <p>{draft.food.foodsLiked.length ? draft.food.foodsLiked.join(', ') : 'No preferred foods recorded yet.'}</p>
          </div>
          <div>
            <span>Must avoid</span>
            <p>
              {[...draft.food.allergies, ...draft.food.intolerances, ...draft.food.foodsAvoided].length
                ? [...draft.food.allergies, ...draft.food.intolerances, ...draft.food.foodsAvoided].join(', ')
                : 'No exclusions recorded.'}
            </p>
          </div>
        </div>
      </section>

      <section className="onboarding-plan-section onboarding-plan-transparency">
        <header>
          <span>04 · Before you confirm</span>
          <h2>{proposal.confidence} confidence, with the reasoning visible.</h2>
          <p>
            {proposal.provider === 'rules'
              ? 'This version was built from Formara’s deterministic safety rules.'
              : 'This version was personalized by AI and then checked against Formara’s safety rules.'}
          </p>
        </header>
        {proposal.assumptions.length ? <div><strong>Assumptions</strong><p>{proposal.assumptions.join(' ')}</p></div> : null}
        {proposal.missingInformation.length ? <div><strong>Still unknown</strong><p>{proposal.missingInformation.join(' ')}</p></div> : null}
        {proposal.cautions.length ? <div><strong>Worth knowing</strong><p>{proposal.cautions.join(' ')}</p></div> : null}
        {!proposal.assumptions.length && !proposal.missingInformation.length && !proposal.cautions.length ? (
          <div><strong>No unresolved plan notes</strong><p>The proposal can be activated as shown and adjusted later from Plan.</p></div>
        ) : null}
      </section>
    </div>
  )
}

export function Onboarding({ preview = false }: { preview?: boolean }) {
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const [draft, setDraft] = useState<OnboardingDraft>(() => emptyDraft(timezone))
  const [stepIndex, setStepIndex] = useState(0)
  const [ready, setReady] = useState(preview)
  const [exiting, setExiting] = useState(false)
  const [proposal, setProposal] = useState<GeneratedProposal | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const transitionTimer = useRef<number | null>(null)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const step = FLOW[stepIndex]!

  useEffect(() => {
    if (preview) return
    let cancelled = false
    void ensureOnboardingDraft(timezone).then((stored) => {
      if (cancelled) return
      setDraft(stored)
      const resumeQuestion = stored.resume.questionKey === 'training-familiarity'
        ? 'training-chest'
        : stored.resume.questionKey
      const resumeIndex = FLOW.findIndex((item) => item.id === resumeQuestion)
      setStepIndex(resumeIndex >= 0 ? resumeIndex : 0)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [preview, timezone])

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (step.id !== 'review' || proposal) return
    setBusy(true)
    void requestProposal(draft).then((outcome) => {
      setBusy(false)
      if (outcome.status === 'insufficient') {
        setStatus(outcome.missing)
        return
      }
      setProposal(outcome.proposal)
      if (!preview) {
        saveQueue.current = saveQueue.current
          .then(() => saveOnboardingProposal(outcome.proposal))
          .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
      }
    })
  }, [draft, preview, proposal, step.id])

  const queueSave = <K extends ChapterId>(
    chapter: K,
    patch: Partial<OnboardingDraft[K]>,
    resumeQuestion: StepId = step.id,
  ) => {
    if (preview) return
    saveQueue.current = saveQueue.current
      .then(() => saveOnboardingChapter(chapter, patch, { chapter, questionKey: resumeQuestion }))
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }

  const update = <K extends ChapterId>(chapter: K, patch: Partial<OnboardingDraft[K]>) => {
    setDraft((current) => ({
      ...current,
      [chapter]: { ...current[chapter], ...patch },
      updatedAt: new Date().toISOString(),
    }) as OnboardingDraft)
    queueSave(chapter, patch)
  }

  const moveTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= FLOW.length || exiting) return
    const next = FLOW[nextIndex]!
    if (next.chapter !== 'review') {
      queueSave(next.chapter, {}, next.id)
    }
    setExiting(true)
    transitionTimer.current = window.setTimeout(() => {
      setProposal(next.id === 'review' ? proposal : null)
      setStepIndex(nextIndex)
      setExiting(false)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
    }, 220)
  }

  const activate = async () => {
    if (!proposal) return
    if (preview) {
      setStatus('Preview complete. No account data was changed.')
      return
    }
    setBusy(true)
    setStatus('Saving your plan…')
    const converted = proposalToPlanDraft(
      proposal,
      draft,
      { confirmed: true, proposalGeneratedAt: proposal.generatedAt },
      todayIn(timezone),
    )
    if (!converted.ok) {
      setBusy(false)
      setStatus(converted.detail)
      return
    }
    await applyOnboardingPlan(converted.draft)
    await clearOnboardingDraft()
    const outcome = await sync()
    setBusy(false)
    if (outcome.status === 'error') setStatus(outcome.message)
    else setStatus('Plan ready. Opening Today…')
  }

  if (!ready) {
    return (
      <main className="onboarding-shell onboarding-loading" role="status">
        <strong>Formara</strong>
        <span>Opening your setup…</span>
      </main>
    )
  }

  const activeChapterIndex = step.chapter === 'review'
    ? CHAPTERS.length
    : CHAPTERS.findIndex((chapter) => chapter.id === step.chapter)
  const progress = ((stepIndex + 1) / FLOW.length) * 100

  return (
    <main className="onboarding-shell text-surface-ink">
      <header className="onboarding-header">
        <div>
          <strong>Formara</strong>
          <span>Personal setup</span>
        </div>
        <span className="tabular">{stepIndex + 1} / {FLOW.length}</span>
      </header>

      <div className="onboarding-progress" aria-label={`Step ${stepIndex + 1} of ${FLOW.length}`}>
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="onboarding-layout">
        <aside className="onboarding-chapters" aria-label="Onboarding chapters">
          {CHAPTERS.map((chapter, index) => (
            <div
              key={chapter.id}
              className={index === activeChapterIndex ? 'is-active' : index < activeChapterIndex ? 'is-complete' : ''}
            >
              <i aria-hidden="true">{index < activeChapterIndex ? '✓' : index + 1}</i>
              <span>{chapter.label}</span>
            </div>
          ))}
        </aside>

        <section className={`onboarding-stage ${exiting ? 'is-exiting' : ''}`} key={step.id}>
          <div className="onboarding-stage-heading">
            <span>{step.eyebrow}</span>
            <h1>{step.title}</h1>
            <p>{step.description}</p>
          </div>

          <div className="onboarding-stage-content">
            {step.id === 'review' ? (
              <ReviewPlan proposal={proposal} draft={draft} />
            ) : (
              <StepFields step={step} draft={draft} update={update} />
            )}
            {status ? <p className="onboarding-status" role="status">{status}</p> : null}
          </div>
        </section>
      </div>

      <footer className="onboarding-footer safe-bottom">
        <button
          type="button"
          className="onboarding-back"
          onClick={() => moveTo(stepIndex - 1)}
          disabled={stepIndex === 0 || exiting || busy}
          aria-label="Previous question"
          title="Back"
        >
          ←
        </button>
        <p>{stepIsComplete(step, draft) ? 'Saved as you go' : 'Complete the required fields to continue'}</p>
        <button
          type="button"
          className="onboarding-next"
          onClick={() => step.id === 'review' ? void activate() : moveTo(stepIndex + 1)}
          disabled={!stepIsComplete(step, draft) || exiting || busy || (step.id === 'review' && !proposal)}
        >
          <span>{step.id === 'review' ? (preview ? 'Finish preview' : 'Confirm and start') : 'Continue'}</span>
          <span aria-hidden="true">→</span>
        </button>
      </footer>
    </main>
  )
}
