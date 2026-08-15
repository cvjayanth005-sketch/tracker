# Tracker Backend

Small FastAPI backend for the personal fat-loss and hybrid-training tracker.
Local development can use SQLite; production account state can use Supabase
Postgres by setting `SUPABASE_DATABASE_URL`.

## Run

```bash
cd backend
uvicorn app.main:app --reload
```

Without `SUPABASE_DATABASE_URL`, the API creates and seeds
`backend/tracker.sqlite3` on startup. With `SUPABASE_DATABASE_URL`, Google
users, sessions, synced tracker documents, and AI note cache use Supabase
Postgres. The leftover SQLite diary routes (`/api/today`, `/api/day`, and
similar) are then hidden. Set `TRACKER_ENABLE_DOCS=1` only if you need the
OpenAPI UI locally. AI endpoints are rate-limited per signed-in user
(`AI_RATE_LIMIT`); cloud sync documents larger than `STATE_BODY_MAX_BYTES`
are rejected. Session tokens are stored as SHA-256 hashes. Re-run
`docs/supabase-cloud-state.sql` in Supabase so AI notes are cached per user
instead of on a global hash.

For local frontend sync, set the frontend env var:

```bash
VITE_API_BASE=http://127.0.0.1:8000
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
AUTH_RATE_LIMIT=20
AUTH_RATE_WINDOW_SECONDS=900
SUPABASE_DATABASE_URL=postgresql://...
```

`GOOGLE_CLIENT_ID` is read by FastAPI to verify that Google tokens were issued
for this app. The browser gets the public client ID at runtime from
`/api/config`; `VITE_GOOGLE_CLIENT_ID` is only an optional frontend fallback.

In Google Cloud Console, the OAuth client must be a **Web application**. Add
the exact frontend origin shown in the browser address bar under **Authorized
JavaScript origins**. Google does not allow wildcard ports. For example:

```text
http://127.0.0.1:5173
http://localhost:5173
```

If Vite is running on another port, such as `5176`, add that exact origin too.
Restart both Vite and FastAPI after changing their `.env` files.

Optional Groq narration (the TypeScript rules remain authoritative):

```bash
export GROQ_API_KEY="your_key"
export GROQ_MODEL="openai/gpt-oss-20b"
```

The backend also reads these values from `backend/.env`.

## Test

```bash
cd backend
pytest
```

For tests or separate environments, set `TRACKER_DB_PATH=/path/to/tracker.sqlite3`.

## Excel plan import

The phase workbook is imported in two steps so a plan cannot silently overwrite
targets:

1. `POST /api/plan/import/excel/preview` parses and returns the phase ranges,
   rules, eight-week cycle, and any dated history it found.
2. `POST /api/plan/import/excel` applies the same payload after confirmation.

Both endpoints accept JSON with `filename`, `file_base64`, and a local
`start_date` (`YYYY-MM-DD`). Empty workbook cells and unchecked boxes remain
unknown. Applying the same workbook for the same start date is idempotent.

`GET /api/plan/timeline?date=YYYY-MM-DD` returns the targets effective on that
date, cycle position, weight trend, and phase-review status. Goal revisions are
effective-dated, so a later workbook import does not rewrite historical goals.
