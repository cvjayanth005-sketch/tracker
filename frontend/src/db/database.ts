import Dexie, { type EntityTable } from 'dexie'
import { defaultExercises, defaultPhases, defaultProfile, defaultSettings } from '@/domain/seed'
import type {
  AiNote,
  BodyMeasurement,
  DailyLog,
  Exercise,
  Meal,
  Phase,
  Run,
  SavedFood,
  Settings,
  UserProfile,
  WeeklyCheckIn,
  Workout,
  WorkoutSet,
} from '@/domain/types'

/**
 * Local store. IndexedDB is the working source of truth — every write lands
 * here first and the UI reads only from here, so the app is fully usable with
 * no network. Durability beyond the browser is the sync layer's job.
 */

export interface SyncMeta {
  id: 'sync'
  /** Google account that owns the current local document. */
  accountUserId: number | null
  /** Monotonic document version, bumped on every local write batch. */
  localVersion: number
  /** Version last confirmed accepted by the server. */
  syncedVersion: number
  /** Version last included in a downloaded JSON backup. */
  backedUpVersion: number
  lastSyncedAt: string | null
  lastBackupAt: string | null
  lastError: string | null
}

export class TrackerDb extends Dexie {
  profile!: EntityTable<UserProfile, 'id'>
  settings!: EntityTable<Settings, 'id'>
  phases!: EntityTable<Phase, 'id'>
  dailyLogs!: EntityTable<DailyLog, 'date'>
  meals!: EntityTable<Meal, 'id'>
  foods!: EntityTable<SavedFood, 'id'>
  measurements!: EntityTable<BodyMeasurement, 'date'>
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutSets!: EntityTable<WorkoutSet, 'id'>
  runs!: EntityTable<Run, 'id'>
  weeklyCheckIns!: EntityTable<WeeklyCheckIn, 'id'>
  aiNotes!: EntityTable<AiNote, 'hash'>
  syncMeta!: EntityTable<SyncMeta, 'id'>

  constructor() {
    super('fat-loss-ledger')
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      phases: 'id, order',
      // Keyed by local calendar date: upsert-by-date falls out of the schema.
      dailyLogs: 'date',
      measurements: 'date',
      exercises: 'id, sessionType, order',
      workouts: 'id, date',
      workoutSets: 'id, workoutId, exerciseId',
      runs: 'id, date',
      aiNotes: 'hash, createdAt',
      syncMeta: 'id',
    })
    this.version(2)
      .stores({ syncMeta: 'id' })
      .upgrade(async (tx) => {
        const table = tx.table<SyncMeta, 'id'>('syncMeta')
        await table.toCollection().modify((meta) => {
          // Older builds used syncedVersion for both server sync and downloads.
          // Preserve it only as the backup watermark. Server sync was not wired
          // in those builds, so its confirmation must be established afresh.
          meta.backedUpVersion = meta.syncedVersion
          meta.lastBackupAt = meta.lastSyncedAt
          meta.syncedVersion = 0
          meta.lastSyncedAt = null
        })
      })
    this.version(3)
      .stores({ runs: 'id, date, type' })
      .upgrade(async (tx) => {
        const stamp = new Date().toISOString()
        await tx.table<Run, 'id'>('runs').toCollection().modify((run) => {
          run.type ??= 'easy'
          run.rpe ??= null
          run.createdAt ??= stamp
          run.updatedAt ??= stamp
        })
        await tx.table<Phase, 'id'>('phases').toCollection().modify((phase) => {
          phase.schedule = phase.schedule.map((day) => ({
            ...day,
            runType:
              day.runType ??
              (day.dow === 0 ? 'long' : phase.order >= 3 && day.dow === 3 ? 'tempo' : 'easy'),
          }))
          phase.weeklyRunKmTarget ??= phase.schedule.reduce(
            (sum, day) => sum + (day.runKm ?? 0),
            0,
          )
        })
      })
    this.version(4)
      .stores({ settings: 'id' })
      .upgrade(async (tx) => {
        const settings = tx.table<Settings, 'id'>('settings')
        await settings.toCollection().modify((row) => {
          row.planStartDate ??= null
          row.onboardingCompleted ??= false
        })
      })
    this.version(5)
      .stores({ syncMeta: 'id' })
      .upgrade(async (tx) => {
        const table = tx.table<SyncMeta, 'id'>('syncMeta')
        await table.toCollection().modify((meta) => {
          meta.accountUserId ??= null
        })
      })
    // Per-meal food logging. The new `meals` table holds itemized meals; the
    // extra macro columns on dailyLogs are the rolled-up daily totals so older
    // single-number food entries keep working.
    this.version(6)
      .stores({ meals: 'id, date, slot' })
      .upgrade(async (tx) => {
        await tx.table<DailyLog, 'date'>('dailyLogs').toCollection().modify((log) => {
          log.carbsG ??= null
          log.fatG ??= null
          log.fiberG ??= null
        })
      })
    this.version(7)
      .stores({ dailyLogs: 'date', workouts: 'id, date' })
      .upgrade(async (tx) => {
        await tx.table<DailyLog, 'date'>('dailyLogs').toCollection().modify((log) => {
          log.waterMl ??= null
          log.sodiumMg ??= null
          log.alcoholUnits ??= null
          log.caffeineMg ??= null
          log.stress ??= null
          log.trainingMinutesAvailable ??= null
          log.trainingConstraints ??= null
        })
        await tx.table<Workout, 'id'>('workouts').toCollection().modify((workout) => {
          workout.prescription ??= null
        })
      })
    // Hydration and the other cheap intake proxies (sodium, alcohol, caffeine)
    // the coach uses to explain weight fluctuations without a wearable.
    this.version(8).upgrade(async (tx) => {
      await tx.table<DailyLog, 'date'>('dailyLogs').toCollection().modify((log) => {
        log.waterMl ??= null
        log.sodiumMg ??= null
        log.alcoholUnits ??= null
        log.caffeineMg ??= null
      })
    })
    this.version(9).stores({ weeklyCheckIns: 'id, weekStart' })
    // Saved-food library: reusable dishes logged with one tap so repeats read
    // identically. Indexed by name and recency for the recent/favourite lists.
    this.version(10).stores({ foods: 'id, name, lastUsedAt' })
  }
}

