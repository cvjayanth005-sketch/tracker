import { describe, expect, it } from 'vitest'
import { calculatePlates } from './plateCalculator'

describe('calculatePlates', () => {
  it('returns empty plates if target weight equals or is less than bar weight', () => {
    const result = calculatePlates(20, 20)
    expect(result.plates).toHaveLength(0)
    expect(result.weightPerSide).toBe(0)
    expect(result.totalCalculatedWeight).toBe(20)
    expect(result.remainder).toBe(0)
  })

  it('correctly calculates 100 kg on a 20 kg bar (40 kg per side = 25kg + 15kg or 20kg + 20kg)', () => {
    const result = calculatePlates(100, 20)
    // 40 kg per side: 25 kg + 15 kg
    expect(result.weightPerSide).toBe(40)
    expect(result.totalCalculatedWeight).toBe(100)
    expect(result.remainder).toBe(0)
    expect(result.plateSequence.map((p) => p.weight)).toEqual([25, 15])
  })

  it('calculates 82.5 kg on a 20 kg bar (31.25 kg per side = 25 + 5 + 1.25)', () => {
    const result = calculatePlates(82.5, 20)
    expect(result.weightPerSide).toBe(31.25)
    expect(result.totalCalculatedWeight).toBe(82.5)
    expect(result.remainder).toBe(0)
    expect(result.plateSequence.map((p) => p.weight)).toEqual([25, 5, 1.25])
  })

  it('supports 15 kg barbell', () => {
    const result = calculatePlates(65, 15)
    // 50 kg loaded = 25 kg per side (25 kg plate)
    expect(result.weightPerSide).toBe(25)
    expect(result.totalCalculatedWeight).toBe(65)
    expect(result.plateSequence.map((p) => p.weight)).toEqual([25])
  })
})
