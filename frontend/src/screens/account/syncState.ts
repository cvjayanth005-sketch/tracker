export type SyncHonesty = 'connected' | 'pending' | 'offline' | 'error'

export function syncHonesty(input: {
  online: boolean
  cloudConfigured: boolean
  pendingChanges: number
  lastError: string | null | undefined
  lastSyncedAt: string | null | undefined
}): { state: SyncHonesty; label: string } {
  if (!input.online) return { state: 'offline', label: 'Offline' }
  if (input.lastError) return { state: 'error', label: 'Error' }
  if (!input.cloudConfigured) return { state: 'pending', label: 'Pending' }
  if (input.pendingChanges > 0) return { state: 'pending', label: 'Pending' }
  if (input.lastSyncedAt) return { state: 'connected', label: 'Connected' }
  return { state: 'pending', label: 'Pending' }
}

export function lastSyncCopy(lastSyncedAt: string | null | undefined): string {
  if (!lastSyncedAt) return 'Never'
  const parsed = Date.parse(lastSyncedAt)
  if (Number.isNaN(parsed)) return '—'
  return new Date(parsed).toLocaleString()
}
