import { useEffect, useRef, useState } from 'react'
import { googleLoginUri, prefersRedirectSignIn } from '@/auth/googleSignIn'
import { AUTH_API_BASE, getGoogleClientId, signInWithGoogleCredential } from '@/auth/session'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void
            ux_mode?: 'popup' | 'redirect'
            login_uri?: string
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
            use_fedcm_for_prompt?: boolean
            itp_support?: boolean
          }) => void
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const GIS_SCRIPT_ID = 'google-identity-services'

let gisClientId: string | null = null
let gisUxMode: 'popup' | 'redirect' | null = null
let credentialListener: ((credential: string) => void) | null = null

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google sign-in failed to load.')), { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = GIS_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google sign-in failed to load.'))
    document.head.appendChild(script)
  })
}

function ensureGisInitialized(clientId: string): void {
  if (!window.google?.accounts?.id) return
  const uxMode = prefersRedirectSignIn() ? 'redirect' : 'popup'
  if (gisClientId === clientId && gisUxMode === uxMode) return
  window.google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: uxMode,
    login_uri: googleLoginUri(window.location.origin, AUTH_API_BASE),
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: false,
    itp_support: true,
    callback: (response) => {
      if (!response.credential) return
      credentialListener?.(response.credential)
    },
  })
  gisClientId = clientId
  gisUxMode = uxMode
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 11.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function GoogleSlideSignIn({
  onStatus,
}: {
  onStatus?: (status: string | null) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const onStatusRef = useRef(onStatus)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [redirectMode, setRedirectMode] = useState(false)

  onStatusRef.current = onStatus

  useEffect(() => {
    if (AUTH_API_BASE) {
      void fetch(`${AUTH_API_BASE}/api/health`, { cache: 'no-store' }).catch(() => {})
    }
    void loadGisScript().catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    void getGoogleClientId().then((clientId) => {
      if (!active) return
      setGoogleClientId(clientId)
      if (!clientId) onStatusRef.current?.('Google sign-in is not configured.')
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    credentialListener = (credential) => {
      setSigning(true)
      onStatusRef.current?.('Signing in...')
      void signInWithGoogleCredential(credential)
        .then(() => onStatusRef.current?.('Signed in. Syncing backup...'))
        .catch((error) => {
          setSigning(false)
          onStatusRef.current?.(error instanceof Error ? error.message : String(error))
        })
    }
    return () => {
      credentialListener = null
    }
  }, [])

  useEffect(() => {
    if (!googleClientId) return
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let lastWidth = 0

    const renderButton = () => {
      if (cancelled || !window.google || !hostRef.current) return
      const node = hostRef.current
      const width = Math.min(400, Math.max(200, Math.floor(node.clientWidth) || 320))
      if (width === lastWidth && node.childElementCount > 0) return
      lastWidth = width
      ensureGisInitialized(googleClientId)
      node.innerHTML = ''
      window.google.accounts.id.renderButton(node, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width,
      })
      setRedirectMode(prefersRedirectSignIn())
      setReady(true)
    }

    void loadGisScript()
      .then(() => {
        if (cancelled) return
        setLoadError(null)
        renderButton()
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setLoadError(message)
        onStatusRef.current?.(message)
      })

    const observer = new ResizeObserver(() => renderButton())
    observer.observe(host)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [googleClientId])

  if (googleClientId === null) {
    return (
      <div className="mt-4 h-12 animate-pulse rounded-full bg-white/8 ring-1 ring-inset ring-white/10" />
    )
  }

  if (!googleClientId) {
    return (
      <div className="mt-4 rounded-2xl bg-warn/10 px-3 py-3 text-[12px] leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
        Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the backend.
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div
        className={`group relative h-12 w-full cursor-pointer ${signing ? 'pointer-events-none' : ''}`}
      >
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-full bg-ink-50 shadow-[0_18px_42px_-22px_rgba(255,255,255,0.8)] ring-1 ring-inset ring-white/90 transition-[transform,filter] duration-150 ease-out group-hover:brightness-[0.97] group-active:scale-[0.985]"
        >
          <span className="absolute inset-x-4 top-0 h-px bg-white/90" aria-hidden="true" />
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
            <GoogleMark />
          </span>
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink-950">
            {signing ? 'Signing in...' : ready ? 'Continue with Google' : 'Loading Google...'}
          </span>
        </div>
        <div
          ref={hostRef}
          aria-label="Sign in with Google"
          className="absolute inset-0 z-0 overflow-hidden rounded-full [&_div]:!h-full [&_div]:!w-full [&_iframe]:!h-full [&_iframe]:!min-h-full [&_iframe]:!w-full [&_iframe]:!min-w-full"
        />
      </div>
      {redirectMode ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-400">
          This device will open Google in this tab, then return here signed in.
        </p>
      ) : null}
      {loadError ? <p className="mt-2 text-[12px] text-alert">{loadError}</p> : null}
    </div>
  )
}
