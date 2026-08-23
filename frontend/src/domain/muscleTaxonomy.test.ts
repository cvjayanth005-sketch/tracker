import { describe, expect, it } from 'vitest'
import { classifyBodyPart } from './muscleTaxonomy'

describe('classifyBodyPart — chest', () => {
  it('reads incline as upper chest', () => {
    expect(classifyBodyPart('Incline Barbell Bench Press')).toEqual({ group: 'chest', subregion: 'upper' })
  })
  it('reads decline as lower chest', () => {
    expect(classifyBodyPart('Decline Dumbbell Press')).toEqual({ group: 'chest', subregion: 'lower' })
  })
  it('reads a flat/plain bench as general chest', () => {
    expect(classifyBodyPart('Barbell Bench Press')).toEqual({ group: 'chest', subregion: 'general' })
  })
  it('reads a fly as mid chest', () => {
    expect(classifyBodyPart('Cable Fly')).toEqual({ group: 'chest', subregion: 'mid' })
  })
})

describe('classifyBodyPart — back', () => {
  it('reads pulldowns and pull-ups as lats', () => {
    expect(classifyBodyPart('Lat Pulldown')).toEqual({ group: 'back', subregion: 'lats' })
    expect(classifyBodyPart('Pull-Up')).toEqual({ group: 'back', subregion: 'lats' })
    expect(classifyBodyPart('Chin-Up')).toEqual({ group: 'back', subregion: 'lats' })
  })
  it('reads rows as mid back', () => {
    expect(classifyBodyPart('Barbell Row')).toEqual({ group: 'back', subregion: 'mid' })
    expect(classifyBodyPart('Seated Cable Row')).toEqual({ group: 'back', subregion: 'mid' })
  })
  it('reads shrugs as upper back', () => {
    expect(classifyBodyPart('Barbell Shrug')).toEqual({ group: 'back', subregion: 'upper' })
  })
  it('reads back extensions as lower back', () => {
    expect(classifyBodyPart('Back Extension')).toEqual({ group: 'back', subregion: 'lower' })
    expect(classifyBodyPart('Hyperextension')).toEqual({ group: 'back', subregion: 'lower' })
  })
})

describe('classifyBodyPart — legs, and the leg-checked-before-arms ordering', () => {
  it('does not let "leg curl" fall into biceps via the bare "curl" match', () => {
    expect(classifyBodyPart('Leg Curl')).toEqual({ group: 'legs', subregion: 'hamstrings' })
  })
  it('does not let "leg extension" fall into triceps via the bare "extension" match', () => {
    expect(classifyBodyPart('Leg Extension')).toEqual({ group: 'legs', subregion: 'quads' })
  })
  it('reads squats and leg press as quads', () => {
    expect(classifyBodyPart('Back Squat')).toEqual({ group: 'legs', subregion: 'quads' })
    expect(classifyBodyPart('Leg Press')).toEqual({ group: 'legs', subregion: 'quads' })
  })
  it('reads deadlift variants as a leg movement, matching the six-bucket classifier', () => {
    expect(classifyBodyPart('Romanian Deadlift')).toEqual({ group: 'legs', subregion: 'hamstrings' })
    expect(classifyBodyPart('Conventional Deadlift')).toEqual({ group: 'legs', subregion: 'hamstrings' })
  })
  it('reads calf raises as calves, not shins', () => {
    expect(classifyBodyPart('Standing Calf Raise')).toEqual({ group: 'legs', subregion: 'calves' })
  })
  it('reads a shin-specific exercise as shins, not calves', () => {
    expect(classifyBodyPart('Tibialis Raise')).toEqual({ group: 'legs', subregion: 'shins' })
  })
  it('reads hip thrusts and glute bridges as hamstrings/posterior chain', () => {
    expect(classifyBodyPart('Hip Thrust')).toEqual({ group: 'legs', subregion: 'hamstrings' })
  })
  it('reads step-ups as quads and hip abduction as posterior chain', () => {
    expect(classifyBodyPart('Step-up')).toEqual({ group: 'legs', subregion: 'quads' })
    expect(classifyBodyPart('Hip abduction')).toEqual({ group: 'legs', subregion: 'hamstrings' })
  })
})

describe('classifyBodyPart — arms split into triceps and biceps', () => {
  it('reads curls as biceps', () => {
    expect(classifyBodyPart('Dumbbell Curl')).toEqual({ group: 'biceps', subregion: null })
    expect(classifyBodyPart('Preacher Curl')).toEqual({ group: 'biceps', subregion: null })
  })
  it('reads pushdowns and skullcrushers as triceps', () => {
    expect(classifyBodyPart('Triceps Pushdown')).toEqual({ group: 'triceps', subregion: null })
    expect(classifyBodyPart('Skullcrusher')).toEqual({ group: 'triceps', subregion: null })
  })
})

describe('classifyBodyPart — shoulders and core stay flat (no subregion)', () => {
  it('classifies overhead press as shoulders with no subregion', () => {
    expect(classifyBodyPart('Overhead Press')).toEqual({ group: 'shoulders', subregion: null })
  })
  it('classifies plank as core with no subregion', () => {
    expect(classifyBodyPart('Plank')).toEqual({ group: 'core', subregion: null })
  })
  it('classifies anti-rotation and anti-extension core work', () => {
    expect(classifyBodyPart('Dead bug')).toEqual({ group: 'core', subregion: null })
    expect(classifyBodyPart('Pallof press')).toEqual({ group: 'core', subregion: null })
  })
})

describe('classifyBodyPart — refuses rather than guessing', () => {
  it('returns null for an exercise it cannot classify', () => {
    expect(classifyBodyPart('Farmer Carry')).toBeNull()
  })
})
