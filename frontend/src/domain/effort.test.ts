import { describe, expect, it } from 'vitest'
import { effortLabel, formatEffort, rirToRpe, rpeToRir } from './effort'

describe('effort conversions', () => {
  it('converts RIR to RPE correctly', () => {
    expect(rirToRpe(0)).toBe(10)
    expect(rirToRpe(0.5)).toBe(9.5)
    expect(rirToRpe(1)).toBe(9)
    expect(rirToRpe(2)).toBe(8)
    expect(rirToRpe(3)).toBe(7)
    expect(rirToRpe(4)).toBe(6)
    expect(rirToRpe(null)).toBeNull()
    expect(rirToRpe(undefined)).toBeNull()
  })

  it('converts RPE to RIR correctly', () => {
    expect(rpeToRir(10)).toBe(0)
    expect(rpeToRir(9.5)).toBe(0.5)
    expect(rpeToRir(9)).toBe(1)
    expect(rpeToRir(8)).toBe(2)
    expect(rpeToRir(7)).toBe(3)
    expect(rpeToRir(6)).toBe(4)
    expect(rpeToRir(null)).toBeNull()
    expect(rpeToRir(undefined)).toBeNull()
  })

  it('formats effort labels according to scale', () => {
    expect(effortLabel('rir')).toBe('RIR')
    expect(effortLabel('rpe')).toBe('RPE')
    expect(formatEffort(2, 'rir')).toBe('RIR 2')
    expect(formatEffort(2, 'rpe')).toBe('RPE 8')
    expect(formatEffort(null, 'rir')).toBe('—')
    expect(formatEffort(null, 'rpe')).toBe('—')
  })
})
