import { describe, expect, it } from 'vitest'
import {
  defaultCustomExerciseParams,
  defaultExerciseParams,
  isCatalogExerciseUsable,
} from './exercisePicker'
import type { CatalogExercise } from './onboarding/catalog/exercises'

function exercise(over: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: 'test',
    name: 'Test movement',
    pattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    requiredEquipment: ['barbell'],
    compound: true,
    technicalDemand: 2,
    ...over,
  }
}

describe('isCatalogExerciseUsable', () => {
  it('is usable when the person owns one of the alternative equipment options', () => {
    const ex = exercise({ requiredEquipment: ['barbell', 'dumbbells'] })
    expect(isCatalogExerciseUsable(ex, ['dumbbells'])).toBe(true)
  })

  it('is not usable when none of the required equipment is owned', () => {
    const ex = exercise({ requiredEquipment: ['barbell', 'dumbbells'] })
    expect(isCatalogExerciseUsable(ex, ['kettlebell'])).toBe(false)
  })

  it('bodyweight is always available even with nothing owned', () => {
    const ex = exercise({ requiredEquipment: ['bodyweight'] })
    expect(isCatalogExerciseUsable(ex, [])).toBe(true)
  })

  it('requires every alsoRequires item in addition to one required option', () => {
    const ex = exercise({ requiredEquipment: ['barbell'], alsoRequires: ['squat_rack'] })
    expect(isCatalogExerciseUsable(ex, ['barbell'])).toBe(false)
    expect(isCatalogExerciseUsable(ex, ['barbell', 'squat_rack'])).toBe(true)
  })
})

describe('defaultExerciseParams', () => {
  it('gives lower-body compounds a bigger load increment than upper-body compounds', () => {
    const lower = defaultExerciseParams(exercise({ compound: true, primaryMuscles: ['quads'] }))
    const upper = defaultExerciseParams(exercise({ compound: true, primaryMuscles: ['chest'] }))
    expect(lower.loadIncrementKg).toBeGreaterThan(upper.loadIncrementKg)
  })

  it('gives isolation work a higher rep range than compounds', () => {
    const compound = defaultExerciseParams(exercise({ compound: true, primaryMuscles: ['chest'] }))
    const isolation = defaultExerciseParams(exercise({ compound: false, primaryMuscles: ['biceps'] }))
    expect(isolation.repRangeMin).toBeGreaterThan(compound.repRangeMin)
  })
})

describe('defaultCustomExerciseParams', () => {
  it('returns a moderate, generally-safe starting point', () => {
    const params = defaultCustomExerciseParams()
    expect(params.targetSets).toBeGreaterThan(0)
    expect(params.repRangeMax).toBeGreaterThan(params.repRangeMin)
  })
})
