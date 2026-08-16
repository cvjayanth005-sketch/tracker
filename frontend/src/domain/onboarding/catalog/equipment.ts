import type {
  EquipmentCategory,
  MovementPattern,
  MuscleGroup,
  TrainingEnvironment,
} from '@/domain/onboarding/types'

/**
 * Equipment catalogue.
 *
 * Static reference data, not user data: it ships in the bundle and is never
 * written to IndexedDB. Only the stable `id` is persisted (on the training
 * chapter), so labels and aliases can be reworded freely without a migration.
 *
 * Ids are permanent. Renaming one silently invalidates every stored selection,
 * so retire an entry with `deprecated` instead and keep the id reserved.
 */

export interface EquipmentItem {
  /** Permanent. Never reuse or rename. */
  id: string
  label: string
  /** Search synonyms, including regional naming, for the picker's filter. */
  aliases: string[]
  category: EquipmentCategory
  /** Patterns this equipment can express at all. */
  patterns: MovementPattern[]
  /** Muscle groups it is commonly used to train. */
  muscles: MuscleGroup[]
  /** Environments where selecting it is plausible, for sensible defaults. */
  environments: TrainingEnvironment[]
  deprecated?: true
}

/** Selected automatically for every user: a body is always available. */
export const BODYWEIGHT_ID = 'bodyweight'

