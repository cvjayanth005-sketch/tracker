from __future__ import annotations

from collections import deque
from contextlib import asynccontextmanager
from datetime import date
import logging
import os
from pathlib import Path
import time

from fastapi import Depends, FastAPI, HTTPException, Query, Request
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
from . import cloud_store
from .database import connect, get_settings, init_db, row_to_dict, upsert_settings
from .schemas import (
    CoachNoteRequest,
    CoachChatRequest,
    DayLogUpdate,
    ExcelPlanImportRequest,
    GoogleLoginRequest,
    ImportRequest,
    OnboardingDraftRequest,
    PhaseUpdate,
    RunCreate,
    SettingsUpdate,
    StateDocument,
    WorkoutUpsert,
)
from .excel_plan import (
    apply_workbook_plan,
    decode_workbook_payload,
    get_goal_timeline,
    parse_workbook_plan,
    preview_workbook_plan,
)
from .services import (
    build_progress,
    build_today,
    cached_coach_note,
    cached_coach_note_for_summary,
    coach_chat,
    create_run,
    get_or_create_day,
    get_state_document,
    get_state_version,
    get_workout,
    import_csv,
    import_rows,
    onboarding_draft,
    parse_date,
    put_state_document,
    upsert_day,
    upsert_workout,
)


AUTH_RATE_LIMIT = int(os.environ.get("AUTH_RATE_LIMIT", "20"))
AUTH_RATE_WINDOW_SECONDS = int(os.environ.get("AUTH_RATE_WINDOW_SECONDS", "900"))
_auth_attempts: dict[str, deque[float]] = {}
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def configured_cors_origins() -> list[str]:
    raw = os.environ.get("FRONTEND_ORIGINS", "")
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


def static_dir() -> Path:
    return Path(os.environ.get("TRACKER_STATIC_DIR", Path(__file__).resolve().parents[1] / "static"))


def client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_auth_rate_limit(request: Request) -> None:
    if AUTH_RATE_LIMIT <= 0:
        return

    now = time.monotonic()
    cutoff = now - AUTH_RATE_WINDOW_SECONDS
    key = client_ip(request)
    attempts = _auth_attempts.setdefault(key, deque())
    while attempts and attempts[0] < cutoff:
        attempts.popleft()

    if len(attempts) >= AUTH_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.")

    attempts.append(now)


def cloud_database_unavailable(exc: Exception) -> None:
    logger.exception("Cloud database operation failed")
    detail = str(exc)
    for secret_name in ("SUPABASE_DATABASE_URL", "DATABASE_URL"):
        secret = os.environ.get(secret_name)
        if secret:
            detail = detail.replace(secret, f"[{secret_name}]")
    raise HTTPException(
        status_code=503,
        detail={
            "error": "cloud_database_unavailable",
            "message": "The backend could not reach Supabase. Check SUPABASE_DATABASE_URL in Render.",
            "type": type(exc).__name__,
            "detail": detail[:500],
        },
    ) from exc


def cloud_session_user(token: str | None) -> dict | None:
    try:
        return cloud_store.session_user(token)
    except Exception as exc:
        cloud_database_unavailable(exc)


app = FastAPI(title="Personal Fat Loss + Hybrid Training Tracker API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_origin_regex=os.environ.get(
        "FRONTEND_ORIGIN_REGEX",
        r"^http://(localhost|127\.0\.0\.1):\d+$",
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/cloud/status")
def cloud_status() -> dict:
    try:
        return cloud_store.status()
    except Exception as exc:
        cloud_database_unavailable(exc)


@app.get("/api/config")
def public_config() -> dict:
    return {"googleClientId": os.environ.get("GOOGLE_CLIENT_ID", "")}


@app.post("/api/auth/google")
def google_login(payload: GoogleLoginRequest, request: Request) -> dict:
    check_auth_rate_limit(request)
    profile = verify_google_id_token(payload.credential)
    if cloud_store.enabled():
        try:
            user = cloud_store.create_or_update_user(profile)
            session = cloud_store.create_session(int(user["id"]))
        except Exception as exc:
            cloud_database_unavailable(exc)
        return {
            "session": session,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "picture": user["picture"],
            },
        }
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
    if cloud_store.enabled():
        user = cloud_session_user(token)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        return {
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "picture": user["picture"],
            }
        }
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
    if cloud_store.enabled():
        try:
            cloud_store.delete_session(token)
        except Exception as exc:
            cloud_database_unavailable(exc)
        return {"ok": True}
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


