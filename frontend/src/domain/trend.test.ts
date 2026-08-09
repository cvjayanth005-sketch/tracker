import { describe, expect, it } from 'vitest'
import {
  consecutivePlateauWeeks,
  daysHeldBelow,
  indexLogs,
  trailingAverageWeight,
  trendSeries,
  weeklyChange,
  windowAverage,
  windowTotal,
} from './trend'
import { d, logsFromWeights, makeLog, repeat } from './testUtils'

const MIN = 4

describe('trailingAverageWeight', () => {
  it('averages the non-null readings in the window', () => {
    const index = indexLogs(logsFromWeights('2026-01-05', [88, 88, 88, 88, 88, 88, 88]))
    const t = trailingAverageWeight(index, d('2026-01-11'), MIN)
    expect(t.status).toBe('ok')
    expect(t.averageKg).toBeCloseTo(88, 6)
    expect(t.readings).toBe(7)
  })

  it('skips missing weights instead of treating them as zero', () => {
    const index = indexLogs(
      logsFromWeights('2026-01-05', [80, null, 82, null, 84, 86, null]),
    )
    const t = trailingAverageWeight(index, d('2026-01-11'), MIN)
    // Mean of 80, 82, 84, 86 — NOT (80+0+82+0+84+86+0)/7 = 47.4
    expect(t.averageKg).toBeCloseTo(83, 6)
    expect(t.readings).toBe(4)
  })

  it('reports insufficient_data rather than a small-sample average', () => {
    const index = indexLogs(logsFromWeights('2026-01-05', [88, null, null, 87, null, null, null]))
    const t = trailingAverageWeight(index, d('2026-01-11'), MIN)
    expect(t.status).toBe('insufficient_data')
    expect(t.averageKg).toBeNull()
    expect(t.readings).toBe(2)
    expect(t.required).toBe(MIN)
  })

  it('flips to ok at exactly the minimum reading count', () => {
    const index = indexLogs(
      logsFromWeights('2026-01-05', [88, 88, 88, 88, null, null, null]),
    )
    expect(trailingAverageWeight(index, d('2026-01-11'), 4).status).toBe('ok')
    expect(trailingAverageWeight(index, d('2026-01-11'), 5).status).toBe(
      'insufficient_data',
    )
  })

  it('includes the 7th day back and excludes the 8th', () => {
    const index = indexLogs(
      // 8 days: the first (2026-01-04) must fall outside a window ending 01-11.
      logsFromWeights('2026-01-04', [50, 88, 88, 88, 88, 88, 88, 88]),
    )
    const t = trailingAverageWeight(index, d('2026-01-11'), MIN)
    expect(t.readings).toBe(7)
    expect(t.averageKg).toBeCloseTo(88, 6) // the 50 kg outlier is out of range
  })
})

describe('weeklyChange', () => {
  it('compares non-overlapping windows: days 1-7 against days 8-14', () => {
    const index = indexLogs(
      logsFromWeights('2026-01-05', [...repeat(88, 7), ...repeat(87.4, 7)]),
    )
    const change = weeklyChange(index, d('2026-01-18'), MIN)
    expect(change.status).toBe('ok')
    expect(change.current.averageKg).toBeCloseTo(87.4, 6)
    expect(change.previous.averageKg).toBeCloseTo(88, 6)
    // Positive means losing.
    expect(change.lossKgPerWeek).toBeCloseTo(0.6, 6)
  })

  it('reports a gain as a negative loss rate', () => {
    const index = indexLogs(
      logsFromWeights('2026-01-05', [...repeat(87, 7), ...repeat(87.5, 7)]),
    )
    expect(weeklyChange(index, d('2026-01-18'), MIN).lossKgPerWeek).toBeCloseTo(-0.5, 6)
  })

  it('is insufficient when only the recent week has data', () => {
    const index = indexLogs(logsFromWeights('2026-01-12', repeat(88, 7)))
    const change = weeklyChange(index, d('2026-01-18'), MIN)
    expect(change.status).toBe('insufficient_data')
    expect(change.lossKgPerWeek).toBeNull()
    expect(change.current.status).toBe('ok')
    expect(change.previous.status).toBe('insufficient_data')
  })

  it('is not fooled by a single noisy morning', () => {
    // Same true weight throughout, one 1.5 kg water spike on the last day.
    const flat = repeat(88, 13)
    const index = indexLogs(logsFromWeights('2026-01-05', [...flat, 89.5]))
    const change = weeklyChange(index, d('2026-01-18'), MIN)
    // Raw day-to-day would read +1.5 kg; the trend barely moves.
    expect(change.lossKgPerWeek).toBeCloseTo(-1.5 / 7, 6)
  })
})

