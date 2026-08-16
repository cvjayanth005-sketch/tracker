import { describe, expect, it } from 'vitest'
import {
  cmToFeetInches,
  feetInchesToCm,
  isPlausibleHeightCm,
  isPlausibleWeightKg,
  kgToLb,
  lbToKg,
  toCanonicalCm,
  toCanonicalKg,
} from './units'

describe('canonical unit conversion', () => {
  it('normalizes imperial entry to canonical metric', () => {
    expect(lbToKg(180)).toBeCloseTo(81.6, 1)
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.3, 1)
    expect(toCanonicalKg(180, 'lb')).toBeCloseTo(81.6, 1)
    expect(toCanonicalCm(71, 'in')).toBeCloseTo(180.3, 1)
  })

  it('leaves metric entry untouched apart from rounding', () => {
    expect(toCanonicalKg(82.35, 'kg')).toBe(82.4)
    expect(toCanonicalCm(180, 'cm')).toBe(180)
  })

  it('survives a weight round trip without visible drift', () => {
    for (const kg of [55, 72.5, 90.1, 120]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 1)
    }
  })

  it('loses at most half an inch through a feet-and-inches round trip', () => {
    /*
     * Whole-inch display is inherently lossy — 2.54cm per step, so rounding to
     * the nearest inch can move a height by up to 1.27cm and 195cm comes back
     * as 195.6. That is a property of how people state height, not a defect, so
     * the tolerance is asserted rather than the drift being engineered away by
     * storing fractional inches nobody would ever say aloud.
     */
    for (const cm of [150, 165.5, 180, 195]) {
      const { feet, inches } = cmToFeetInches(cm)!
      expect(Math.abs(feetInchesToCm(feet, inches)! - cm)).toBeLessThanOrEqual(1.27)
    }
  })

  it('carries 12 inches into the next foot rather than reading 5ft 12in', () => {
    // 182.7cm is 5'11.9", which naively rounds to 5'12".
    expect(cmToFeetInches(182.7)).toEqual({ feet: 6, inches: 0 })
  })

  it('keeps unanswered values null instead of coercing to zero', () => {
    expect(lbToKg(null)).toBeNull()
    expect(toCanonicalKg(null, 'lb')).toBeNull()
    expect(toCanonicalCm(null, 'cm')).toBeNull()
    expect(cmToFeetInches(null)).toBeNull()
    expect(feetInchesToCm(null, null)).toBeNull()
    // Number('') is 0 and Number('abc') is NaN; neither may become a real value.
    expect(toCanonicalKg(Number.NaN, 'kg')).toBeNull()
  })

  it('accepts feet with no inches', () => {
    expect(feetInchesToCm(6, null)).toBeCloseTo(182.9, 1)
  })

  it('flags values that look like a unit mix-up', () => {
    expect(isPlausibleWeightKg(82)).toBe(true)
    // 180 lb typed into a kg field.
    expect(isPlausibleWeightKg(400)).toBe(false)
    expect(isPlausibleHeightCm(180)).toBe(true)
    // 71 inches typed into a cm field.
    expect(isPlausibleHeightCm(71)).toBe(false)
    expect(isPlausibleWeightKg(null)).toBe(false)
  })
})