@app.post("/api/plan/import/excel/preview")
def preview_excel_plan(payload: ExcelPlanImportRequest) -> dict:
    try:
        parsed = parse_workbook_plan(decode_workbook_payload(payload.file_base64))
        return preview_workbook_plan(parsed, payload.filename, payload.start_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/plan/import/excel")
def import_excel_plan(payload: ExcelPlanImportRequest) -> dict:
    try:
        parsed = parse_workbook_plan(decode_workbook_payload(payload.file_base64))
        with connect() as conn:
            return apply_workbook_plan(conn, parsed, payload.filename, payload.start_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/plan/timeline")
def plan_timeline(date_: date | None = Query(default=None, alias="date")) -> dict:
    on_date = date_ or date.today()
    with connect() as conn:
        timeline = get_goal_timeline(conn, on_date)
        progress_data = build_progress(conn, on_date)
        timeline["trend"] = {
            "weight_7_day_avg": progress_data["weight_7_day_avg"],
            "weekly_change_kg": progress_data["weekly_change_kg"],
        }
        timeline["phase_review"] = progress_data["phase_review"]
        return timeline


@app.get("/api/state/version")
def state_version(token: str | None = Depends(bearer_token)) -> dict:
    if cloud_store.enabled():
        user = cloud_session_user(token)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        try:
            return cloud_store.get_state_version(int(user["id"]))
        except Exception as exc:
            cloud_database_unavailable(exc)
    with connect() as conn:
        user = require_user(conn, token)
        return get_state_version(conn, int(user["id"]))


@app.get("/api/state")
def state(token: str | None = Depends(bearer_token)) -> dict:
    if cloud_store.enabled():
        user = cloud_session_user(token)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        try:
            return cloud_store.get_state_document(int(user["id"]))
        except Exception as exc:
            cloud_database_unavailable(exc)
    with connect() as conn:
        user = require_user(conn, token)
        return get_state_document(conn, int(user["id"]))


@app.put("/api/state")
def put_state(payload: StateDocument, token: str | None = Depends(bearer_token)) -> dict:
    if cloud_store.enabled():
        user = cloud_session_user(token)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        try:
            result = cloud_store.put_state_document(payload.model_dump(), int(user["id"]))
        except Exception as exc:
            cloud_database_unavailable(exc)
        if result.get("conflict"):
            raise HTTPException(status_code=409, detail=result)
        return result
    with connect() as conn:
        user = require_user(conn, token)
        result = put_state_document(conn, payload.model_dump(), int(user["id"]))
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


@app.post("/api/coach-chat")
def chat_with_coach(payload: CoachChatRequest, token: str | None = Depends(bearer_token)) -> dict:
    if cloud_store.enabled():
        if cloud_session_user(token) is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
    else:
        with connect() as conn:
            require_user(conn, token)
    return coach_chat(payload.model_dump())


@app.post("/api/onboarding/draft")
def draft_onboarding(payload: OnboardingDraftRequest, token: str | None = Depends(bearer_token)) -> dict:
    if cloud_store.enabled():
        if cloud_session_user(token) is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
    else:
        with connect() as conn:
            require_user(conn, token)
    try:
        return onboarding_draft(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str) -> FileResponse:
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found.")

    root = static_dir()
    if not root.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found.")

    requested = (root / full_path).resolve()
    if requested.is_file() and requested.is_relative_to(root.resolve()):
        return FileResponse(requested)

    index = root / "index.html"
    if index.exists():
        return FileResponse(index)

    raise HTTPException(status_code=404, detail="Frontend build not found.")