describe('consecutivePlateauWeeks', () => {
  it('counts backwards while weeks stay under the threshold', () => {
    const index = indexLogs(logsFromWeights('2026-01-05', repeat(88, 28)))
    expect(consecutivePlateauWeeks(index, d('2026-02-01'), MIN, 0.3)).toBe(3)
  })

  it('stops at the first week that cleared the threshold', () => {
    const index = indexLogs(
      logsFromWeights('2026-01-05', [
        ...repeat(89, 7), // week 1
        ...repeat(88, 7), // week 2: lost 1.0 — clears the threshold
        ...repeat(88, 7), // week 3: flat
        ...repeat(88, 7), // week 4: flat
      ]),
    )
    expect(consecutivePlateauWeeks(index, d('2026-02-01'), MIN, 0.3)).toBe(2)
  })

  it('does not count weeks it cannot measure', () => {
    // Only two weeks of data: one comparison is possible, no more.
    const index = indexLogs(logsFromWeights('2026-01-05', repeat(88, 14)))
    expect(consecutivePlateauWeeks(index, d('2026-01-18'), MIN, 0.3)).toBe(1)
  })
})

describe('daysHeldBelow', () => {
  it('counts consecutive days whose trend sat at or below the threshold', () => {
    const index = indexLogs(logsFromWeights('2026-01-05', repeat(83, 14)))
    // Windows stay measurable back to 2026-01-08 (4 readings), so 11 days.
    expect(daysHeldBelow(index, d('2026-01-18'), 84, MIN)).toBe(11)
  })

  it('returns 0 while the trend is still above target', () => {
    const index = indexLogs(logsFromWeights('2026-01-05', repeat(85, 14)))
    expect(daysHeldBelow(index, d('2026-01-18'), 84, MIN)).toBe(0)
  })

  it('breaks the streak on a day it cannot measure', () => {
    const index = indexLogs(logsFromWeights('2026-01-12', repeat(83, 7)))
    // Only the last day has a full window of 4+ readings.
    expect(daysHeldBelow(index, d('2026-01-18'), 84, MIN)).toBe(4)
  })
})

describe('trendSeries', () => {
  it('emits a point per day, with gaps preserved as nulls', () => {
    const index = indexLogs(
      logsFromWeights('2026-01-05', [88, null, 87.8, 87.9, 87.7, 87.6, 87.5]),
    )
    const series = trendSeries(index, d('2026-01-05'), d('2026-01-11'), MIN)
    expect(series).toHaveLength(7)
    expect(series[1]?.rawKg).toBeNull()
    expect(series[0]?.trendKg).toBeNull() // only 1 reading, below the minimum
    expect(series[6]?.trendKg).not.toBeNull()
  })
})

describe('window aggregates', () => {
  const logs = [
    makeLog('2026-01-09', { steps: 12000, runKm: 2 }),
    makeLog('2026-01-10', { steps: null, runKm: 0 }),
    makeLog('2026-01-11', { steps: 8000, runKm: 5 }),
  ]

  it('averages only known values', () => {
    const { average, readings } = windowAverage(
      indexLogs(logs),
      d('2026-01-11'),
      (l) => l.steps,
    )
    expect(average).toBe(10000)
    expect(readings).toBe(2)
  })

  it('sums known values, counting a logged zero as real', () => {
    const { total, readings } = windowTotal(
      indexLogs(logs),
      d('2026-01-11'),
      (l) => l.runKm,
    )
    expect(total).toBe(7)
    expect(readings).toBe(3)
  })
})
