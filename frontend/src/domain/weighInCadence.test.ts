import { describe, expect, it } from 'vitest'
import { asLocalDate } from './date'
import { makeLog } from './testUtils'
import { getWeighInCadence } from './weighInCadence'

const TODAY = asLocalDate('2026-08-15')

describe('getWeighInCadence', () => {
  it('asks for the first reading immediately', () => {
    expect(getWeighInCadence(TODAY, [])).toMatchObject({ due: true, daysUntilNext: 0 })
  })

  it('waits three days after a reading before asking again', () => {
    const cadence = getWeighInCadence(TODAY, [makeLog('2026-08-14', { weightKg: 82 })])
    expect(cadence).toMatchObject({ due: false, daysUntilNext: 2, nextWeighInDate: '2026-08-17' })
  })

  it('becomes due again after the third day without creating a backlog', () => {
    const cadence = getWeighInCadence(TODAY, [makeLog('2026-08-12', { weightKg: 82 })])
    expect(cadence).toMatchObject({ due: true, daysUntilNext: 0, nextWeighInDate: '2026-08-15' })
  })
})
