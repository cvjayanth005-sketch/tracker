import { describe, expect, it } from 'vitest'
import { googleLoginUri, parseGoogleRedirectHash, prefersRedirectSignIn } from './googleSignIn'

describe('prefersRedirectSignIn', () => {
  it('keeps desktop mouse users on the popup', () => {
    expect(
      prefersRedirectSignIn({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        pointerCoarse: false,
        hoverHover: true,
        narrow: false,
        standalone: false,
      }),
    ).toBe(false)
  })

  it('uses redirect on phones, installed PWAs, and in-app browsers', () => {
    expect(
      prefersRedirectSignIn({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        pointerCoarse: true,
        hoverHover: false,
        narrow: true,
        standalone: false,
      }),
    ).toBe(true)
    expect(
      prefersRedirectSignIn({
        userAgent: 'Mozilla/5.0',
        pointerCoarse: false,
        hoverHover: true,
        narrow: false,
        standalone: true,
      }),
    ).toBe(true)
    expect(
      prefersRedirectSignIn({
        userAgent: 'Mozilla/5.0 Instagram 123.0',
        pointerCoarse: true,
        hoverHover: false,
        narrow: true,
        standalone: false,
      }),
    ).toBe(true)
  })
})

describe('googleLoginUri', () => {
  it('posts to the API when the app is served from the same origin', () => {
    expect(googleLoginUri('https://tracker.onrender.com', 'https://tracker.onrender.com')).toBe(
      'https://tracker.onrender.com/api/auth/google',
    )
  })

  it('stays on the frontend origin for a Vercel + Render split', () => {
    expect(
      googleLoginUri('https://tracker-weld-omega.vercel.app', 'https://tracker.onrender.com'),
    ).toBe('https://tracker-weld-omega.vercel.app/api/google-login')
  })
})

describe('parseGoogleRedirectHash', () => {
  it('reads a successful Google redirect', () => {
    expect(
      parseGoogleRedirectHash('#google_session=abc%2Fdef&expires=2099-01-01T00%3A00%3A00%2B00%3A00'),
    ).toEqual({
      token: 'abc/def',
      expires: '2099-01-01T00:00:00+00:00',
    })
  })

  it('reads a Google redirect error and ignores unrelated hashes', () => {
    expect(parseGoogleRedirectHash('#google_error=Sign-in%20was%20blocked.')).toEqual({
      error: 'Sign-in was blocked.',
    })
    expect(parseGoogleRedirectHash('#tab=today')).toBeNull()
  })
})
