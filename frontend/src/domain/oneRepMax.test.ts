import { describe, expect, it } from 'vitest'
import { estimateOneRepMax } from './oneRepMax'

describe('estimateOneRepMax', () => {
  it('calculates Epley and rejects unreliable high-rep estimates', () => {
    expect(estimateOneRepMax(100, 5)).toBe(116.7)
    expect(estimateOneRepMax(100, 5, 'brzycki')).toBe(112.5)
    expect(estimateOneRepMax(100, 13)).toBeNull()
  })
})
