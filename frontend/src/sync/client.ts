import { db, ensureLocalAccountOwner, type Tombstone } from '@/db/database'
import { authHeader } from '@/auth/session'

/**
 * Sync is row merge with tombstones, plus a document version check.
 *
 * PUT upserts rows and applies deletes from `tombstones`. The server never
 * drops a row just because this device's export omitted it. If both copies
 * moved since the last shared version, the push is refused (409) rather than
 * silently picking a winner for the same id.
 */

export const API_BASE =
  import.meta.env['VITE_API_BASE'] ??
  (import.meta.env.DEV
    ? 'http://127.0.0.1:8000'
    : typeof window === 'undefined'
      ? ''
      : window.location.origin)

export interface StateDocument {
  version: number
  updatedAt: string
  tables: Record<string, unknown[]>
  tombstones?: Tombstone[]
}

export type SyncOutcome =
  | { status: 'local_only' }
  | { status: 'offline' }
  | { status: 'clean' }
  | { status: 'pushed'; version: number }
  | { status: 'pulled'; version: number }
  | { status: 'unauthorized' }
  | { status: 'conflict'; serverVersion: number; localVersion: number }
  | { status: 'error'; message: string }

const TABLES = [
  'profile',
  'settings',
  'phases',
  'dailyLogs',
  'meals',
  'foods',
  'measurements',
  'exercises',
  'workouts',
  'workoutSets',
  'runs',
  'weeklyCheckIns',
  'onboardingDrafts',
] as const

export async function exportState(): Promise<StateDocument> {
  const meta = await db.syncMeta.get('sync')
  const tables: Record<string, unknown[]> = {}
  for (const name of TABLES) {
    tables[name] = await db.table(name).toArray()
  }
  return {
    version: meta?.localVersion ?? 0,
    updatedAt: new Date().toISOString(),
    tables,
    tombstones: await db.tombstones.toArray(),
  }
}

/** Restore from a file (replace) or from the server (merge rows + tombstones). */
export async function importState(
  doc: StateDocument,
  { source = 'backup' }: { source?: 'backup' | 'server' } = {},
): Promise<void> {
  const previous = await db.syncMeta.get('sync')
  const wasDirty = (previous?.localVersion ?? 0) > (previous?.syncedVersion ?? 0)
  const tables = [...TABLES.map((t) => db.table(t)), db.tombstones, db.syncMeta]
  const tombstones = Array.isArray(doc.tombstones) ? doc.tombstones : []
  await db.transaction('rw', tables, async () => {
    if (source === 'backup') {
      for (const name of TABLES) {
        const rows = doc.tables[name]
        if (!Array.isArray(rows)) continue
        await db.table(name).clear()
        await db.table(name).bulkPut(rows)
      }
      await db.tombstones.clear()
      if (tombstones.length > 0) await db.tombstones.bulkPut(tombstones)
    } else {
      for (const name of TABLES) {
        const rows = doc.tables[name]
        if (!Array.isArray(rows)) continue
        await db.table(name).bulkPut(rows)
      }
      for (const stamp of tombstones) {
        if (!isFactTable(stamp.table) || !stamp.id) continue
        await db.table(stamp.table).delete(stamp.id)
        await db.tombstones.put(stamp)
      }
    }
    await db.syncMeta.put({
      id: 'sync',
      accountUserId: previous?.accountUserId ?? null,
      localVersion:
        source === 'server'
          ? wasDirty
            ? Math.max(doc.version, previous?.localVersion ?? 0) + 1
            : doc.version
          : Math.max(doc.version, previous?.localVersion ?? 0) + 1,
      syncedVersion: source === 'server' ? doc.version : (previous?.syncedVersion ?? 0),
      backedUpVersion:
        source === 'backup' ? doc.version : (previous?.backedUpVersion ?? 0),
      lastSyncedAt:
        source === 'server' ? new Date().toISOString() : (previous?.lastSyncedAt ?? null),
      lastBackupAt:
        source === 'backup' ? new Date().toISOString() : (previous?.lastBackupAt ?? null),
      lastError: null,
    })
  })
}

function isFactTable(name: string): name is (typeof TABLES)[number] {
  return (TABLES as readonly string[]).includes(name)
}

let syncInFlight: Promise<SyncOutcome> | null = null

class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
  }
}

function outcomeForError(error: unknown): SyncOutcome {
  if (error instanceof UnauthorizedError) return { status: 'unauthorized' }
  return { status: 'error', message: error instanceof Error ? error.message : String(error) }
}

