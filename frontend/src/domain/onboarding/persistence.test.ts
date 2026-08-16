import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { asLocalDate } from '@/domain/date'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Migration and persistence tests for the onboarding draft.
 *
 * The v18 upgrade adds an object store and nothing else, so "no data loss" is
 * really a claim about Dexie leaving untouched tables alone. That is worth
 * proving rather than assuming: a schema call that accidentally re-declared an
 * existing store with different indexes would silently drop its contents, and
 * this is the only place that would catch it.
 */

const DB_NAME = 'fat-loss-ledger'

/** A v17 database populated the way a real user's would be, then upgraded. */
async function seedLegacyDatabase(): Promise<void> {
  const legacy = new Dexie(DB_NAME)
  // Mirrors the shape of the schema as it stood at v17.
  legacy.version(17).stores({
    profile: 'id',
    settings: 'id',
    phases: 'id, order',
    dailyLogs: 'date',
    meals: 'id, date, slot',
    foods: 'id, name, lastUsedAt',
    measurements: 'date',
    exercises: 'id, sessionType, order',
    workouts: 'id, date',
    workoutSets: 'id, workoutId, exerciseId',
    runs: 'id, date, type',
    weeklyCheckIns: 'id, weekStart',
    aiNotes: 'hash, createdAt',
    tombstones: '[table+id], table, deletedAt',
    syncMeta: 'id',
  })
  await legacy.open()
  await legacy.table('profile').put({
    id: 'me', name: 'Existing User', heightCm: 180, birthYear: 1990,
    startWeightKg: 92, goalWeightKg: 80, updatedAt: '2026-01-01T00:00:00.000Z',
  })
  await legacy.table('settings').put({
    id: 'settings', timezone: 'Asia/Kolkata', planStartDate: '2026-01-01',
    onboardingCompleted: true, calorieFloor: 1700, minReadingsPerWindow: 4,
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  await legacy.table('dailyLogs').put({ date: '2026-01-05', weightKg: 90.4, calories: 1950 })
  await legacy.table('dailyLogs').put({ date: '2026-01-06', weightKg: 90.1, calories: 2010 })
  await legacy.table('phases').put({ id: 'phase-1', order: 1, name: 'Phase 1', calories: 2000 })
  legacy.close()
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
  // Reset the module registry so `db` re-opens against the fresh database.
  const { db } = await import('@/db/database')
  if (db.isOpen()) db.close()
})

describe('v18 onboarding draft migration', () => {
  it('preserves every existing record when the new store is added', async () => {
    await seedLegacyDatabase()

    const { db } = await import('@/db/database')
    if (db.isOpen()) db.close()
    await db.open()

    expect(db.verno).toBeGreaterThanOrEqual(18)
    // Nothing from the old database may be lost by adding a table.
    const profile = await db.profile.get('me')
    expect(profile?.name).toBe('Existing User')
    expect(profile?.startWeightKg).toBe(92)
    const settings = await db.settings.get('settings')
    expect(settings?.calorieFloor).toBe(1700)
    expect(settings?.onboardingCompleted).toBe(true)
    expect(await db.dailyLogs.count()).toBe(2)
    expect((await db.dailyLogs.get(asLocalDate('2026-01-05')))?.weightKg).toBe(90.4)
    expect(await db.phases.count()).toBe(1)
  })

  it('leaves an upgraded account with no draft rather than inventing one', async () => {
    await seedLegacyDatabase()
    const { db } = await import('@/db/database')
    if (db.isOpen()) db.close()
    await db.open()

    // An existing user already finished onboarding; fabricating a draft would
    // make the app think they had an interview in progress.
    expect(await db.onboardingDrafts.count()).toBe(0)
  })
})

describe('draft persistence and resume', () => {
  it('creates a draft on first use with every answer null', async () => {
    const { ensureOnboardingDraft } = await import('@/db/repo')
    const draft = await ensureOnboardingDraft('Asia/Kolkata')

    expect(draft.id).toBe('me')
    expect(draft.version).toBe(1)
    expect(draft.about.heightCm).toBeNull()
    expect(draft.about.timezone).toBe('Asia/Kolkata')
    expect(draft.training.equipmentIds).toEqual([])
    expect(draft.proposal).toBeNull()
  })

  it('is idempotent, so a reopened interview does not wipe answers', async () => {
    const { ensureOnboardingDraft, saveOnboardingChapter } = await import('@/db/repo')
    await ensureOnboardingDraft()
    await saveOnboardingChapter('about', { heightCm: 180 })

    const again = await ensureOnboardingDraft()
    expect(again.about.heightCm).toBe(180)
  })

  it('merges a chapter patch without disturbing other chapters', async () => {
    const { saveOnboardingChapter } = await import('@/db/repo')
    await saveOnboardingChapter('about', { heightCm: 180, currentWeightKg: 90 })
    const after = await saveOnboardingChapter('goals', { primaryGoal: 'fat_loss' })

    expect(after.about.heightCm).toBe(180)
    expect(after.about.currentWeightKg).toBe(90)
    expect(after.goals.primaryGoal).toBe('fat_loss')
  })

  it('recomputes completion from the answers rather than trusting a flag', async () => {
    const { saveOnboardingChapter } = await import('@/db/repo')
    let draft = await saveOnboardingChapter('about', {
      heightCm: 180, currentWeightKg: 90, birthYear: 1995, calculationSex: 'male',
    })
    expect(draft.completedChapters).toEqual(['about'])

    // Removing an answer must un-complete the chapter.
    draft = await saveOnboardingChapter('about', { currentWeightKg: null })
    expect(draft.completedChapters).toEqual([])
  })

  it('stores the resume position so the interview reopens where it stopped', async () => {
    const { saveOnboardingChapter, getOnboardingDraft } = await import('@/db/repo')
    await saveOnboardingChapter('about', {
      heightCm: 180, currentWeightKg: 90, birthYear: 1995, calculationSex: 'male',
    })

    const reloaded = await getOnboardingDraft()
    expect(reloaded?.resume.chapter).toBe('activity')
    expect(reloaded?.resume.questionKey).toBe('activityLevel')
  })

  it('bumps the sync version so a draft reaches other devices', async () => {
    const { db } = await import('@/db/database')
    await db.open()
    await db.syncMeta.put({
      id: 'sync', accountUserId: 1, localVersion: 0, syncedVersion: 0,
      backedUpVersion: 0, lastSyncedAt: null, lastBackupAt: null, lastError: null,
    })
    const { saveOnboardingChapter } = await import('@/db/repo')
    await saveOnboardingChapter('about', { heightCm: 180 })

    const meta = await db.syncMeta.get('sync')
    expect(meta!.localVersion).toBeGreaterThan(0)
  })
})
