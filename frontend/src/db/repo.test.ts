import { describe, expect, it } from 'vitest'
import { defaultPhases } from '@/domain/seed'
import { asLocalDate } from '@/domain/date'
import { resolvePhaseForDate } from './repo'

describe('phase history resolution', () => {
  it('keeps pre-transition history in phase one when its start is open-ended', () => {
    const phases = defaultPhases()
    const first = phases[0]
    const second = phases[1]
    if (!first || !second) throw new Error('phase fixture is incomplete')
    first.endedOn = asLocalDate('2026-08-10')
    second.startedOn = asLocalDate('2026-08-10')

    expect(resolvePhaseForDate(phases, asLocalDate('2026-08-09'))?.id).toBe(first.id)
  })

  it('treats the transition day as the first day of the new phase', () => {
    const phases = defaultPhases()
    const first = phases[0]
    const second = phases[1]
    if (!first || !second) throw new Error('phase fixture is incomplete')
    first.endedOn = asLocalDate('2026-08-10')
    second.startedOn = asLocalDate('2026-08-10')

    expect(resolvePhaseForDate(phases, asLocalDate('2026-08-10'))?.id).toBe(second.id)
  })
})
