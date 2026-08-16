import type { MovementPattern, MuscleGroup } from '@/domain/onboarding/types'
import { BODYWEIGHT_ID } from './equipment'

/**
 * Exercise catalogue.
 *
 * Static reference data keyed by stable id, like the equipment catalogue. It is
 * intentionally *not* the `exercises` Dexie table: that table holds the user's
 * live workout template with their own sets and loads, whereas this describes
 * what movements exist and what they need. Keeping them apart means onboarding
 * can reason about exercises the user has never programmed.
 *
 * `requiredEquipment` is a list of alternatives, not a set to satisfy: an
 * entry is performable when the user owns *any* one of them. A movement that
 * genuinely needs two things at once (a barbell bench needs both a bar and a
 * bench) states that with `alsoRequires`.
 */

export interface CatalogExercise {
  /** Permanent. Stored in the training chapter's familiarity map. */
  id: string
  name: string
  pattern: MovementPattern
  primaryMuscles: MuscleGroup[]
  /** Performable with ANY one of these. */
  requiredEquipment: string[]
  /** Additionally needs ALL of these, when present. */
  alsoRequires?: string[]
  /** Compound lifts anchor a session; isolation fills it out. */
  compound: boolean
  /** Higher demands more control; used to gate by experience. */
  technicalDemand: 1 | 2 | 3
}