export const EQUIPMENT: readonly EquipmentItem[] = [
  // --- Bodyweight -----------------------------------------------------------
  {
    id: BODYWEIGHT_ID,
    label: 'Bodyweight only',
    aliases: ['none', 'no equipment', 'calisthenics'],
    category: 'bodyweight',
    patterns: [
      'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push',
      'core_brace', 'core_flexion', 'rotation', 'cardio',
    ],
    muscles: ['quads', 'glutes', 'hamstrings', 'chest', 'triceps', 'abs', 'obliques', 'full_body'],
    environments: ['commercial_gym', 'home_gym', 'minimal_equipment', 'bodyweight', 'custom'],
  },
  {
    id: 'pull_up_bar',
    label: 'Pull-up bar',
    aliases: ['chin-up bar', 'doorway bar'],
    category: 'bodyweight',
    patterns: ['vertical_pull', 'core_flexion'],
    muscles: ['lats', 'upper_back', 'biceps', 'abs'],
    environments: ['commercial_gym', 'home_gym', 'minimal_equipment', 'custom'],
  },
  {
    id: 'dip_station',
    label: 'Dip bars / parallettes',
    aliases: ['parallel bars', 'dip stand'],
    category: 'bodyweight',
    patterns: ['horizontal_push', 'vertical_push'],
    muscles: ['chest', 'triceps', 'front_delts'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },

  // --- Free weights ---------------------------------------------------------
  {
    id: 'barbell',
    label: 'Barbell',
    aliases: ['olympic bar', 'straight bar'],
    category: 'free_weight',
    patterns: ['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'elbow_flexion', 'calf'],
    muscles: ['quads', 'hamstrings', 'glutes', 'chest', 'upper_back', 'front_delts', 'biceps', 'lower_back'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'dumbbells',
    label: 'Dumbbells',
    aliases: ['db', 'free weights', 'hand weights'],
    category: 'free_weight',
    patterns: [
      'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull',
      'elbow_flexion', 'elbow_extension', 'hip_abduction', 'calf', 'carry', 'rotation',
    ],
    muscles: ['quads', 'hamstrings', 'glutes', 'chest', 'lats', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms'],
    environments: ['commercial_gym', 'home_gym', 'minimal_equipment', 'custom'],
  },
  {
    id: 'kettlebell',
    label: 'Kettlebell',
    aliases: ['kb'],
    category: 'free_weight',
    patterns: ['hinge', 'squat', 'lunge', 'vertical_push', 'carry', 'cardio'],
    muscles: ['glutes', 'hamstrings', 'quads', 'front_delts', 'full_body'],
    environments: ['home_gym', 'minimal_equipment', 'custom'],
  },
  {
    id: 'ez_bar',
    label: 'EZ curl bar',
    aliases: ['curl bar', 'w bar'],
    category: 'free_weight',
    patterns: ['elbow_flexion', 'elbow_extension'],
    muscles: ['biceps', 'triceps', 'forearms'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'trap_bar',
    label: 'Trap / hex bar',
    aliases: ['hex bar', 'deadlift bar'],
    category: 'free_weight',
    patterns: ['hinge', 'squat', 'carry'],
    muscles: ['glutes', 'hamstrings', 'quads', 'traps'],
    environments: ['commercial_gym', 'custom'],
  },

  // --- Racks and benches ----------------------------------------------------
  {
    id: 'squat_rack',
    label: 'Squat rack / power cage',
    aliases: ['power rack', 'cage', 'half rack'],
    category: 'rack_bench',
    patterns: ['squat', 'vertical_push', 'hinge'],
    muscles: ['quads', 'glutes', 'front_delts'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'flat_bench',
    label: 'Flat bench',
    aliases: ['bench'],
    category: 'rack_bench',
    patterns: ['horizontal_push', 'horizontal_pull', 'elbow_extension'],
    muscles: ['chest', 'triceps', 'lats'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'adjustable_bench',
    label: 'Adjustable / incline bench',
    aliases: ['incline bench', 'decline bench'],
    category: 'rack_bench',
    patterns: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'elbow_flexion'],
    muscles: ['chest', 'front_delts', 'biceps'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'smith_machine',
    label: 'Smith machine',
    aliases: ['guided bar'],
    category: 'rack_bench',
    patterns: ['squat', 'horizontal_push', 'vertical_push', 'lunge', 'calf'],
    muscles: ['quads', 'glutes', 'chest', 'front_delts', 'calves'],
    environments: ['commercial_gym', 'custom'],
  },

  // --- Cables ---------------------------------------------------------------
  {
    id: 'cable_machine',
    label: 'Cable machine / functional trainer',
    aliases: ['cables', 'pulley', 'crossover'],
    category: 'cable',
    patterns: [
      'horizontal_pull', 'vertical_pull', 'horizontal_push', 'elbow_flexion',
      'elbow_extension', 'rotation', 'hip_abduction', 'core_flexion',
    ],
    muscles: ['lats', 'upper_back', 'rear_delts', 'side_delts', 'chest', 'biceps', 'triceps', 'abs', 'obliques'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'lat_pulldown',
    label: 'Lat pulldown',
    aliases: ['pulldown'],
    category: 'cable',
    patterns: ['vertical_pull'],
    muscles: ['lats', 'upper_back', 'biceps'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'seated_row',
    label: 'Seated cable row',
    aliases: ['low row', 'cable row'],
    category: 'cable',
    patterns: ['horizontal_pull'],
    muscles: ['upper_back', 'lats', 'biceps', 'rear_delts'],
    environments: ['commercial_gym', 'custom'],
  },

  // --- Machines -------------------------------------------------------------
  {
    id: 'chest_press_machine',
    label: 'Chest press machine',
    aliases: ['machine press', 'hammer strength press'],
    category: 'machine',
    patterns: ['horizontal_push'],
    muscles: ['chest', 'triceps', 'front_delts'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'pec_deck',
    label: 'Pec deck / chest fly machine',
    aliases: ['chest fly machine', 'butterfly'],
    category: 'machine',
    patterns: ['horizontal_push'],
    muscles: ['chest', 'front_delts'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'shoulder_press_machine',
    label: 'Shoulder press machine',
    aliases: ['overhead press machine'],
    category: 'machine',
    patterns: ['vertical_push'],
    muscles: ['front_delts', 'side_delts', 'triceps'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'lateral_raise_machine',
    label: 'Lateral raise machine',
    aliases: ['side raise machine'],
    category: 'machine',
    patterns: ['vertical_push'],
    muscles: ['side_delts'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'rear_delt_machine',
    label: 'Rear delt / reverse fly machine',
    aliases: ['reverse pec deck'],
    category: 'machine',
    patterns: ['horizontal_pull'],
    muscles: ['rear_delts', 'upper_back'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'leg_press',
    label: 'Leg press',
    aliases: ['45 degree press'],
    category: 'machine',
    patterns: ['squat'],
    muscles: ['quads', 'glutes', 'hamstrings'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'hack_squat',
    label: 'Hack squat machine',
    aliases: ['hack press'],
    category: 'machine',
    patterns: ['squat'],
    muscles: ['quads', 'glutes'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'leg_extension',
    label: 'Leg extension machine',
    aliases: ['quad extension'],
    category: 'machine',
    patterns: ['knee_extension'],
    muscles: ['quads'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'leg_curl',
    label: 'Leg curl machine',
    aliases: ['hamstring curl', 'lying curl', 'seated curl'],
    category: 'machine',
    patterns: ['knee_flexion'],
    muscles: ['hamstrings'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'hip_thrust_machine',
    label: 'Hip thrust machine',
    aliases: ['glute drive'],
    category: 'machine',
    patterns: ['hinge'],
    muscles: ['glutes', 'hamstrings'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'hip_abduction_machine',
    label: 'Hip abduction / adduction machine',
    aliases: ['abductor machine', 'adductor machine'],
    category: 'machine',
    patterns: ['hip_abduction'],
    muscles: ['glutes'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'calf_raise_machine',
    label: 'Calf raise machine',
    aliases: ['standing calf', 'seated calf'],
    category: 'machine',
    patterns: ['calf'],
    muscles: ['calves'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'back_extension',
    label: 'Back extension / GHD',
    aliases: ['hyperextension', 'roman chair', 'ghd'],
    category: 'machine',
    patterns: ['hinge'],
    muscles: ['lower_back', 'glutes', 'hamstrings'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'preacher_bench',
    label: 'Preacher curl bench',
    aliases: ['scott bench'],
    category: 'machine',
    patterns: ['elbow_flexion'],
    muscles: ['biceps', 'forearms'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'assisted_pull_up_machine',
    label: 'Assisted pull-up / dip machine',
    aliases: ['gravitron', 'assisted chin'],
    category: 'machine',
    patterns: ['vertical_pull', 'vertical_push'],
    muscles: ['lats', 'biceps', 'triceps', 'chest'],
    environments: ['commercial_gym', 'custom'],
  },

  // --- Cardio ---------------------------------------------------------------
  {
    id: 'treadmill',
    label: 'Treadmill',
    aliases: ['running machine'],
    category: 'cardio',
    patterns: ['cardio'],
    muscles: ['full_body'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'stationary_bike',
    label: 'Stationary bike',
    aliases: ['exercise bike', 'spin bike', 'assault bike'],
    category: 'cardio',
    patterns: ['cardio'],
    muscles: ['quads', 'glutes'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'rowing_machine',
    label: 'Rowing machine',
    aliases: ['erg', 'concept2'],
    category: 'cardio',
    patterns: ['cardio', 'horizontal_pull'],
    muscles: ['upper_back', 'lats', 'quads', 'full_body'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'elliptical',
    label: 'Elliptical / cross trainer',
    aliases: ['cross trainer'],
    category: 'cardio',
    patterns: ['cardio'],
    muscles: ['full_body'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'stair_climber',
    label: 'Stair climber',
    aliases: ['stairmaster', 'step mill'],
    category: 'cardio',
    patterns: ['cardio'],
    muscles: ['glutes', 'quads', 'calves'],
    environments: ['commercial_gym', 'custom'],
  },
  {
    id: 'jump_rope',
    label: 'Jump rope',
    aliases: ['skipping rope'],
    category: 'cardio',
    patterns: ['cardio', 'calf'],
    muscles: ['calves', 'full_body'],
    environments: ['home_gym', 'minimal_equipment', 'bodyweight', 'custom'],
  },

  // --- Accessories ----------------------------------------------------------
  {
    id: 'resistance_bands',
    label: 'Resistance bands',
    aliases: ['bands', 'loop bands', 'therabands'],
    category: 'accessory',
    patterns: [
      'horizontal_pull', 'vertical_pull', 'horizontal_push', 'hip_abduction',
      'elbow_flexion', 'elbow_extension', 'rotation',
    ],
    muscles: ['upper_back', 'rear_delts', 'glutes', 'biceps', 'triceps'],
    environments: ['home_gym', 'minimal_equipment', 'bodyweight', 'custom'],
  },
  {
    id: 'suspension_trainer',
    label: 'Suspension trainer',
    aliases: ['trx', 'gymnastic rings', 'rings'],
    category: 'accessory',
    patterns: ['horizontal_pull', 'vertical_pull', 'horizontal_push', 'core_brace', 'lunge'],
    muscles: ['upper_back', 'lats', 'chest', 'abs'],
    environments: ['home_gym', 'minimal_equipment', 'custom'],
  },
  {
    id: 'ab_wheel',
    label: 'Ab wheel',
    aliases: ['roller'],
    category: 'accessory',
    patterns: ['core_brace'],
    muscles: ['abs', 'obliques'],
    environments: ['home_gym', 'minimal_equipment', 'bodyweight', 'custom'],
  },
  {
    id: 'medicine_ball',
    label: 'Medicine ball / slam ball',
    aliases: ['slam ball', 'wall ball'],
    category: 'accessory',
    patterns: ['rotation', 'core_flexion', 'cardio'],
    muscles: ['obliques', 'abs', 'full_body'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'weight_plates',
    label: 'Weight plates',
    aliases: ['plates', 'discs'],
    category: 'accessory',
    patterns: ['core_flexion', 'rotation', 'carry', 'calf'],
    muscles: ['abs', 'obliques', 'forearms'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
  {
    id: 'dip_belt',
    label: 'Dip / weight belt',
    aliases: ['weight belt'],
    category: 'accessory',
    patterns: ['vertical_pull', 'vertical_push'],
    muscles: ['lats', 'chest', 'triceps'],
    environments: ['commercial_gym', 'home_gym', 'custom'],
  },
]

const BY_ID = new Map(EQUIPMENT.map((item) => [item.id, item]))

export function equipmentById(id: string): EquipmentItem | undefined {
  return BY_ID.get(id)
}

/** Ids that exist in the catalogue and are not retired. */
export function knownEquipmentIds(ids: readonly string[]): string[] {
  return ids.filter((id) => {
    const item = BY_ID.get(id)
    return item !== undefined && !item.deprecated
  })
}

/** Sensible starting selection for an environment, before the user edits it. */
export function defaultEquipmentFor(environment: TrainingEnvironment): string[] {
  if (environment === 'custom') return [BODYWEIGHT_ID]
  return EQUIPMENT.filter((item) => !item.deprecated && item.environments.includes(environment)).map(
    (item) => item.id,
  )
}
