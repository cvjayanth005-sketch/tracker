export const config = {
  runtime: 'edge',
}

function cookieValue(header: string | null, name: string): string {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return ''
}

function redirectHome(origin: string, hash: string): Response {
  return Response.redirect(`${origin}/#${hash}`, 303)
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.method !== 'POST') {
    return Response.redirect(`${url.origin}/`, 303)
  }

  const apiBase = (process.env.VITE_API_BASE || process.env.API_BASE || '').replace(/\/$/, '')
  if (!apiBase) {
    return redirectHome(url.origin, `google_error=${encodeURIComponent('API is not configured.')}`)
  }

  let credential = ''
  try {
    const form = await request.formData()
    credential = String(form.get('credential') || '')
    const csrfBody = String(form.get('g_csrf_token') || '')
    const csrfCookie = decodeURIComponent(cookieValue(request.headers.get('cookie'), 'g_csrf_token'))
    if (!credential || !csrfBody || csrfBody !== csrfCookie) {
      return redirectHome(
        url.origin,
        `google_error=${encodeURIComponent('Sign-in was blocked. Refresh and try again.')}`,
      )
    }
  } catch {
    return redirectHome(url.origin, `google_error=${encodeURIComponent('Google sign-in failed.')}`)
  }

  const res = await fetch(`${apiBase}/api/auth/google`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': request.headers.get('x-forwarded-for') || '',
    },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) {
    let detail = 'Google sign-in failed.'
    try {
      const payload = (await res.json()) as { detail?: unknown }
      if (typeof payload.detail === 'string' && payload.detail) detail = payload.detail
    } catch {
      // Proxy and cold-start failures often return HTML instead of JSON.
    }
    return redirectHome(url.origin, `google_error=${encodeURIComponent(detail)}`)
  }

  const payload = (await res.json()) as {
    session?: { token?: string; expiresAt?: string }
  }
  const token = payload.session?.token
  const expires = payload.session?.expiresAt || ''
  if (!token) {
    return redirectHome(url.origin, `google_error=${encodeURIComponent('Google sign-in failed.')}`)
  }
  return redirectHome(
    url.origin,
    `google_session=${encodeURIComponent(token)}&expires=${encodeURIComponent(expires)}`,
  )
}
