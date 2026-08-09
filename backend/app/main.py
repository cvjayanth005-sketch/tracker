from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .auth import (
    bearer_token,
    create_or_update_user,
    create_session,
    require_user,
    session_user,
    verify_google_id_token,
)
from .database import connect, get_settings, init_db, row_to_dict, upsert_settings
from .schemas import (
    CoachNoteRequest,
    DayLogUpdate,
    GoogleLoginRequest,
    ImportRequest,
    PhaseUpdate,
    RunCreate,
    SettingsUpdate,
    StateDocument,
    WorkoutUpsert,
)
from .services import (
    build_progress,
    build_today,
    cached_coach_note,
    cached_coach_note_for_summary,
    coach_audio,
    create_run,
    audio_dir,
    get_or_create_day,
    get_state_document,
    get_state_version,
    get_workout,
    import_csv,
    import_rows,
    parse_date,
    put_state_document,
    upsert_day,
    upsert_workout,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Personal Fat Loss + Hybrid Training Tracker API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/auth/google")
def google_login(payload: GoogleLoginRequest) -> dict:
    profile = verify_google_id_token(payload.credential)
    with connect() as conn:
        user = create_or_update_user(conn, profile)
        session = create_session(conn, int(user["id"]))
        return {
            "session": session,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "picture": user["picture"],
            },
        }


@app.get("/api/auth/me")
def auth_me(token: str | None = Depends(bearer_token)) -> dict:
    with connect() as conn:
        user = require_user(conn, token)
        return {
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "picture": user["picture"],
            }
        }


@app.post("/api/auth/logout")
def auth_logout(token: str | None = Depends(bearer_token)) -> dict:
    with connect() as conn:
        if token:
            conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
            conn.commit()
    return {"ok": True}


@app.get("/api/today")
def today(date_: date | None = Query(default=None, alias="date")) -> dict:
    with connect() as conn:
        return build_today(conn, date_ or date.today())


@app.get("/api/day/{local_date}")
def get_day(local_date: str) -> dict:
    with connect() as conn:
        return get_or_create_day(conn, parse_date(local_date))


@app.put("/api/day/{local_date}")
def put_day(local_date: str, payload: DayLogUpdate) -> dict:
    with connect() as conn:
        return upsert_day(conn, parse_date(local_date), payload.model_dump(exclude_unset=True))


@app.get("/api/progress")
def progress(date_: date | None = Query(default=None, alias="date")) -> dict:
    with connect() as conn:
        return build_progress(conn, date_ or date.today())


@app.post("/api/import")
def import_data(payload: ImportRequest) -> dict:
    with connect() as conn:
        if payload.rows is not None:
            return import_rows(conn, payload.rows)
        if payload.csv_text:
            return import_csv(conn, payload.csv_text)
        raise HTTPException(status_code=400, detail="Provide rows or csv_text.")


@app.get("/api/state/version")
def state_version(token: str | None = Depends(bearer_token)) -> dict:
    with connect() as conn:
        user = session_user(conn, token)
        return get_state_version(conn, int(user["id"]) if user else None)


@app.get("/api/state")
def state(token: str | None = Depends(bearer_token)) -> dict:
    with connect() as conn:
        user = session_user(conn, token)
        return get_state_document(conn, int(user["id"]) if user else None)


@app.put("/api/state")
def put_state(payload: StateDocument, token: str | None = Depends(bearer_token)) -> dict:
    with connect() as conn:
        user = session_user(conn, token)
        result = put_state_document(conn, payload.model_dump(), int(user["id"]) if user else None)
        if result.get("conflict"):
            raise HTTPException(status_code=409, detail=result)
        return result


@app.get("/api/workout/{local_date}")
def read_workout(local_date: str) -> dict:
    with connect() as conn:
        return get_workout(conn, parse_date(local_date))


@app.put("/api/workout/{local_date}")
def write_workout(local_date: str, payload: WorkoutUpsert) -> dict:
    with connect() as conn:
        return upsert_workout(conn, parse_date(local_date), payload.model_dump())


@app.post("/api/runs")
def post_run(payload: RunCreate) -> dict:
    with connect() as conn:
        return create_run(conn, payload.model_dump())


@app.get("/api/phase")
def get_phase() -> dict:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT phases.*
            FROM user_profile
            JOIN phases ON phases.id = user_profile.current_phase_id
            WHERE user_profile.id = 1
            """
        ).fetchone()
        return row_to_dict(row)


@app.put("/api/phase")
def put_phase(payload: PhaseUpdate) -> dict:
    with connect() as conn:
        phase = conn.execute("SELECT * FROM phases WHERE id = ?", (payload.current_phase_id,)).fetchone()
        if phase is None:
            raise HTTPException(status_code=404, detail="Phase not found.")
        conn.execute(
            "UPDATE user_profile SET current_phase_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            (payload.current_phase_id,),
        )
        conn.commit()
        return row_to_dict(phase)


@app.get("/api/settings")
def settings() -> dict:
    with connect() as conn:
        return get_settings(conn)


@app.put("/api/settings")
def update_settings(payload: SettingsUpdate) -> dict:
    with connect() as conn:
        return upsert_settings(conn, payload.values)


@app.post("/api/coach-note")
def coach_note(payload: CoachNoteRequest) -> dict:
    with connect() as conn:
        if payload.summary is not None:
            return cached_coach_note_for_summary(
                conn,
                payload.summary,
                payload.promptVersion,
                payload.rulesVersion,
                payload.force,
            )
        return cached_coach_note(conn, payload.force)


@app.post("/api/coach-note/audio")
def post_coach_audio(payload: CoachNoteRequest) -> dict:
    with connect() as conn:
        try:
            note = None
            if payload.summary is not None:
                note = cached_coach_note_for_summary(
                    conn,
                    payload.summary,
                    payload.promptVersion,
                    payload.rulesVersion,
                    payload.force,
                )["note"]
            return coach_audio(conn, note=note, force=payload.force)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/audio/{filename}")
def audio_file(filename: str) -> FileResponse:
    if not filename.endswith(".mp3") or "/" in filename:
        raise HTTPException(status_code=404, detail="Audio not found.")
    path = audio_dir() / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio not found.")
    return FileResponse(path, media_type="audio/mpeg")
