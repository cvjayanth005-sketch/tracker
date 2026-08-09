# Tracker Backend

Small FastAPI + SQLite backend for the personal fat-loss and hybrid-training tracker.

## Run

```bash
cd backend
uvicorn app.main:app --reload
```

The API creates and seeds `backend/tracker.sqlite3` on startup.

For Claude's frontend sync, set the frontend env var:

```bash
VITE_API_BASE=http://127.0.0.1:8000
VITE_GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` is read by the browser. `GOOGLE_CLIENT_ID` is read by
FastAPI to verify that Google tokens were issued for this app.

Optional Fish Audio voice notes:

```bash
export FISH_API_KEY="your_key"
export FISH_TTS_MODEL="s2-pro"
# Optional, for a specific saved voice:
export FISH_REFERENCE_ID="voice_model_id"
```

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
