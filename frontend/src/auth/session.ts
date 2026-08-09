export const AUTH_API_BASE =
  import.meta.env['VITE_API_BASE'] ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
export const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? ''

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

export function clearAuthState(): void {
  localStorage.removeItem(STORAGE_KEY)
  emit()
  window.dispatchEvent(new Event('tracker-auth-change'))
}

export async function signInWithGoogleCredential(credential: string): Promise<AuthState> {
  if (!AUTH_API_BASE) throw new Error('No backend is configured.')
  const res = await fetch(`${AUTH_API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) throw new Error(`Google sign-in failed: ${res.status}`)
  const state = (await res.json()) as AuthState
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
}
