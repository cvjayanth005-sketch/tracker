import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The version gate that used to block a push whenever both sides had moved is
 * gone — the server merges row-level changes regardless of version drift, so
 * the client should always attempt the push rather than refuse locally. These
 * tests exercise that against a real Dexie database (fake-indexeddb) so the
 * reconciliation-after-push logic is proven against actual table writes, not
 * just its own return value.
 */

const DB_NAME = 'fat-loss-ledger'

async function freshDb() {
  await Dexie.delete(DB_NAME)
  const mod = await import('@/db/database')
  if (mod.db.isOpen()) mod.db.close()
  await mod.db.open()
  return mod.db
}

function mockFetchSequence(responses: Array<{ status: number; body?: unknown }>) {
  let call = 0
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses[Math.min(call, responses.length - 1)]!
    call += 1
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      json: async () => next.body,
    } as Response
  })
}

function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  vi.resetModules()
  // Node's built-in `navigator` (no jsdom here) has no `onLine` property, so
  // the client's offline guard (`!navigator.onLine`) reads as offline by
  // default and every sync call would short-circuit before touching fetch.
  // `authHeader()` reads `localStorage`, which Node has no global for either.
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('localStorage', fakeLocalStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('runSync', () => {
  it('pushes even when both the server and this device have moved past the last synced version', async () => {
    const db = await freshDb()
    await db.syncMeta.put({
      id: 'sync',
      accountUserId: 1,
      localVersion: 5,
      syncedVersion: 3,
      backedUpVersion: 0,
      lastSyncedAt: null,
      lastBackupAt: null,
      lastError: null,
    })
    await db.dailyLogs.put({ date: '2026-08-20', weightKg: 82.1 } as never)

    // Server reports a HIGHER version than this device last synced — the old
    // code refused outright here. It should now push straight through.
    const fetchMock = mockFetchSequence([
      { status: 200, body: { version: 9 } }, // GET /api/state/version
      {
        status: 200,
        body: {
          version: 10,
          updatedAt: '2026-08-20T00:00:00.000Z',
          tables: { dailyLogs: [{ date: '2026-08-20', weightKg: 82.1 }] },
          tombstones: [],
        },
      }, // PUT /api/state
    ])
    vi.stubGlobal('fetch', fetchMock)

    const { sync } = await import('./client')
    const outcome = await sync()

    expect(outcome).toEqual({ status: 'pushed', version: 10 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putCall = fetchMock.mock.calls[1]!
    expect(putCall[1]?.method).toBe('PUT')
  })

  it('applies the merged response to local tables, not just the version counter', async () => {
    const db = await freshDb()
    await db.syncMeta.put({
      id: 'sync',
      accountUserId: 1,
      localVersion: 2,
      syncedVersion: 1,
      backedUpVersion: 0,
      lastSyncedAt: null,
      lastBackupAt: null,
      lastError: null,
    })

    // The response includes a row this device never had locally — contributed
    // by another device in the same server-side merge.
    const fetchMock = mockFetchSequence([
      { status: 200, body: { version: 1 } },
      {
        status: 200,
        body: {
          version: 4,
          updatedAt: '2026-08-20T00:00:00.000Z',
          tables: {
            dailyLogs: [
              { date: '2026-08-19', weightKg: 81.5 }, // from another device
            ],
          },
          tombstones: [],
        },
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const { sync } = await import('./client')
    await sync()

    const row = await db.dailyLogs.get('2026-08-19' as never)
    expect(row?.weightKg).toBe(81.5)

    const meta = await db.syncMeta.get('sync')
    expect(meta?.syncedVersion).toBe(4)
    expect(meta?.localVersion).toBe(4)
    expect(meta?.lastError).toBeNull()
  })

  it('never rolls localVersion backward below a write that landed mid-request', async () => {
    const db = await freshDb()
    await db.syncMeta.put({
      id: 'sync',
      accountUserId: 1,
      localVersion: 2,
      syncedVersion: 1,
      backedUpVersion: 0,
      lastSyncedAt: null,
      lastBackupAt: null,
      lastError: null,
    })

    // The PUT response resolves to version 4, but a local write races ahead
    // to localVersion 9 (as if it landed while the request was in flight) —
    // simulated by bumping it from inside the mocked PUT handler, since that
    // is the earliest point after which a real concurrent write could occur.
    let putCalled = false
    const fetchMock = vi.fn(async () => {
      if (!putCalled) {
        putCalled = true
        return { status: 200, ok: true, json: async () => ({ version: 1 }) } as Response
      }
      await db.syncMeta.update('sync', { localVersion: 9 })
      return {
        status: 200,
        ok: true,
        json: async () => ({
          version: 4,
          updatedAt: '2026-08-20T00:00:00.000Z',
          tables: {},
          tombstones: [],
        }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const { sync } = await import('./client')
    await sync()

    const meta = await db.syncMeta.get('sync')
    // syncedVersion follows the server exactly; localVersion must not regress
    // below the write that landed mid-flight.
    expect(meta?.syncedVersion).toBe(4)
    expect(meta?.localVersion).toBe(9)
  })
})
