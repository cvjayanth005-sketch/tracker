import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseWakeLockOptions {
  enabled?: boolean
}

export interface UseWakeLockResult {
  isSupported: boolean
  isActive: boolean
  error: Error | null
  request: () => Promise<boolean>
  release: () => Promise<void>
}

/**
 * Screen Wake Lock hook — keeps the mobile/desktop display awake during an active workout session.
 * Automatically re-acquires the lock on document `visibilitychange` when returning to the tab.
 */
export function useWakeLock(options: UseWakeLockOptions = {}): UseWakeLockResult {
  const { enabled = false } = options
  const isSupported = typeof window !== 'undefined' && 'wakeLock' in navigator
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const sentinelRef = useRef<WakeLockSentinel | null>(null)
  const wantedRef = useRef(enabled)

  wantedRef.current = enabled

  const request = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false
    if (sentinelRef.current) return true
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false

    try {
      const sentinel = await navigator.wakeLock.request('screen')
      sentinelRef.current = sentinel
      setIsActive(true)
      setError(null)

      sentinel.addEventListener('release', () => {
        sentinelRef.current = null
        setIsActive(false)
      })

      return true
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      setIsActive(false)
      return false
    }
  }, [isSupported])

  const release = useCallback(async (): Promise<void> => {
    if (!sentinelRef.current) return
    try {
      await sentinelRef.current.release()
    } catch {
      // Ignore release errors
    } finally {
      sentinelRef.current = null
      setIsActive(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupported) return

    if (enabled) {
      void request()
    } else {
      void release()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wantedRef.current && !sentinelRef.current) {
        void request()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void release()
    }
  }, [enabled, isSupported, request, release])

  return {
    isSupported,
    isActive,
    error,
    request,
    release,
  }
}
