import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { detectWeightAnomaly, JUMP_THRESHOLD_KG } from './weightAnomaly'
import type { DailyLog, LocalDate } from './types'

const TODAY = asLocalDate('2026-08-20')

function log(rawDate: string, over: Partial<DailyLog> = {}): [LocalDate, DailyLog] {
  const date = asLocalDate(rawDate)
  return [
    date,
    {
      date,
      weightKg: null,
      calories: 2000,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      satFatG: null,
      micros: null,
      waterMl: null,
      sodiumMg: 2000,
      alcoholUnits: 0,
      caffeineMg: null,
      ...over,
    } as DailyLog,
  ]
}

function index(entries: Array<[LocalDate, DailyLog]>): Map<LocalDate, DailyLog> {
  return new Map(entries)
}

describe('detectWeightAnomaly', () => {
  it('says nothing when there is no weigh-in today', () => {
    const idx = index([log('2026-08-19', { weightKg: 80 })])
    expect(detectWeightAnomaly(TODAY, idx)).toBeNull()
  })

  it('says nothing without enough prior history to call anything a jump', () => {
    const idx = index([log(TODAY, { weightKg: 85 }), log('2026-08-19', { weightKg: 80 })])
    expect(detectWeightAnomaly(TODAY, idx)).toBeNull()
  })

  it('says nothing for an ordinary day-to-day fluctuation', () => {
    const idx = index([
      log(TODAY, { weightKg: 80.3 }),
      log('2026-08-19', { weightKg: 80.1 }),
      log('2026-08-18', { weightKg: 80.0 }),
      log('2026-08-17', { weightKg: 79.9 }),
    ])
    expect(detectWeightAnomaly(TODAY, idx)).toBeNull()
  })

  it('attributes a jump to alcohol logged in the lookback window', () => {
    const idx = index([
      log(TODAY, { weightKg: 82 }),
      log('2026-08-19', { weightKg: 80, alcoholUnits: 4 }),
      log('2026-08-18', { weightKg: 79.8 }),
      log('2026-08-17', { weightKg: 79.9 }),
      log('2026-08-16', { weightKg: 80.1 }),
    ])
    const result = detectWeightAnomaly(TODAY, idx)
    expect(result?.cause).toBe('alcohol')
    expect(result?.jumpKg).toBeGreaterThanOrEqual(JUMP_THRESHOLD_KG)
  })

  it('attributes a jump to a sodium spike relative to the prior average', () => {
    const idx = index([
      log(TODAY, { weightKg: 82 }),
      log('2026-08-19', { weightKg: 80, sodiumMg: 4500 }),
      log('2026-08-18', { weightKg: 79.8, sodiumMg: 4200 }),
      log('2026-08-17', { weightKg: 79.9, sodiumMg: 4300 }),
      log('2026-08-16', { weightKg: 80.1, sodiumMg: 1900 }),
      log('2026-08-15', { weightKg: 80.0, sodiumMg: 2000 }),
    ])
    const result = detectWeightAnomaly(TODAY, idx)
    expect(result?.cause).toBe('sodium')
  })

  it('flags an unlogged gap when nothing else explains the jump', () => {
    const idx = index([
      log(TODAY, { weightKg: 82 }),
      // 2026-08-19 missing entirely — an unlogged day.
      log('2026-08-18', { weightKg: 79.8 }),
      log('2026-08-17', { weightKg: 79.9 }),
    ])
    const result = detectWeightAnomaly(TODAY, idx)
    expect(result?.cause).toBe('unlogged_gap')
  })

  it('admits it has no explanation when the logs are complete and nothing stands out', () => {
    const idx = index([
      log(TODAY, { weightKg: 82 }),
      log('2026-08-19', { weightKg: 80 }),
      log('2026-08-18', { weightKg: 79.8 }),
      log('2026-08-17', { weightKg: 79.9 }),
    ])
    const result = detectWeightAnomaly(TODAY, idx)
    expect(result?.cause).toBe('small_window')
  })

  it('does not explain a drop using the alcohol/sodium framing meant for gains', () => {
    // A big drop with alcohol logged should not claim "likely water weight
    // gain" framing — the headline still applies (vs. average) but the cause
    // branches should not fire on a negative jump.
    const idx = index([
      log(TODAY, { weightKg: 77 }),
      log('2026-08-19', { weightKg: 80, alcoholUnits: 4 }),
      log('2026-08-18', { weightKg: 79.8 }),
      log('2026-08-17', { weightKg: 79.9 }),
    ])
    const result = detectWeightAnomaly(TODAY, idx)
    expect(result?.cause).not.toBe('alcohol')
  })
})
