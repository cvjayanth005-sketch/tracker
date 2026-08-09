# Deployment

The nicest online setup is one Docker web service on Render:

- Frontend: Vite build copied into the image
- Backend: FastAPI serving `/api/*` and the built PWA
- Database: SQLite on a Render persistent disk at `/data/tracker.sqlite3`

This keeps the app on one origin, so production does not need Vercel-to-Render
CORS wiring. Supabase is possible later, but it would mean replacing the
FastAPI/SQLite storage path with Postgres and likely revisiting auth/session
handling.

## 1. Render Docker Service

Create a Render Blueprint from the repository. `render.yaml` defines a Docker
web service that builds `Dockerfile` from the repo root.

- `tracker`
- Dockerfile: `./Dockerfile`
- context: `.`
- persistent disk mounted at `/data`
- `TRACKER_DB_PATH=/data/tracker.sqlite3`
- `TRACKER_STATIC_DIR=/app/static`

Set these Render environment variables:

```bash
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
AUTH_RATE_LIMIT=20
AUTH_RATE_WINDOW_SECONDS=900
GROQ_API_KEY=optional
GROQ_MODEL=openai/gpt-oss-20b
```

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
http://localhost:5173
```

The app uses Google Identity Services ID tokens, so no redirect URI is required
for the current sign-in flow.

## Optional: Vercel + Render Split

The repo also includes `vercel.json` if you prefer Vercel for the frontend and
Render for the API.

Set these Vercel environment variables:

```bash
VITE_API_BASE=https://your-render-service.onrender.com
# Optional safety net only; normal login config comes from Render /api/config.
VITE_GOOGLE_CLIENT_ID=
```

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
- Keep the Render disk attached before relying on the hosted app for real data.
- Browser IndexedDB is still the working local store; sync pushes/pulls the full
  app document when `VITE_API_BASE` is configured.
