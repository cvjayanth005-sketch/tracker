import { todayIn } from '@/domain/date'
import type { OnboardingPlanDraft } from '@/db/repo'

/**
 * Deterministic starter plan built entirely on-device, so onboarding can always
 * finish even if the AI endpoint is unreachable. Mirrors the backend fallback:
 * a Mifflin-St Jeor estimate, a pace-based deficit, and the weight span split
 * into readable phases. It is a safe default the user reviews and edits — never
 * the last word.
 */

export type Pace = 'Steady' | 'Moderate' | 'Aggressive'

/** Target weekly weight change (kg) for each pace. */
export const PACE_WEEKLY_LOSS: Record<Pace, number> = {
  Steady: 0.5,
  Moderate: 0.75,
  Aggressive: 1.0,
}

const KCAL_PER_KG = 7700

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : fallback
}

function activityMultiplier(level: string | undefined): number {
  const l = (level ?? '').toLowerCase()
  if (l.startsWith('active')) return 1.6
  if (l.startsWith('moder')) return 1.45
  return 1.3 // sedentary / unknown
}

function pace(answers: Record<string, string>): Pace {
  const p = (answers.desiredPace ?? '').toLowerCase()
  if (p.startsWith('agg')) return 'Aggressive'
  if (p.startsWith('mod')) return 'Moderate'
  return 'Steady'
}

/** Mifflin-St Jeor BMR, averaged when sex is not disclosed. */
function bmr(weightKg: number, heightCm: number, age: number, sex: string | undefined): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  const s = (sex ?? '').toLowerCase()
  if (s.startsWith('m')) return base + 5
  if (s.startsWith('f')) return base - 161
  return base - 78 // midpoint when unspecified
}

/** Calorie target for a given bodyweight, floored for safety. */
function caloriesForWeight(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: string | undefined,
  activity: number,
  weeklyLossKg: number,
  floor: number,
): number {
  const tdee = bmr(weightKg, heightCm, age, sex) * activity
  const dailyDeficit = (weeklyLossKg * KCAL_PER_KG) / 7
  return Math.max(floor, Math.round((tdee - dailyDeficit) / 10) * 10)
}

interface StarterPlan extends OnboardingPlanDraft {
  provider: 'rules'
  fallback: true
  profileSummary: string
  cautions: string[]
  missingInfo: string[]
  sourceUsed: false
}

export function buildStarterPlan(answers: Record<string, string>, timezone = 'UTC'): StarterPlan {
  const heightCm = num(answers.heightCm, 175)
  const age = num(answers.age, 30)
  const startWeightKg = Math.round(num(answers.currentWeightKg, 80) * 10) / 10
  const goalWeightKg = Math.round(num(answers.goalWeightKg, Math.max(60, startWeightKg - 8)) * 10) / 10
  const sex = answers.sex
  const activity = activityMultiplier(answers.activityLevel)
  const p = pace(answers)
  const weekly = PACE_WEEKLY_LOSS[p]
  const gymDays = Math.min(6, Math.max(2, Math.round(num(answers.gymDaysPerWeek, 3))))
  const floor = (sex ?? '').toLowerCase().startsWith('f') ? 1300 : 1500

  const losing = startWeightKg - goalWeightKg
  const steps = activity >= 1.6 ? 10000 : activity >= 1.45 ? 8500 : 7000
  const proteinG = Math.round(1.9 * Math.max(goalWeightKg, 45))

  // Split the loss into readable ~5 kg phases (1–4). Calories are recomputed
  // per phase from its starting weight, so the target tapers naturally.
  const phaseCount = losing > 0 ? Math.min(4, Math.max(1, Math.round(losing / 5))) : 1
  const per = losing > 0 ? losing / phaseCount : 0
  const phases = Array.from({ length: phaseCount }, (_, i) => {
    const pStart = Math.round((startWeightKg - per * i) * 10) / 10
    const pTarget = Math.round((startWeightKg - per * (i + 1)) * 10) / 10
    const calories = caloriesForWeight(pStart, heightCm, age, sex, activity, weekly, floor)
    return {
      name: phaseCount === 1 ? 'Phase 1' : `Phase ${i + 1}`,
      startWeightKg: pStart,
      targetWeightKg: losing > 0 ? pTarget : goalWeightKg,
      calories,
      proteinG,
      steps,
      weeklyRunKmTarget: null,
      notes: null,
    }
  })

  const summary =
    losing > 0
      ? `A ${p.toLowerCase()} cut from ${startWeightKg} to ${goalWeightKg} kg, split into ${phaseCount} phase${
          phaseCount === 1 ? '' : 's'
        } of about ${weekly} kg/week. Targets are a safe starting point you can adjust.`
      : `A maintenance plan around ${startWeightKg} kg. Adjust the targets to match how you want to feel.`

  return {
    provider: 'rules',
    fallback: true,
    profileSummary: summary,
    cautions: [],
    missingInfo: [],
    sourceUsed: false,
    profile: {
      name: (answers.name ?? '').trim() || null,
      birthYear: age > 0 ? new Date().getUTCFullYear() - age : null,
      heightCm,
      startWeightKg,
      goalWeightKg,
    },
    planStartDate: todayIn(timezone),
    targets: {
      calories: phases[0]!.calories,
      proteinG,
      steps,
      sleepHours: 8,
      gymDaysPerWeek: gymDays,
      weeklyRunKmTarget: null,
    },
    phases,
  }
}

/** Live estimate for the onboarding preview, so the user sees the math working. */
export function previewNumbers(answers: Record<string, string>): {
  maintenanceKcal: number
  targetKcal: number
  proteinG: number
} {
  const heightCm = num(answers.heightCm, 175)
  const age = num(answers.age, 30)
  const weightKg = num(answers.currentWeightKg, 80)
  const goalWeightKg = num(answers.goalWeightKg, Math.max(60, weightKg - 8))
  const sex = answers.sex
  const activity = activityMultiplier(answers.activityLevel)
  const weekly = PACE_WEEKLY_LOSS[pace(answers)]
  const floor = (sex ?? '').toLowerCase().startsWith('f') ? 1300 : 1500
  return {
    maintenanceKcal: Math.round((bmr(weightKg, heightCm, age, sex) * activity) / 10) * 10,
    targetKcal: caloriesForWeight(weightKg, heightCm, age, sex, activity, weekly, floor),
    proteinG: Math.round(1.9 * Math.max(goalWeightKg, 45)),
  }
}

/** Weeks to reach the goal at the chosen pace, or null when not losing. */
export function projectWeeks(startWeightKg: number, goalWeightKg: number, pace: Pace): number | null {
  const loss = startWeightKg - goalWeightKg
  if (loss <= 0) return null
  return Math.ceil(loss / PACE_WEEKLY_LOSS[pace])
}