export const EXERCISES: readonly CatalogExercise[] = [
  // --- Squat ----------------------------------------------------------------
  { id: 'back_squat', name: 'Back squat', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], requiredEquipment: ['barbell'], alsoRequires: ['squat_rack'], compound: true, technicalDemand: 3 },
  { id: 'front_squat', name: 'Front squat', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], requiredEquipment: ['barbell'], alsoRequires: ['squat_rack'], compound: true, technicalDemand: 3 },
  { id: 'goblet_squat', name: 'Goblet squat', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], requiredEquipment: ['dumbbells', 'kettlebell'], compound: true, technicalDemand: 1 },
  { id: 'leg_press_squat', name: 'Leg press', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], requiredEquipment: ['leg_press'], compound: true, technicalDemand: 1 },
  { id: 'hack_squat_machine', name: 'Hack squat', pattern: 'squat', primaryMuscles: ['quads'], requiredEquipment: ['hack_squat'], compound: true, technicalDemand: 2 },
  { id: 'smith_squat', name: 'Smith machine squat', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], requiredEquipment: ['smith_machine'], compound: true, technicalDemand: 1 },
  { id: 'bodyweight_squat', name: 'Bodyweight squat', pattern: 'squat', primaryMuscles: ['quads', 'glutes'], requiredEquipment: [BODYWEIGHT_ID], compound: true, technicalDemand: 1 },

  // --- Hinge ----------------------------------------------------------------
  { id: 'conventional_deadlift', name: 'Conventional deadlift', pattern: 'hinge', primaryMuscles: ['glutes', 'hamstrings', 'lower_back'], requiredEquipment: ['barbell', 'trap_bar'], compound: true, technicalDemand: 3 },
  { id: 'romanian_deadlift', name: 'Romanian deadlift', pattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes'], requiredEquipment: ['barbell', 'dumbbells', 'trap_bar'], compound: true, technicalDemand: 2 },
  { id: 'hip_thrust', name: 'Hip thrust', pattern: 'hinge', primaryMuscles: ['glutes'], requiredEquipment: ['barbell', 'hip_thrust_machine', 'dumbbells'], compound: true, technicalDemand: 2 },
  { id: 'kettlebell_swing', name: 'Kettlebell swing', pattern: 'hinge', primaryMuscles: ['glutes', 'hamstrings'], requiredEquipment: ['kettlebell'], compound: true, technicalDemand: 2 },
  { id: 'back_extension_hinge', name: 'Back extension', pattern: 'hinge', primaryMuscles: ['lower_back', 'glutes'], requiredEquipment: ['back_extension'], compound: false, technicalDemand: 1 },
  { id: 'glute_bridge', name: 'Glute bridge', pattern: 'hinge', primaryMuscles: ['glutes'], requiredEquipment: [BODYWEIGHT_ID], compound: false, technicalDemand: 1 },

  // --- Lunge ----------------------------------------------------------------
  { id: 'walking_lunge', name: 'Walking lunge', pattern: 'lunge', primaryMuscles: ['quads', 'glutes'], requiredEquipment: [BODYWEIGHT_ID, 'dumbbells'], compound: true, technicalDemand: 2 },
  { id: 'bulgarian_split_squat', name: 'Bulgarian split squat', pattern: 'lunge', primaryMuscles: ['quads', 'glutes'], requiredEquipment: [BODYWEIGHT_ID, 'dumbbells'], alsoRequires: ['flat_bench'], compound: true, technicalDemand: 2 },
  { id: 'reverse_lunge', name: 'Reverse lunge', pattern: 'lunge', primaryMuscles: ['quads', 'glutes'], requiredEquipment: [BODYWEIGHT_ID, 'dumbbells', 'kettlebell'], compound: true, technicalDemand: 1 },
  { id: 'step_up', name: 'Step-up', pattern: 'lunge', primaryMuscles: ['quads', 'glutes'], requiredEquipment: [BODYWEIGHT_ID, 'dumbbells'], alsoRequires: ['flat_bench'], compound: true, technicalDemand: 1 },

  // --- Horizontal push ------------------------------------------------------
  { id: 'barbell_bench_press', name: 'Barbell bench press', pattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps', 'front_delts'], requiredEquipment: ['barbell'], alsoRequires: ['flat_bench'], compound: true, technicalDemand: 2 },
  { id: 'incline_barbell_press', name: 'Incline barbell press', pattern: 'horizontal_push', primaryMuscles: ['chest', 'front_delts'], requiredEquipment: ['barbell'], alsoRequires: ['adjustable_bench'], compound: true, technicalDemand: 2 },
  { id: 'dumbbell_bench_press', name: 'Dumbbell bench press', pattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], requiredEquipment: ['dumbbells'], alsoRequires: ['flat_bench'], compound: true, technicalDemand: 1 },
  { id: 'incline_dumbbell_press', name: 'Incline dumbbell press', pattern: 'horizontal_push', primaryMuscles: ['chest', 'front_delts'], requiredEquipment: ['dumbbells'], alsoRequires: ['adjustable_bench'], compound: true, technicalDemand: 1 },
  { id: 'machine_chest_press', name: 'Machine chest press', pattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], requiredEquipment: ['chest_press_machine'], compound: true, technicalDemand: 1 },
  { id: 'push_up', name: 'Push-up', pattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], requiredEquipment: [BODYWEIGHT_ID], compound: true, technicalDemand: 1 },
  { id: 'dip', name: 'Dip', pattern: 'horizontal_push', primaryMuscles: ['chest', 'triceps'], requiredEquipment: ['dip_station', 'assisted_pull_up_machine'], compound: true, technicalDemand: 2 },
  { id: 'cable_fly', name: 'Cable fly', pattern: 'horizontal_push', primaryMuscles: ['chest'], requiredEquipment: ['cable_machine'], compound: false, technicalDemand: 1 },
  { id: 'pec_deck_fly', name: 'Pec deck fly', pattern: 'horizontal_push', primaryMuscles: ['chest'], requiredEquipment: ['pec_deck'], compound: false, technicalDemand: 1 },

  // --- Vertical push --------------------------------------------------------
  { id: 'overhead_press', name: 'Overhead press', pattern: 'vertical_push', primaryMuscles: ['front_delts', 'triceps'], requiredEquipment: ['barbell'], compound: true, technicalDemand: 2 },
  { id: 'dumbbell_shoulder_press', name: 'Dumbbell shoulder press', pattern: 'vertical_push', primaryMuscles: ['front_delts', 'triceps'], requiredEquipment: ['dumbbells'], compound: true, technicalDemand: 1 },
  { id: 'machine_shoulder_press', name: 'Machine shoulder press', pattern: 'vertical_push', primaryMuscles: ['front_delts', 'triceps'], requiredEquipment: ['shoulder_press_machine'], compound: true, technicalDemand: 1 },
  { id: 'lateral_raise', name: 'Lateral raise', pattern: 'vertical_push', primaryMuscles: ['side_delts'], requiredEquipment: ['dumbbells', 'cable_machine', 'lateral_raise_machine', 'resistance_bands'], compound: false, technicalDemand: 1 },
  { id: 'pike_push_up', name: 'Pike push-up', pattern: 'vertical_push', primaryMuscles: ['front_delts', 'triceps'], requiredEquipment: [BODYWEIGHT_ID], compound: true, technicalDemand: 2 },

  // --- Horizontal pull ------------------------------------------------------
  { id: 'barbell_row', name: 'Barbell row', pattern: 'horizontal_pull', primaryMuscles: ['upper_back', 'lats', 'biceps'], requiredEquipment: ['barbell'], compound: true, technicalDemand: 3 },
  { id: 'dumbbell_row', name: 'Dumbbell row', pattern: 'horizontal_pull', primaryMuscles: ['lats', 'upper_back'], requiredEquipment: ['dumbbells'], compound: true, technicalDemand: 1 },
  { id: 'seated_cable_row', name: 'Seated cable row', pattern: 'horizontal_pull', primaryMuscles: ['upper_back', 'lats'], requiredEquipment: ['seated_row', 'cable_machine'], compound: true, technicalDemand: 1 },
  { id: 'chest_supported_row', name: 'Chest-supported row', pattern: 'horizontal_pull', primaryMuscles: ['upper_back', 'rear_delts'], requiredEquipment: ['dumbbells'], alsoRequires: ['adjustable_bench'], compound: true, technicalDemand: 1 },
  { id: 'inverted_row', name: 'Inverted row', pattern: 'horizontal_pull', primaryMuscles: ['upper_back', 'lats'], requiredEquipment: ['suspension_trainer', 'pull_up_bar', 'smith_machine'], compound: true, technicalDemand: 1 },
  { id: 'band_row', name: 'Band row', pattern: 'horizontal_pull', primaryMuscles: ['upper_back'], requiredEquipment: ['resistance_bands'], compound: false, technicalDemand: 1 },
  { id: 'face_pull', name: 'Face pull', pattern: 'horizontal_pull', primaryMuscles: ['rear_delts', 'upper_back'], requiredEquipment: ['cable_machine', 'resistance_bands'], compound: false, technicalDemand: 1 },
  { id: 'reverse_fly', name: 'Reverse fly', pattern: 'horizontal_pull', primaryMuscles: ['rear_delts'], requiredEquipment: ['dumbbells', 'rear_delt_machine', 'cable_machine'], compound: false, technicalDemand: 1 },

  // --- Vertical pull --------------------------------------------------------
  { id: 'pull_up', name: 'Pull-up', pattern: 'vertical_pull', primaryMuscles: ['lats', 'biceps'], requiredEquipment: ['pull_up_bar'], compound: true, technicalDemand: 2 },
  { id: 'chin_up', name: 'Chin-up', pattern: 'vertical_pull', primaryMuscles: ['lats', 'biceps'], requiredEquipment: ['pull_up_bar'], compound: true, technicalDemand: 2 },
  { id: 'lat_pulldown_pull', name: 'Lat pulldown', pattern: 'vertical_pull', primaryMuscles: ['lats', 'biceps'], requiredEquipment: ['lat_pulldown', 'cable_machine'], compound: true, technicalDemand: 1 },
  { id: 'assisted_pull_up', name: 'Assisted pull-up', pattern: 'vertical_pull', primaryMuscles: ['lats', 'biceps'], requiredEquipment: ['assisted_pull_up_machine', 'resistance_bands'], compound: true, technicalDemand: 1 },

  // --- Arms -----------------------------------------------------------------
  { id: 'barbell_curl', name: 'Barbell curl', pattern: 'elbow_flexion', primaryMuscles: ['biceps'], requiredEquipment: ['barbell', 'ez_bar'], compound: false, technicalDemand: 1 },
  { id: 'dumbbell_curl', name: 'Dumbbell curl', pattern: 'elbow_flexion', primaryMuscles: ['biceps', 'forearms'], requiredEquipment: ['dumbbells'], compound: false, technicalDemand: 1 },
  { id: 'cable_curl', name: 'Cable curl', pattern: 'elbow_flexion', primaryMuscles: ['biceps'], requiredEquipment: ['cable_machine', 'resistance_bands'], compound: false, technicalDemand: 1 },
  { id: 'preacher_curl', name: 'Preacher curl', pattern: 'elbow_flexion', primaryMuscles: ['biceps'], requiredEquipment: ['ez_bar', 'dumbbells'], alsoRequires: ['preacher_bench'], compound: false, technicalDemand: 1 },
  { id: 'triceps_pushdown', name: 'Triceps pushdown', pattern: 'elbow_extension', primaryMuscles: ['triceps'], requiredEquipment: ['cable_machine', 'resistance_bands'], compound: false, technicalDemand: 1 },
  { id: 'overhead_triceps_extension', name: 'Overhead triceps extension', pattern: 'elbow_extension', primaryMuscles: ['triceps'], requiredEquipment: ['dumbbells', 'ez_bar', 'cable_machine'], compound: false, technicalDemand: 1 },
  { id: 'skullcrusher', name: 'Skullcrusher', pattern: 'elbow_extension', primaryMuscles: ['triceps'], requiredEquipment: ['ez_bar', 'dumbbells'], alsoRequires: ['flat_bench'], compound: false, technicalDemand: 2 },
  { id: 'close_grip_push_up', name: 'Close-grip push-up', pattern: 'elbow_extension', primaryMuscles: ['triceps', 'chest'], requiredEquipment: [BODYWEIGHT_ID], compound: false, technicalDemand: 1 },

  // --- Legs, isolation ------------------------------------------------------
  { id: 'leg_extension_iso', name: 'Leg extension', pattern: 'knee_extension', primaryMuscles: ['quads'], requiredEquipment: ['leg_extension'], compound: false, technicalDemand: 1 },
  { id: 'leg_curl_iso', name: 'Leg curl', pattern: 'knee_flexion', primaryMuscles: ['hamstrings'], requiredEquipment: ['leg_curl'], compound: false, technicalDemand: 1 },
  { id: 'nordic_curl', name: 'Nordic hamstring curl', pattern: 'knee_flexion', primaryMuscles: ['hamstrings'], requiredEquipment: [BODYWEIGHT_ID], compound: false, technicalDemand: 3 },
  { id: 'hip_abduction_iso', name: 'Hip abduction', pattern: 'hip_abduction', primaryMuscles: ['glutes'], requiredEquipment: ['hip_abduction_machine', 'resistance_bands', 'cable_machine'], compound: false, technicalDemand: 1 },
  { id: 'standing_calf_raise', name: 'Standing calf raise', pattern: 'calf', primaryMuscles: ['calves'], requiredEquipment: ['calf_raise_machine', 'smith_machine', 'dumbbells', BODYWEIGHT_ID], compound: false, technicalDemand: 1 },

  // --- Core -----------------------------------------------------------------
  { id: 'plank', name: 'Plank', pattern: 'core_brace', primaryMuscles: ['abs'], requiredEquipment: [BODYWEIGHT_ID], compound: false, technicalDemand: 1 },
  { id: 'ab_wheel_rollout', name: 'Ab wheel rollout', pattern: 'core_brace', primaryMuscles: ['abs'], requiredEquipment: ['ab_wheel'], compound: false, technicalDemand: 3 },
  { id: 'hanging_leg_raise', name: 'Hanging leg raise', pattern: 'core_flexion', primaryMuscles: ['abs', 'hip_flexors'], requiredEquipment: ['pull_up_bar'], compound: false, technicalDemand: 2 },
  { id: 'cable_crunch', name: 'Cable crunch', pattern: 'core_flexion', primaryMuscles: ['abs'], requiredEquipment: ['cable_machine'], compound: false, technicalDemand: 1 },
  { id: 'dead_bug', name: 'Dead bug', pattern: 'core_brace', primaryMuscles: ['abs'], requiredEquipment: [BODYWEIGHT_ID], compound: false, technicalDemand: 1 },
  { id: 'russian_twist', name: 'Russian twist', pattern: 'rotation', primaryMuscles: ['obliques'], requiredEquipment: [BODYWEIGHT_ID, 'medicine_ball', 'weight_plates'], compound: false, technicalDemand: 1 },
  { id: 'pallof_press', name: 'Pallof press', pattern: 'rotation', primaryMuscles: ['obliques', 'abs'], requiredEquipment: ['cable_machine', 'resistance_bands'], compound: false, technicalDemand: 1 },
  { id: 'farmer_carry', name: 'Farmer carry', pattern: 'carry', primaryMuscles: ['forearms', 'traps', 'abs'], requiredEquipment: ['dumbbells', 'kettlebell', 'trap_bar'], compound: true, technicalDemand: 1 },
]

const BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]))

export function exerciseById(id: string): CatalogExercise | undefined {
  return BY_ID.get(id)
}

export function exercisesForPattern(pattern: MovementPattern): CatalogExercise[] {
  return EXERCISES.filter((exercise) => exercise.pattern === pattern)
}
