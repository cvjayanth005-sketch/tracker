import { useEffect, useRef, useState } from 'react'
import { getGoogleClientId, signInWithGoogleCredential } from '@/auth/session'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void
          }) => void
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
          prompt: (momentListener?: (notification: {
            isNotDisplayed: () => boolean
            isSkippedMoment: () => boolean
            isDismissedMoment: () => boolean
            getNotDisplayedReason: () => string
            getSkippedReason: () => string
          }) => void) => void
        }
      }
    }
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
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

type Phase = 'idle' | 'prompting' | 'signing'

export function GoogleSlideSignIn({
  onStatus,
}: {
  onStatus?: (status: string | null) => void
}) {
  const googleHostRef = useRef<HTMLDivElement | null>(null)
  const onStatusRef = useRef(onStatus)
  const phaseRef = useRef<Phase>('idle')

  const [phase, setPhase] = useState<Phase>('idle')
  const [ready, setReady] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')

  onStatusRef.current = onStatus

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

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
    if (!googleClientId || !googleHostRef.current) return

    const scriptId = 'google-identity-services'
    const host = googleHostRef.current

    const render = () => {
      if (!window.google || !host) return
      host.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential) {
            setPhaseBoth('idle')
            onStatusRef.current?.('Sign-in was cancelled.')
            return
          }
          setPhaseBoth('signing')
          onStatusRef.current?.('Signing in...')
          void signInWithGoogleCredential(response.credential)
            .then(() => onStatusRef.current?.('Signed in. Syncing backup...'))
            .catch((error) => {
              setPhaseBoth('idle')
              onStatusRef.current?.(error instanceof Error ? error.message : String(error))
            })
        },
      })
      window.google.accounts.id.renderButton(host, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
      })
      setReady(true)
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = render
      document.head.appendChild(script)
    } else {
      render()
    }
  }, [googleClientId])

  const triggerGoogle = () => {
    if (phaseRef.current === 'prompting' || phaseRef.current === 'signing') return
    if (!ready) {
      onStatusRef.current?.('Google sign-in is not ready yet.')
      return
    }
    if (!window.google?.accounts.id.prompt) {
      onStatusRef.current?.('Google sign-in is not ready yet. Try again.')
      setPhaseBoth('idle')
      return
    }

    setPhaseBoth('prompting')
    onStatusRef.current?.('Opening Google...')
    window.google.accounts.id.prompt((notification) => {
      if (notification.isDismissedMoment()) {
        setPhaseBoth('idle')
        onStatusRef.current?.('Sign-in dismissed.')
        return
      }

      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap unavailable — fall back to the trusted GIS button.
        const host = googleHostRef.current
        const button =
          host?.querySelector<HTMLElement>('div[role="button"]') ??
          host?.querySelector<HTMLElement>('div[tabindex]') ??
          (host?.firstElementChild as HTMLElement | null)

        if (host) {
          host.className = 'mt-3 flex justify-center'
          host.removeAttribute('aria-hidden')
          host.style.cssText = ''
        }

        if (button) {
          button.click()
          onStatusRef.current?.('Continue with Google below.')
          return
        }

        const reason =
          (notification.isNotDisplayed() && notification.getNotDisplayedReason()) ||
          (notification.isSkippedMoment() && notification.getSkippedReason()) ||
          'unavailable'
        onStatusRef.current?.(`Google sign-in unavailable (${reason}).`)
        setPhaseBoth('idle')
      }
    })
  }

  const busy = phase === 'prompting' || phase === 'signing'

  return (
    <div className="relative mt-4">
      <button
        type="button"
        aria-label="Sign in with Google"
        disabled={!ready || busy}
        onClick={triggerGoogle}
        className="group relative flex min-h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-ink-50 px-4 text-sm font-semibold text-ink-950 shadow-[0_18px_42px_-24px_rgba(255,255,255,0.65)] ring-1 ring-inset ring-white/90 transition-[transform,background,box-shadow] active:scale-[0.985] disabled:cursor-wait disabled:opacity-70"
      >
        <span className="absolute inset-x-0 top-0 h-px bg-white" aria-hidden="true" />
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
          <GoogleMark />
        </span>
        <span>{phase === 'signing' ? 'Signing in...' : busy ? 'Opening Google...' : 'Continue with Google'}</span>
      </button>

      {/*
        GIS stays in the DOM so browser trust rules can fall back to the
        official button when One Tap is unavailable. Keep it hidden until then.
      */}
      <div
        ref={googleHostRef}
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
