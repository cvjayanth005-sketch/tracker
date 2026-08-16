const IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line\/|Twitter|WhatsApp|Snapchat|TikTok|wv\)/i

export function prefersRedirectSignIn(input?: {
  userAgent?: string
  pointerCoarse?: boolean
  hoverHover?: boolean
  narrow?: boolean
  standalone?: boolean
}): boolean {
  const userAgent = input?.userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const pointerCoarse =
    input?.pointerCoarse ??
    (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
  const hoverHover =
    input?.hoverHover ??
    (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches)
  const narrow =
    input?.narrow ?? (typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  const standalone =
    input?.standalone ??
    (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches)

  if (standalone) return true
  if (IN_APP_BROWSER.test(userAgent)) return true
  if (pointerCoarse && !hoverHover) return true
  if (narrow) return true
  return false
}

export function googleLoginUri(
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  apiBase = '',
): string {
  const api = apiBase.replace(/\/$/, '')
  if (!api || api === origin) return `${origin}/api/auth/google`
  return `${origin}/api/google-login`
}

export function parseGoogleRedirectHash(hash: string): {
  token?: string
  expires?: string
  error?: string
} | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const token = params.get('google_session')
  const expires = params.get('expires')
  const error = params.get('google_error')
  if (!token && !error) return null
  return {
    ...(token ? { token } : {}),
    ...(expires ? { expires } : {}),
    ...(error ? { error } : {}),
  }
}
