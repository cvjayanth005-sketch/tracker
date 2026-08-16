import { parseGoogleRedirectHash } from '@/auth/googleSignIn'
import { clearLocalTrackerData, ensureLocalAccountOwner, ensureSeeded } from '@/db/database'

export const AUTH_API_BASE =
  import.meta.env['VITE_API_BASE'] ??
  (import.meta.env.DEV
    ? 'http://127.0.0.1:8000'
    : typeof window === 'undefined'
      ? ''
      : window.location.origin)
const GOOGLE_CLIENT_ID_FALLBACK = import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? ''

const STORAGE_KEY = 'tracker.auth.v1'

export interface AuthUser {
  id: number
  email: string
  name: string | null
  picture: string | null
}

export interface AuthSession {
  token: string
  expiresAt: string
}

export interface AuthState {
  user: AuthUser
  session: AuthSession
}

type Listener = () => void

const listeners = new Set<Listener>()
let configInFlight: Promise<string> | null = null

export function getAuthState(): AuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthState
    if (Date.parse(parsed.session.expiresAt) <= Date.now()) {
      clearAuthState()
      return null
    }
    return parsed
  } catch {
    clearAuthState()
    return null
  }
}

export function authHeader(): Record<string, string> {
  const state = getAuthState()
  return state ? { Authorization: `Bearer ${state.session.token}` } : {}
}

export function getGoogleClientId(): Promise<string> {
  // The OAuth client ID is a public, build-time constant. When it is baked in at
  // build (VITE_GOOGLE_CLIENT_ID), skip the backend `/api/config` round-trip
  // entirely so the sign-in button appears instantly and does not wait on a
  // cold-started backend.
  if (GOOGLE_CLIENT_ID_FALLBACK) return Promise.resolve(GOOGLE_CLIENT_ID_FALLBACK)
  if (configInFlight) return configInFlight
  configInFlight = fetchGoogleClientId().catch(() => GOOGLE_CLIENT_ID_FALLBACK)
  return configInFlight
}

async function fetchGoogleClientId(): Promise<string> {
  if (!AUTH_API_BASE && import.meta.env.DEV) return GOOGLE_CLIENT_ID_FALLBACK
  const res = await fetch(`${AUTH_API_BASE}/api/config`)
  if (!res.ok) return GOOGLE_CLIENT_ID_FALLBACK
  const payload = (await res.json()) as { googleClientId?: unknown }
  return typeof payload.googleClientId === 'string' && payload.googleClientId
    ? payload.googleClientId
    : GOOGLE_CLIENT_ID_FALLBACK
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit() {
  listeners.forEach((listener) => listener())
}

function setAuthState(state: AuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  emit()
  window.dispatchEvent(new Event('tracker-auth-change'))
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === 'string' && payload.detail) return new Error(payload.detail)
  } catch {
    // Some proxy and server failures return HTML instead of JSON.
  }
  return new Error(`${fallback} (${response.status})`)
}

export function clearAuthState(): void {
  localStorage.removeItem(STORAGE_KEY)
  emit()
  window.dispatchEvent(new Event('tracker-auth-change'))
}

const REDIRECT_ERROR_KEY = 'tracker.google_error'

export function takeGoogleRedirectError(): string | null {
  try {
    const message = sessionStorage.getItem(REDIRECT_ERROR_KEY)
    if (message) sessionStorage.removeItem(REDIRECT_ERROR_KEY)
    return message
  } catch {
    return null
  }
}

function rememberGoogleRedirectError(message: string): void {
  try {
    sessionStorage.setItem(REDIRECT_ERROR_KEY, message)
  } catch {
    // Private mode can block sessionStorage; Welcome still has a sign-in button.
  }
}

export async function consumeGoogleRedirectSession(): Promise<void> {
  if (typeof window === 'undefined') return
  const parsed = parseGoogleRedirectHash(window.location.hash)
  if (!parsed) return
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  if (parsed.error) {
    rememberGoogleRedirectError(parsed.error)
    return
  }
  if (!parsed.token) return
  try {
    const res = await fetch(`${AUTH_API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${parsed.token}` },
    })
    if (!res.ok) throw await apiError(res, 'Google sign-in failed')
    const payload = (await res.json()) as { user: AuthUser }
    const previous = getAuthState()
    if (!previous || previous.user.id !== payload.user.id) {
      await ensureLocalAccountOwner(payload.user.id)
    }
    const expiresAt =
      parsed.expires && Date.parse(parsed.expires) > Date.now()
        ? parsed.expires
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setAuthState({
      user: payload.user,
      session: { token: parsed.token, expiresAt },
    })
  } catch (error) {
    rememberGoogleRedirectError(error instanceof Error ? error.message : 'Google sign-in failed.')
  }
}

export async function signInWithGoogleCredential(credential: string): Promise<AuthState> {
  const previous = getAuthState()
  const res = await fetch(`${AUTH_API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) throw await apiError(res, 'Google sign-in failed')
  const state = (await res.json()) as AuthState
  if (!previous || previous.user.id !== state.user.id) await ensureLocalAccountOwner(state.user.id)
  setAuthState(state)
  return state
}

export async function signOut(): Promise<void> {
  if (AUTH_API_BASE) {
    await fetch(`${AUTH_API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: authHeader(),
    }).catch(() => undefined)
  }
  clearAuthState()
  await clearLocalTrackerData()
  await ensureSeeded()
}
