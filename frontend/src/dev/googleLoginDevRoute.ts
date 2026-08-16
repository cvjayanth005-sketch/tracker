import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Dev-server stand-in for the `/api/google-login` Vercel edge function.
 *
 * Redirect sign-in posts a form straight from Google to that path. On a
 * deployment the edge function answers it, but Vite serves only static assets
 * and the SPA, so locally the browser lands on a 404 immediately after a
 * successful Google sign-in — the credential is thrown away at the last step.
 *
 * This mirrors the deployed function closely enough to exercise the real flow:
 * same CSRF check, same backend call, same redirect back into the app with the
 * session in the URL fragment. It is registered under `apply: 'serve'` so it
 * cannot reach a production build.
 */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      // A sign-in form is tiny; anything larger is not one.
      if (data.length > 1_000_000) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function cookieValue(header: string | undefined, name: string): string {
  if (!header) return ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

function redirect(res: ServerResponse, origin: string, hash: string): void {
  res.statusCode = 303
  res.setHeader('Location', `${origin}/#${hash}`)
  res.end()
}

export function googleLoginDevRoute(): Plugin {
  return {
    name: 'formara-google-login-dev-route',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/google-login', (req, res, next) => {
        if (req.method !== 'POST') return next()

        void (async () => {
          const port = server.config.server.port ?? 5173
          const origin = `http://localhost:${port}`
          const apiBase = (process.env['VITE_API_BASE'] ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

          try {
            const body = await readBody(req)
            const form = new URLSearchParams(body)
            const credential = form.get('credential') ?? ''
            const csrfBody = form.get('g_csrf_token') ?? ''
            const csrfCookie = cookieValue(req.headers.cookie, 'g_csrf_token')

            // Same double-submit check the deployed function performs; a dev
            // shortcut here would let the local flow pass where production fails.
            if (!credential || !csrfBody || csrfBody !== csrfCookie) {
              redirect(res, origin, `google_error=${encodeURIComponent('Sign-in was blocked. Refresh and try again.')}`)
              return
            }

            const upstream = await fetch(`${apiBase}/api/auth/google`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ credential }),
            })

            if (!upstream.ok) {
              let detail = 'Google sign-in failed.'
              try {
                const payload = (await upstream.json()) as { detail?: unknown }
                if (typeof payload.detail === 'string' && payload.detail) detail = payload.detail
              } catch {
                // A cold or missing backend answers with HTML, not JSON.
              }
              redirect(res, origin, `google_error=${encodeURIComponent(detail)}`)
              return
            }

            const payload = (await upstream.json()) as {
              session?: { token?: string; expiresAt?: string }
            }
            const token = payload.session?.token
            if (!token) {
              redirect(res, origin, `google_error=${encodeURIComponent('Google sign-in failed.')}`)
              return
            }
            redirect(
              res,
              origin,
              `google_session=${encodeURIComponent(token)}&expires=${encodeURIComponent(payload.session?.expiresAt ?? '')}`,
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Google sign-in failed.'
            redirect(res, origin, `google_error=${encodeURIComponent(message)}`)
          }
        })()
      })
    },
  }
}
