import { describe, expect, it } from 'vitest'
import { lastSyncCopy, syncHonesty } from './syncState'

describe('syncHonesty', () => {
  it('labels offline, error, pending, and connected without inventing services', () => {
    expect(
      syncHonesty({
        online: false,
        cloudConfigured: true,
        pendingChanges: 0,
        lastError: null,
        lastSyncedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ state: 'offline', label: 'Offline' })

    expect(
      syncHonesty({
        online: true,
        cloudConfigured: true,
        pendingChanges: 0,
        lastError: 'timeout',
        lastSyncedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ state: 'error', label: 'Error' })

    expect(
      syncHonesty({
        online: true,
        cloudConfigured: true,
        pendingChanges: 3,
        lastError: null,
        lastSyncedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ state: 'pending', label: 'Pending' })

    expect(
      syncHonesty({
        online: true,
        cloudConfigured: true,
        pendingChanges: 0,
        lastError: null,
        lastSyncedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ state: 'connected', label: 'Connected' })
  })

  it('does not claim connected when cloud sync is not configured', () => {
    expect(
      syncHonesty({
        online: true,
        cloudConfigured: false,
        pendingChanges: 0,
        lastError: null,
        lastSyncedAt: null,
      }),
    ).toEqual({ state: 'pending', label: 'Pending' })
  })
})

describe('lastSyncCopy', () => {
  it('never prints Invalid Date', () => {
    expect(lastSyncCopy(null)).toBe('Never')
    expect(lastSyncCopy('not-a-date')).toBe('—')
  })
})
