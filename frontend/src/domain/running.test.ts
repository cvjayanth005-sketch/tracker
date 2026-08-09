import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import {
  derivedTargetPaces,
  easyPaceTrend,
  effortBand,
  longRunProgression,
  paceMinPerKm,
  paceProgression,
  volumeRamp,
  weeklyRunVolume,
} from './running'
import { d } from './testUtils'
import type { Run, RunType } from './types'

const STAMP = '2026-01-01T00:00:00.000Z'

function run(
  date: string,
  type: RunType = 'easy',
  distanceKm: number | null = 5,
  durationMin: number | null = 30,
  rpe: number | null = 4,
): Run {
  return {
    id: `${date}-${type}-${distanceKm}-${durationMin}`,
    date: d(date),
    type,
    distanceKm,
    durationMin,
    rpe,
    avgHr: null,
    notes: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

function spacedRuns(
  endDate: string,
  paceSeconds: number,
  offsets: number[],
  type: RunType = 'easy',
): Run[] {
  return offsets.map((offset) => {
    const distance = 5
    return run(
      addDays(d(endDate), offset),
      type,
      distance,
      (paceSeconds * distance) / 60,
      type === 'tempo' ? 7 : 4,
    )
  })
}

describe('paceMinPerKm', () => {
  it('calculates minutes per kilometre', () => {
    expect(paceMinPerKm(5, 27.5)).toBeCloseTo(5.5)
  })

  it.each([
    [null, 30],
    [5, null],
    [0, 30],
    [-2, 30],
    [5, 0],
  ])('returns null for distance %s and duration %s', (distance, duration) => {
    expect(paceMinPerKm(distance, duration)).toBeNull()
  })
})

describe('effortBand', () => {
  it('uses type as the primary signal', () => {
    expect(effortBand('long', null)).toBe('easy')
    expect(effortBand('tempo', null)).toBe('moderate')
    expect(effortBand('intervals', null)).toBe('hard')
  })

  it('lets a clearly contradictory RPE override type', () => {
    expect(effortBand('easy', 9)).toBe('hard')
    expect(effortBand('intervals', 3)).toBe('easy')
  })
})

describe('easyPaceTrend', () => {
  it('skips tempo and interval runs entirely', () => {
    const runs = [
      ...spacedRuns('2026-02-21', 360, [-10, -5, 0]),
      run('2026-02-20', 'tempo', 5, 20, 7),
      run('2026-02-19', 'intervals', 5, 17, 9),
    ]
    const trend = easyPaceTrend(runs, d('2026-02-21'))
    expect(trend.averagePaceMinPerKm).toBeCloseTo(6)
    expect(trend.runs).toBe(3)
  })

  it('excludes an easy run recorded at RPE 9', () => {
    const runs = [
      ...spacedRuns('2026-02-21', 360, [-10, -5, 0]),
      run('2026-02-18', 'easy', 5, 20, 9),
    ]
    expect(easyPaceTrend(runs, d('2026-02-21')).averagePaceMinPerKm).toBeCloseTo(6)
  })

  it('returns insufficient_data below the minimum', () => {
    const trend = easyPaceTrend(spacedRuns('2026-02-21', 360, [-4, 0]), d('2026-02-21'))
    expect(trend.status).toBe('insufficient_data')
    expect(trend.averagePaceMinPerKm).toBeNull()
  })

  it('becomes valid at exactly the minimum', () => {
    const trend = easyPaceTrend(spacedRuns('2026-02-21', 360, [-8, -4, 0]), d('2026-02-21'))
    expect(trend.status).toBe('ok')
    expect(trend.runs).toBe(3)
  })

  it('lets distance-only runs feed volume but not pace', () => {
    const runs = [run('2026-02-21', 'easy', 8, null, 4)]
    expect(easyPaceTrend(runs, d('2026-02-21'), 21, 1).status).toBe('insufficient_data')
    expect(weeklyRunVolume(runs, d('2026-02-21')).totalKm).toBe(8)
  })
})

describe('paceProgression', () => {
  const end = d('2026-02-21')
  const previousOffsets = [-41, -35, -21]
  const currentOffsets = [-20, -10, 0]

  it('uses adjacent non-overlapping 21-day windows', () => {
    const runs = [
      ...spacedRuns('2026-02-21', 360, previousOffsets),
      ...spacedRuns('2026-02-21', 355, currentOffsets),
    ]
    const result = paceProgression(runs, end)
    expect(result.status).toBe('improving')
    expect(result.previous.runs).toBe(3)
    expect(result.current.runs).toBe(3)
  })

  it('treats a 2 s/km change as noise', () => {
    const runs = [
      ...spacedRuns('2026-02-21', 360, previousOffsets),
      ...spacedRuns('2026-02-21', 358, currentOffsets),
    ]
    expect(paceProgression(runs, end).status).toBe('holding')
  })

  it('treats a 5 s/km gain as improving', () => {
    const runs = [
      ...spacedRuns('2026-02-21', 360, previousOffsets),
      ...spacedRuns('2026-02-21', 355, currentOffsets),
    ]
    expect(paceProgression(runs, end).status).toBe('improving')
  })

  it('never lets a fast tempo run make a slow easy run look like regression', () => {
    const easyRuns = [
      ...spacedRuns('2026-02-21', 390, previousOffsets),
      ...spacedRuns('2026-02-21', 390, currentOffsets),
    ]
    const mixed = [...easyRuns, ...spacedRuns('2026-02-21', 240, [-8], 'tempo')]
    expect(paceProgression(mixed, end).status).toBe('holding')
    expect(paceProgression(mixed, end).changeSecondsPerKm).toBeCloseTo(0)
  })
})

describe('volumeRamp', () => {
  const weekly = (weekEnd: string, km: number) => run(weekEnd, 'easy', km, null, 4)
  const end = d('2026-02-21')

  it('allows a ramp at exactly 10 percent', () => {
    const runs = [
      weekly('2026-02-21', 22),
      weekly('2026-02-14', 20),
      weekly('2026-02-07', 20),
      weekly('2026-01-31', 20),
    ]
    expect(volumeRamp(runs, end).status).toBe('ok')
  })

  it('flags a 25 percent ramp', () => {
    const runs = [
      weekly('2026-02-21', 25),
      weekly('2026-02-14', 20),
      weekly('2026-02-07', 20),
      weekly('2026-01-31', 20),
    ]
    expect(volumeRamp(runs, end).status).toBe('ramp_too_fast')
  })

  it('stays quiet with fewer than two measured prior weeks', () => {
    expect(volumeRamp([weekly('2026-02-21', 25), weekly('2026-02-14', 20)], end).status).toBe(
      'insufficient_data',
    )
  })
})

describe('derived targets and long runs', () => {
  it('does not invent target paces from insufficient data', () => {
    const trend = easyPaceTrend([], d('2026-02-21'))
    expect(derivedTargetPaces(trend)).toBeNull()
  })

  it('derives targets from the athlete easy trend', () => {
    const trend = easyPaceTrend(
      spacedRuns('2026-02-21', 360, [-8, -4, 0]),
      d('2026-02-21'),
    )
    expect(derivedTargetPaces(trend)).toEqual({
      easy: 6,
      long: 6 + 10 / 60,
      tempo: 5.25,
      intervals: 4.5,
    })
  })

  it('tracks the longest long run in each week', () => {
    const runs = [
      run('2026-02-07', 'long', 7, null),
      run('2026-02-14', 'long', 8, null),
      run('2026-02-20', 'long', 10, null),
      run('2026-02-21', 'easy', 20, null),
    ]
    const result = longRunProgression(runs, d('2026-02-21'))
    expect(result.status).toBe('building')
    expect(result.weeks.map((week) => week.longestKm)).toEqual([null, 7, 8, 10])
  })
})
