# Deployment

The nicest online setup is one Docker web service on Render with Supabase
Postgres for account cloud state:

- Frontend: Vite build copied into the image
- Backend: FastAPI serving `/api/*` and the built PWA
- Database: Supabase Postgres for Google users, sessions, synced tracker docs,
  and AI note cache

This keeps the app on one origin, so production does not need Vercel-to-Render
CORS wiring. SQLite remains available as a local/legacy fallback when
`SUPABASE_DATABASE_URL` is not set.

## 1. Render Docker Service

Create a Render Blueprint from the repository. `render.yaml` defines a Docker
web service that builds `Dockerfile` from the repo root.

- `tracker`
- Dockerfile: `./Dockerfile`
- context: `.`
- `TRACKER_STATIC_DIR=/app/static`

Set these Render environment variables:

```bash
SUPABASE_DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
AUTH_RATE_LIMIT=20
AUTH_RATE_WINDOW_SECONDS=900
GROQ_API_KEY=optional
GROQ_MODEL=openai/gpt-oss-20b
SESSION_DAYS=30
```

Do **not** set `TRACKER_ALLOW_UNVERIFIED_GOOGLE` on Render. If `GOOGLE_CLIENT_ID` is set, that flag is ignored.

If a Groq key was ever pasted into chat, a screenshot, or logs, rotate it in the Groq console and update `GROQ_API_KEY` on Render.

Use the Supabase project `tracker` connection string for
`SUPABASE_DATABASE_URL`. Keep it on Render only; the frontend never receives
Supabase credentials.

After deploy, check:

```bash
curl https://your-render-service.onrender.com/api/health
```

Open the same Render URL in your browser to use the app.

## 2. Local Docker Test

With Docker installed:

```bash
docker build -t tracker:local .
docker run --rm -p 8000:8000 \
  -e TRACKER_DB_PATH=/data/tracker.sqlite3 \
  -e GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com \
  -v tracker-data:/data \
  tracker:local
```

Then open:

```text
http://localhost:8000
```

## 3. Google OAuth

In the Google Cloud Console, use a Web application OAuth client.

Add authorized JavaScript origins:

```text
https://your-render-service.onrender.com
https://your-vercel-app.vercel.app
http://localhost:5173
```

If the Google console asks for authorized redirect URIs, add the same-origin
login callback the app uses on phones:

```text
https://your-render-service.onrender.com/api/auth/google
https://your-vercel-app.vercel.app/api/google-login
```

Desktop browsers keep the Google popup. Phones, installed PWAs, and in-app
browsers use a full-page redirect so the account picker is not blocked.

## Optional: Vercel + Render Split

The repo also includes `vercel.json` if you prefer Vercel for the frontend and
Render for the API.

Set these Vercel environment variables:

```bash
VITE_API_BASE=https://your-render-service.onrender.com
# Optional safety net only; normal login config comes from Render /api/config.
VITE_GOOGLE_CLIENT_ID=
```

`VITE_API_BASE` is also read by `/api/google-login` on Vercel so phone sign-in
can finish on the same origin, then create the session on Render.

Then set Render:

```bash
FRONTEND_ORIGINS=https://your-vercel-app.vercel.app
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
```

For Vercel preview deployments, add each preview URL to `FRONTEND_ORIGINS`, or
set a narrow regex in Render:

```bash
FRONTEND_ORIGIN_REGEX=^https://your-vercel-project-[a-z0-9-]+\.vercel\.app$
```

Keep `FRONTEND_ORIGINS` for the production URL even if you use the regex for
previews.

## Notes

- Render free instances can sleep. First load after sleep may be slow.
- Supabase is now the durable account store. The Render disk is only needed for
  local/legacy SQLite paths.
- Browser IndexedDB is still the working local store; signed-in sync pushes and
  pulls the full app document from the configured backend.