export function sync(): Promise<SyncOutcome> {
  if (syncInFlight) return syncInFlight
  syncInFlight = runSync().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function fetchServerVersion(): Promise<number> {
  const head = await fetch(`${API_BASE}/api/state/version`, { headers: authHeader() })
  if (head.status === 401) throw new UnauthorizedError()
  if (!head.ok) throw new Error(`version check failed: ${head.status}`)
  const { version } = (await head.json()) as { version: number }
  return version
}

export async function pullServerState(): Promise<SyncOutcome> {
  if (!API_BASE) return { status: 'local_only' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' }
  try {
    const res = await fetch(`${API_BASE}/api/state`, { headers: authHeader() })
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) throw new Error(`pull failed: ${res.status}`)
    const doc = (await res.json()) as StateDocument
    if (doc.version === 0) return { status: 'clean' }
    await importState(doc, { source: 'server' })
    return { status: 'pulled', version: doc.version }
  } catch (error) {
    const outcome = outcomeForError(error)
    const message =
      outcome.status === 'error' ? outcome.message : 'Session expired. Sign in again.'
    await db.syncMeta.update('sync', { lastError: message })
    return outcome
  }
}

export async function replaceServerState(): Promise<SyncOutcome> {
  if (!API_BASE) return { status: 'local_only' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' }
  try {
    const serverVersion = await fetchServerVersion()
    const meta = await db.syncMeta.get('sync')
    if (!meta) return { status: 'error', message: 'sync metadata missing' }
    const nextVersion = Math.max(meta.localVersion, serverVersion) + 1
    await db.syncMeta.update('sync', { localVersion: nextVersion })
    const doc = await exportState()
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeader() },
      body: JSON.stringify({ ...doc, baseVersion: serverVersion }),
    })
    if (res.status === 401) throw new UnauthorizedError()
    if (res.status === 409) {
      await db.syncMeta.update('sync', {
        lastError: `Sync conflict: server changed while this device was uploading`,
      })
      return { status: 'conflict', serverVersion, localVersion: doc.version }
    }
    if (!res.ok) throw new Error(`push failed: ${res.status}`)
    await db.syncMeta.update('sync', {
      syncedVersion: doc.version,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
    return { status: 'pushed', version: doc.version }
  } catch (error) {
    const outcome = outcomeForError(error)
    const message =
      outcome.status === 'error' ? outcome.message : 'Session expired. Sign in again.'
    await db.syncMeta.update('sync', { lastError: message })
    return outcome
  }
}

export async function bootstrapAccountState(userId: number): Promise<SyncOutcome> {
  await ensureLocalAccountOwner(userId)
  if (!API_BASE) {
    return { status: 'local_only' }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' }

  try {
    const meta = await db.syncMeta.get('sync')
    if (!meta) return { status: 'error', message: 'sync metadata missing' }
    const serverVersion = await fetchServerVersion()

    if (serverVersion === 0) {
      return meta.localVersion > meta.syncedVersion ? sync() : { status: 'clean' }
    }

    if (serverVersion > meta.syncedVersion && meta.localVersion > meta.syncedVersion) {
      await db.syncMeta.update('sync', {
        lastError: `Sync conflict: server ${serverVersion}, device ${meta.localVersion}`,
      })
      return { status: 'conflict', serverVersion, localVersion: meta.localVersion }
    }

    if (serverVersion !== meta.syncedVersion) return pullServerState()
    return meta.localVersion > meta.syncedVersion ? sync() : { status: 'clean' }
  } catch (error) {
    const outcome = outcomeForError(error)
    const message =
      outcome.status === 'error' ? outcome.message : 'Session expired. Sign in again.'
    await db.syncMeta.update('sync', { lastError: message })
    return outcome
  }
}

async function runSync(): Promise<SyncOutcome> {
  if (!API_BASE) return { status: 'local_only' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' }

  const meta = await db.syncMeta.get('sync')
  if (!meta) return { status: 'error', message: 'sync metadata missing' }

  try {
    const serverVersion = await fetchServerVersion()

    // Server ahead of the last version we pushed: another device wrote.
    if (serverVersion > meta.syncedVersion && meta.localVersion === meta.syncedVersion) {
      return pullServerState()
    }

    if (serverVersion > meta.syncedVersion && meta.localVersion > meta.syncedVersion) {
      // Both sides moved. Refuse rather than pick a winner silently.
      await db.syncMeta.update('sync', {
        lastError: `Sync conflict: server ${serverVersion}, device ${meta.localVersion}`,
      })
      return { status: 'conflict', serverVersion, localVersion: meta.localVersion }
    }

    if (meta.localVersion === meta.syncedVersion) return { status: 'clean' }

    const doc = await exportState()
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeader() },
      body: JSON.stringify({ ...doc, baseVersion: meta.syncedVersion }),
    })
    if (res.status === 401) throw new UnauthorizedError()
    if (res.status === 409) {
      await db.syncMeta.update('sync', {
        lastError: `Sync conflict: server changed while this device was uploading`,
      })
      return { status: 'conflict', serverVersion, localVersion: meta.localVersion }
    }
    if (!res.ok) throw new Error(`push failed: ${res.status}`)

    // A local write may land while the request is in flight. Update only the
    // server watermark so a newer localVersion is never rolled back.
    await db.syncMeta.update('sync', {
      syncedVersion: doc.version,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
    return { status: 'pushed', version: doc.version }
  } catch (error) {
    const outcome = outcomeForError(error)
    const message =
      outcome.status === 'error' ? outcome.message : 'Session expired. Sign in again.'
    await db.syncMeta.update('sync', { lastError: message })
    return outcome
  }
}

/**
 * Browser storage is evictable, so a manual export is the durability floor
 * until the server exists. Downloads the whole document as JSON.
 *
 * A download advances only the backup watermark. It must never claim that the
 * server accepted data it has not seen.
 */
export async function downloadBackup(): Promise<void> {
  const doc = await exportState()
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)

  const meta = await db.syncMeta.get('sync')
  if (meta) {
    await db.syncMeta.update('sync', {
      backedUpVersion: doc.version,
      lastBackupAt: new Date().toISOString(),
    })
  }
}

/** Debounced background sync; manual sync uses the same guarded protocol. */
let syncTimer: number | undefined
export function scheduleSync(delayMs = 1500): void {
  if (!API_BASE || typeof window === 'undefined') return
  if (syncTimer !== undefined) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = undefined
    void sync()
  }, delayMs)
}

/** Ask the browser not to evict us. Best-effort; Safari often declines. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
