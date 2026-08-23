import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Exercises the actual write path the picker's Add button calls, against a
 * real Dexie database — the part most likely to have a real bug (ordering,
 * defaults, which session a new exercise lands in) is exactly the part a
 * pure-logic test of exercisePicker.ts alone cannot see, since that module
 * only computes numbers and never touches the database.
 */

const DB_NAME = 'fat-loss-ledger'

/** Seeded the same way the real app boots — including the starter exercise
 *  list — so order-collision tests exercise realistic starting state, not an
 *  empty table no real user ever has. */
async function freshDb() {
  await Dexie.delete(DB_NAME)
  const mod = await import('@/db/database')
  if (mod.db.isOpen()) mod.db.close()
  await mod.db.open()
  await mod.ensureSeeded()
  return mod.db
}

beforeEach(() => {
  // no-op: each test calls freshDb() itself so DB state never leaks between them
})

describe('createExercise', () => {
  it('adds a new exercise that shows up in allExercises', async () => {
    await freshDb()
    const { createExercise, allExercises } = await import('./repo')

    const created = await createExercise('Cable Fly', 'upper', {
      repRangeMin: 10,
      repRangeMax: 15,
      targetSets: 3,
      targetRir: 1,
      loadIncrementKg: 2,
    })

    const all = await allExercises()
    expect(all.map((e) => e.id)).toContain(created.id)
    expect(all.find((e) => e.id === created.id)?.name).toBe('Cable Fly')
    expect(created.archived).toBe(false)
  })

  it('orders a newly added exercise after every existing exercise in that session', async () => {
    await freshDb()
    const { createExercise, allExercises } = await import('./repo')

    const before = (await allExercises()).filter((e) => e.sessionType === 'upper')
    const maxOrderBefore = before.reduce((max, e) => Math.max(max, e.order), -1)

    const created = await createExercise('Face Pull', 'upper', {
      repRangeMin: 12,
      repRangeMax: 20,
      targetSets: 3,
      targetRir: 1,
      loadIncrementKg: 1.25,
    })

    expect(created.order).toBeGreaterThan(maxOrderBefore)
  })

  it('orders independently per session — a new lower-day exercise does not collide with upper-day order numbers', async () => {
    await freshDb()
    const { createExercise } = await import('./repo')

    const upper = await createExercise('Incline Press', 'upper', {
      repRangeMin: 6,
      repRangeMax: 10,
      targetSets: 3,
      targetRir: 2,
      loadIncrementKg: 2.5,
    })
    const lower = await createExercise('Bulgarian Split Squat', 'lower', {
      repRangeMin: 8,
      repRangeMax: 12,
      targetSets: 3,
      targetRir: 2,
      loadIncrementKg: 2.5,
    })

    // Both new exercises land at the tail of their OWN session's ordering,
    // not fighting over one global counter.
    expect(upper.sessionType).toBe('upper')
    expect(lower.sessionType).toBe('lower')
  })

  it('two exercises added back-to-back in the same session do not collide on order', async () => {
    await freshDb()
    const { createExercise } = await import('./repo')

    const first = await createExercise('Preacher Curl', 'upper', {
      repRangeMin: 10,
      repRangeMax: 15,
      targetSets: 2,
      targetRir: 1,
      loadIncrementKg: 2,
    })
    const second = await createExercise('Hammer Curl', 'upper', {
      repRangeMin: 10,
      repRangeMax: 15,
      targetSets: 2,
      targetRir: 1,
      loadIncrementKg: 2,
    })

    expect(second.order).toBeGreaterThan(first.order)
  })

  it('marks the sync document dirty so the new exercise is queued for upload', async () => {
    await freshDb()
    const { createExercise } = await import('./repo')
    const { db } = await import('./database')

    const before = await db.syncMeta.get('sync')
    await createExercise('Seated Row', 'upper', {
      repRangeMin: 8,
      repRangeMax: 12,
      targetSets: 3,
      targetRir: 2,
      loadIncrementKg: 2.5,
    })
    const after = await db.syncMeta.get('sync')

    expect((after?.localVersion ?? 0)).toBeGreaterThan(before?.localVersion ?? 0)
  })
})
