import { describe, expect, it } from 'vitest'
import { asLocalDate } from '@/domain/date'
import { defaultPhases } from '@/domain/seed'
import { makeLog } from '@/domain/testUtils'
import { allActionsSettled, buildTodayActions } from './todayActions'
import type { DaySchedule, Phase } from '@/domain/types'

const DATE = asLocalDate('2026-08-16')

/*
 * `outcomeFor` reads the schedule from `phase.schedule` for the date, so the
 * fixture writes the same day into the phase that the test passes separately.
 * In the real screen both come from one source; a test where they disagree
 * would be testing a state the app cannot produce.
 */
function phase(day: DaySchedule, overrides: Partial<Phase> = {}): Phase {
  const base = defaultPhases()[0]!
  return {
    ...base,
    calories: 2000, proteinG: 180, steps: 10000, sleepHours: 8,
    schedule: base.schedule.map((d) => (d.dow === day.dow ? { ...day } : d)),
    ...overrides,
  }
}

const gymDay: DaySchedule = { dow: 0, gym: true, sessionType: 'upper', runKm: null, runType: null }
const runDay: DaySchedule = { dow: 0, gym: false, sessionType: 'run', runKm: 5, runType: 'easy' }
const restDay: DaySchedule = { dow: 0, gym: false, sessionType: 'rest', runKm: null, runType: null }

const lane = (actions: ReturnType<typeof buildTodayActions>, name: string) =>
  actions.find((a) => a.lane === name)!

describe('three lanes, never more', () => {
  it('always returns exactly one action per lane', () => {
    const actions = buildTodayActions(phase(gymDay), gymDay, undefined, DATE)

    expect(actions).toHaveLength(3)
    expect(new Set(actions.map((a) => a.lane))).toEqual(
      new Set(['training', 'nutrition', 'movement']),
    )
  })

  it('gives every action a reason and at most one command', () => {
    for (const action of buildTodayActions(phase(gymDay), gymDay, undefined, DATE)) {
      expect(action.reason.length).toBeGreaterThan(0)
      expect(action.title.length).toBeGreaterThan(0)
      if (action.command) expect(action.command.label.length).toBeGreaterThan(0)
    }
  })

  it('sorts unfinished work above finished, without dropping anything', () => {
    const done = makeLog('2026-08-16', {
      gymDone: true, calories: 1950, proteinG: 175, steps: 11000, sleepHours: 8,
    })
    const actions = buildTodayActions(phase(gymDay), gymDay, done, DATE)

    // Completed actions stay on screen rather than disappearing.
    expect(actions).toHaveLength(3)
    expect(allActionsSettled(actions)).toBe(true)
  })
})

describe('training lane', () => {
  it('states a rest day rather than leaving the slot blank', () => {
    const action = lane(buildTodayActions(phase(restDay), restDay, undefined, DATE), 'training')

    expect(action.status).toBe('rest')
    expect(action.title).toBe('Rest day')
    expect(action.command).toBeNull()
  })

  it('offers the workout when a session is scheduled and unlogged', () => {
    const action = lane(buildTodayActions(phase(gymDay), gymDay, undefined, DATE), 'training')

    expect(action.status).toBe('todo')
    expect(action.command).toEqual({ label: 'Open workout', kind: 'workout' })
  })

  it('goes quiet once the session is logged', () => {
    const log = makeLog('2026-08-16', { gymDone: true })
    const action = lane(buildTodayActions(phase(gymDay), gymDay, log, DATE), 'training')

    expect(action.status).toBe('done')
    expect(action.command).toBeNull()
  })

  it('treats a deliberate skip as its own state, not as an omission', () => {
    const log = makeLog('2026-08-16', { gymDone: false })
    const action = lane(buildTodayActions(phase(gymDay), gymDay, log, DATE), 'training')

    expect(action.status).toBe('attention')
    expect(action.title).toBe('Session skipped')
  })

  it('handles a run day', () => {
    const action = lane(buildTodayActions(phase(runDay), runDay, undefined, DATE), 'training')
    expect(action.title).toContain('5 km run')
  })
})

describe('nutrition lane raises only one thing at a time', () => {
  it('flags being over the calorie range', () => {
    const log = makeLog('2026-08-16', { calories: 2400, proteinG: 180 })
    const action = lane(buildTodayActions(phase(restDay), restDay, log, DATE), 'nutrition')

    expect(action.title).toBe('Over your calorie range')
    expect(action.command).toEqual({ label: 'Log food', kind: 'metric', metric: 'calories' })
  })

  it('asks for protein when calories are fine but protein is short', () => {
    const log = makeLog('2026-08-16', { calories: 1950, proteinG: 90 })
    const action = lane(buildTodayActions(phase(restDay), restDay, log, DATE), 'nutrition')

    // 171 floor - 90 logged = 81g remaining.
    expect(action.title).toContain('81g')
    expect(action.command?.kind).toBe('metric')
  })

  it('asks for a log when nothing has been eaten yet', () => {
    const action = lane(buildTodayActions(phase(restDay), restDay, undefined, DATE), 'nutrition')
    expect(action.status).toBe('todo')
  })

  it('goes quiet when both calories and protein are inside target', () => {
    const log = makeLog('2026-08-16', { calories: 1950, proteinG: 175 })
    const action = lane(buildTodayActions(phase(restDay), restDay, log, DATE), 'nutrition')

    expect(action.status).toBe('done')
    expect(action.command).toBeNull()
  })
})

describe('movement lane', () => {
  it('puts a short night ahead of step count', () => {
    const log = makeLog('2026-08-16', { sleepHours: 5, steps: 2000 })
    const action = lane(buildTodayActions(phase(restDay), restDay, log, DATE), 'movement')

    // No number of steps offsets a bad night, so recovery wins the slot.
    expect(action.title).toBe('Keep today easy')
    expect(action.reason).toContain('5h')
  })

  it('gives a walk suggestion when steps are short and sleep was fine', () => {
    const log = makeLog('2026-08-16', { sleepHours: 8, steps: 5200 })
    const action = lane(buildTodayActions(phase(restDay), restDay, log, DATE), 'movement')

    expect(action.title).toBe('Get your steps in')
    expect(action.reason).toMatch(/minute walk/)
  })

  it('asks for a sleep log when steps are met but the night is unrecorded', () => {
    const log = makeLog('2026-08-16', { steps: 11000 })
    const action = lane(buildTodayActions(phase(restDay), restDay, log, DATE), 'movement')

    expect(action.title).toBe('Log last night')
    expect(action.command?.kind).toBe('metric')
  })
})

describe('defensive against missing data', () => {
  it('produces a full set of actions with no log and no schedule at all', () => {
    const actions = buildTodayActions(phase(restDay), undefined, undefined, DATE)

    expect(actions).toHaveLength(3)
    for (const action of actions) {
      expect(action.title).not.toMatch(/NaN|undefined|null/)
      expect(action.reason).not.toMatch(/NaN|undefined|null/)
    }
  })
})
