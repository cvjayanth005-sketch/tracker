import { useEffect, useRef, useState } from 'react'
import { getGoogleClientId, signInWithGoogleCredential } from '@/auth/session'

const THRESHOLD = 0.85
const THUMB = 40
const PAD = 4

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

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Phase = 'idle' | 'dragging' | 'snapping' | 'armed' | 'signing'

export function GoogleSlideSignIn({
  onStatus,
}: {
  onStatus?: (status: string | null) => void
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLButtonElement | null>(null)
  const googleHostRef = useRef<HTMLDivElement | null>(null)
  const onStatusRef = useRef(onStatus)
  const offsetRef = useRef(0)
  const grabXRef = useRef(0)
  const maxRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')

  const [offset, setOffset] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ready, setReady] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')

  onStatusRef.current = onStatus

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const setOffsetBoth = (next: number) => {
    offsetRef.current = next
    setOffset(next)
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
            setOffsetBoth(0)
            onStatusRef.current?.('Sign-in was cancelled.')
            return
          }
          setPhaseBoth('signing')
          onStatusRef.current?.('Signing in...')
          void signInWithGoogleCredential(response.credential)
            .then(() => onStatusRef.current?.('Signed in. Syncing backup...'))
            .catch((error) => {
              setPhaseBoth('idle')
              setOffsetBoth(0)
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
    if (!window.google?.accounts.id.prompt) {
      onStatusRef.current?.('Google sign-in is not ready yet. Try again.')
      setPhaseBoth('idle')
      setOffsetBoth(0)
      return
    }

    window.google.accounts.id.prompt((notification) => {
      if (notification.isDismissedMoment()) {
        setPhaseBoth('idle')
        setOffsetBoth(0)
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
          host.className = 'mt-3'
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
        setOffsetBoth(0)
      }
    })
  }

  const measureMax = () => {
    const track = trackRef.current
    if (!track) return 0
    return Math.max(0, track.clientWidth - THUMB - PAD * 2)
  }

  const complete = () => {
    const max = measureMax()
    maxRef.current = max
    setOffsetBoth(max)
    setPhaseBoth('armed')
    onStatusRef.current?.('Opening Google...')
    // Must stay synchronous with the pointer/keyboard gesture — a timeout
    // breaks the user-activation chain and Google will ignore the click.
    triggerGoogle()
  }

  const activateWithoutSlide = () => {
    if (phaseRef.current === 'signing' || phaseRef.current === 'armed') return
    if (!ready) {
      onStatusRef.current?.('Google sign-in is not ready yet.')
      return
    }
    complete()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current === 'signing' || phaseRef.current === 'armed') return
    if (!ready) return

    if (prefersReducedMotion()) {
      activateWithoutSlide()
      return
    }

    const thumb = thumbRef.current
    if (!thumb) return

    // Interrupt any snap-back mid-flight from the live presentation value.
    const style = getComputedStyle(thumb)
    const matrix = new DOMMatrixReadOnly(style.transform)
    const live = Number.isFinite(matrix.m41) ? matrix.m41 : offsetRef.current
    setOffsetBoth(Math.max(0, live))
    setPhaseBoth('dragging')

    maxRef.current = measureMax()
    grabXRef.current = event.clientX - offsetRef.current
    thumb.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== 'dragging') return
    const next = Math.min(maxRef.current, Math.max(0, event.clientX - grabXRef.current))
    setOffsetBoth(next)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== 'dragging') return
    const thumb = thumbRef.current
    if (thumb?.hasPointerCapture(event.pointerId)) {
      thumb.releasePointerCapture(event.pointerId)
    }

    const max = maxRef.current || measureMax()
    if (max > 0 && offsetRef.current / max >= THRESHOLD) {
      complete()
      return
    }

    setPhaseBoth('snapping')
    setOffsetBoth(0)
  }

  const busy = phase === 'armed' || phase === 'signing'
  const progress = maxRef.current > 0 ? offset / maxRef.current : 0
  const labelOpacity = Math.max(0, 1 - progress * 1.35)

  return (
    <div className="relative mt-4">
      <div
        ref={trackRef}
        className="relative h-12 w-full select-none overflow-hidden rounded-full bg-[#1f1f1f] ring-1 ring-inset ring-white/10"
        role="group"
        aria-label="Sign in with Google"
      >
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-12 text-[13px] font-medium tracking-[-0.01em] text-white/90"
          style={{ opacity: labelOpacity }}
        >
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </div>

        {/* Fill trail behind the thumb */}
        <div
          className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-white/8"
          style={{ width: `${offset + THUMB}px` }}
          aria-hidden="true"
        />

        <button
          ref={thumbRef}
          type="button"
          aria-label="Slide to sign in with Google"
          disabled={!ready || busy}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              activateWithoutSlide()
            }
          }}
          onClick={() => {
            // Tap / reduced-motion path when the user doesn't drag.
            if (phaseRef.current === 'idle' || phaseRef.current === 'snapping') {
              if (prefersReducedMotion()) activateWithoutSlide()
            }
          }}
          className={`absolute top-1 left-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.65)] ring-1 ring-black/5 touch-none ${
            !ready || busy ? 'cursor-wait opacity-80' : 'cursor-grab active:cursor-grabbing'
          } ${phase === 'dragging' ? '' : 'transition-transform duration-[400ms] ease-[cubic-bezier(.2,.9,.2,1)]'}`}
          style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        >
          <GoogleMark />
        </button>
      </div>

      {/*
        GIS must stay in the DOM so we can click its trusted button after the
        slide completes. Keep it visually hidden but not display:none.
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