export const db = new TrackerDb()

const SEEDED_TABLES = [
  db.profile,
  db.settings,
  db.phases,
  db.dailyLogs,
  db.meals,
  db.foods,
  db.measurements,
  db.exercises,
  db.workouts,
  db.workoutSets,
  db.runs,
  db.weeklyCheckIns,
  db.aiNotes,
  db.syncMeta,
] as const

export async function clearLocalTrackerData(): Promise<void> {
  await db.transaction('rw', SEEDED_TABLES, async () => {
    for (const table of SEEDED_TABLES) await table.clear()
  })
}

/** Idempotent: safe to call on every app start. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction(
    'rw',
    [db.profile, db.settings, db.phases, db.exercises, db.syncMeta],
    async () => {
      if ((await db.settings.count()) === 0) {
        await db.settings.put(defaultSettings())
      }
      if ((await db.profile.count()) === 0) {
        await db.profile.put(defaultProfile())
      }
      if ((await db.phases.count()) === 0) {
        const phases = defaultPhases()
        // Phase 1 starts active; the rest wait for a manual advance.
        const first = phases[0]
        if (first) first.startedOn = null
        await db.phases.bulkPut(phases)
      }
      if ((await db.exercises.count()) === 0) {
        await db.exercises.bulkPut(defaultExercises())
      }
      if ((await db.syncMeta.count()) === 0) {
        await db.syncMeta.put({
          id: 'sync',
          accountUserId: null,
          localVersion: 0,
          syncedVersion: 0,
          backedUpVersion: 0,
          lastSyncedAt: null,
          lastBackupAt: null,
          lastError: null,
        })
      }
    },
  )
}

/** Bump the local document version so the sync layer knows there is new work. */
export async function markDirty(): Promise<void> {
  const meta = await db.syncMeta.get('sync')
  if (!meta) return
  await db.syncMeta.put({ ...meta, localVersion: meta.localVersion + 1 })
}

export async function setLocalAccountOwner(userId: number | null): Promise<void> {
  const meta = await db.syncMeta.get('sync')
  if (!meta) return
  await db.syncMeta.put({ ...meta, accountUserId: userId, lastError: null })
}

export async function ensureLocalAccountOwner(userId: number): Promise<'kept' | 'reset'> {
  await ensureSeeded()
  const meta = await db.syncMeta.get('sync')
  if (meta?.accountUserId === userId) return 'kept'
  await clearLocalTrackerData()
  await ensureSeeded()
  await setLocalAccountOwner(userId)
  return 'reset'
}
