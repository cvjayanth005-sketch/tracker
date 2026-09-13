import { useEffect, useState } from 'react'
import { playTimerComplete, playTimerTick } from '@/lib/sound'

export interface RestTimerState {
  isActive: boolean
  isPaused: boolean
  remainingSec: number
  totalSec: number
  exerciseName: string | null
  endTimestamp: number | null
}

type Listener = (state: RestTimerState) => void

let currentState: RestTimerState = {
  isActive: false,
  isPaused: false,
  remainingSec: 0,
  totalSec: 90,
  exerciseName: null,
  endTimestamp: null,
}

const STORAGE_KEY = 'formara-rest-timer'

function readPersistedState(): RestTimerState {
  if (typeof window === 'undefined') return currentState
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return currentState
    const saved = JSON.parse(raw) as Partial<RestTimerState>
    if (!saved.isActive) return currentState
    if (!saved.isPaused && (!saved.endTimestamp || saved.endTimestamp <= Date.now())) return currentState
    return { ...currentState, ...saved }
  } catch { return currentState }
}

currentState = readPersistedState()

const listeners = new Set<Listener>()
let intervalId: number | null = null

function emit() {
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState)) } catch { /* unavailable */ }
  }
  for (const listener of listeners) {
    listener({ ...currentState })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const next = JSON.parse(event.newValue) as RestTimerState
      if (typeof next.isActive !== 'boolean') return
      currentState = next
      if (currentState.isActive) startTicker()
      else stopTicker()
      for (const listener of listeners) listener({ ...currentState })
    } catch { /* ignore malformed cross-tab state */ }
  })
}

function tick() {
  if (!currentState.isActive || currentState.isPaused || !currentState.endTimestamp) return

  const now = Date.now()
  const remaining = Math.max(0, Math.ceil((currentState.endTimestamp - now) / 1000))

  if (remaining !== currentState.remainingSec) {
    // Sound cues on last 3 seconds
    if (remaining > 0 && remaining <= 3 && remaining < currentState.remainingSec) {
      playTimerTick()
    }

    currentState.remainingSec = remaining
    emit()

    if (remaining === 0) {
      playTimerComplete()
      stopTimer()
      // Desktop notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Rest over 💪', {
            body: currentState.exerciseName ? `Time for your next set of ${currentState.exerciseName}!` : 'Time for your next set.',
            icon: '/favicon.ico',
          })
        } catch {
          // Notification best effort
        }
      }
    }
  }
}

function startTicker() {
  if (intervalId === null && typeof window !== 'undefined') {
    intervalId = window.setInterval(tick, 250)
  }
}

function stopTicker() {
  if (intervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(intervalId)
    intervalId = null
  }
}

export const restTimerController = {
  start(seconds: number = 90, exerciseName?: string) {
    const sec = Math.max(5, seconds)
    const end = Date.now() + sec * 1000
    currentState = {
      isActive: true,
      isPaused: false,
      remainingSec: sec,
      totalSec: sec,
      exerciseName: exerciseName ?? null,
      endTimestamp: end,
    }
    startTicker()
    emit()

    // Request notification permission opportunistically on user action
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  },

  addSeconds(delta: number) {
    if (!currentState.isActive || !currentState.endTimestamp) return
    const newRemaining = Math.max(5, currentState.remainingSec + delta)
    const newTotal = Math.max(newRemaining, currentState.totalSec + (delta > 0 ? delta : 0))
    currentState.remainingSec = newRemaining
    currentState.totalSec = newTotal
    currentState.endTimestamp = Date.now() + newRemaining * 1000
    emit()
  },

  pause() {
    if (!currentState.isActive || currentState.isPaused) return
    currentState.isPaused = true
    currentState.endTimestamp = null
    emit()
  },

  resume() {
    if (!currentState.isActive || !currentState.isPaused) return
    currentState.isPaused = false
    currentState.endTimestamp = Date.now() + currentState.remainingSec * 1000
    startTicker()
    emit()
  },

  skip() {
    stopTimer()
  },
}

function stopTimer() {
  currentState = {
    ...currentState,
    isActive: false,
    isPaused: false,
    remainingSec: 0,
    endTimestamp: null,
  }
  stopTicker()
  emit()
}

export function useRestTimer(): RestTimerState & typeof restTimerController {
  const [state, setState] = useState<RestTimerState>(currentState)

  useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])

  return {
    ...state,
    ...restTimerController,
  }
}
