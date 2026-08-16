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
import { emptyDraft } from '@/domain/onboarding/chapters'
import { requestProposal } from '@/domain/onboarding/proposalSource'
import { proposalToPlanDraft } from '@/domain/onboarding/toPlanDraft'
import type {
  ChapterId,
  ExerciseFamiliarity,
  GeneratedProposal,
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
  | 'training-familiarity'
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
    id: 'training-familiarity',
    chapter: 'training',
    eyebrow: 'Training',
    title: 'Make the exercise list feel like yours.',
    description: 'Mark movements you know or want excluded. Unmarked exercises stay neutral.',
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

    case 'training-familiarity': {
      const availableIds = new Set(draft.training.equipmentIds)
      const exercises = EXERCISES.filter(
        (exercise) =>
          exercise.requiredEquipment.some((equipment) =>
            equipment === 'bodyweight' || availableIds.has(equipment),
          ) && exercise.name.toLowerCase().includes(exerciseSearch.toLowerCase()),
      ).slice(0, 14)
      return (
        <div className="onboarding-form-stack">
          <TextField
            label="Find an exercise"
            value={exerciseSearch}
            onChange={setExerciseSearch}
            placeholder="Squat, row, press"
          />
          <div className="onboarding-exercise-list">
            {exercises.map((exercise) => (
              <div key={exercise.id}>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.pattern.replace(/_/g, ' ')}</small>
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

function ReviewPlan({ proposal }: { proposal: GeneratedProposal | null }) {
  if (!proposal) {
    return <div className="onboarding-review-loading" role="status">Building the safe baseline…</div>
  }
  const nutrition = proposal.nutrition
  return (
    <div className="onboarding-review-grid">
      <section>
        <span>Nutrition range</span>
        <strong className="tabular">{nutrition.calories.min}–{nutrition.calories.max} kcal</strong>
        <p>{nutrition.proteinG.min}–{nutrition.proteinG.max} g protein · {nutrition.mealsPerDay} meals</p>
      </section>
      <section>
        <span>Training split</span>
        <strong>{proposal.training.name}</strong>
        <p>{proposal.training.sessionMinutes} minutes · {proposal.training.days.length} sessions</p>
      </section>
      <section>
        <span>Confidence</span>
        <strong>{proposal.confidence}</strong>
        <p>{proposal.provider === 'rules' ? 'Built from Formara’s safety rules.' : 'AI-personalized and safety checked.'}</p>
      </section>
      {proposal.cautions.length > 0 ? (
        <section className="onboarding-review-wide">
          <span>Worth knowing</span>
          <p>{proposal.cautions.join(' ')}</p>
        </section>
      ) : null}
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
      const resumeIndex = FLOW.findIndex((item) => item.id === stored.resume.questionKey)
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
              <ReviewPlan proposal={proposal} />
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
