from __future__ import annotations

from collections import deque
from contextlib import asynccontextmanager
from datetime import date
import json
import logging
import os
from pathlib import Path
import re
import time
import traceback
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .auth import (
    bearer_token,
    create_or_update_user,
    create_session,
    delete_session,
    require_user,
    session_user,
    verify_google_id_token,
)
from . import cloud_store
from .database import connect, get_settings, init_db, row_to_dict, upsert_settings
from .schemas import (
    CoachNoteRequest,
    CoachChatRequest,
    FoodParseRequest,
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
    food_parse,
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
AI_RATE_LIMIT = int(os.environ.get("AI_RATE_LIMIT", "40"))
AI_RATE_WINDOW_SECONDS = int(os.environ.get("AI_RATE_WINDOW_SECONDS", "900"))
STATE_BODY_MAX_BYTES = int(os.environ.get("STATE_BODY_MAX_BYTES", str(2_000_000)))
_auth_attempts: dict[str, deque[float]] = {}
_ai_attempts: dict[str, deque[float]] = {}
logger = logging.getLogger(__name__)
_DSN_RE = re.compile(r"postgres(?:ql)?://\S+", re.I)
_GROQ_KEY_RE = re.compile(r"gsk_[A-Za-z0-9_-]+")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def configured_cors_origins() -> list[str]:
    raw = os.environ.get("FRONTEND_ORIGINS", "")
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


def static_dir() -> Path:
    return Path(os.environ.get("TRACKER_STATIC_DIR", Path(__file__).resolve().parents[1] / "static"))


def redact_secrets(text: str) -> str:
    redacted = text
    for secret_name in ("SUPABASE_DATABASE_URL", "DATABASE_URL", "GROQ_API_KEY"):
        secret = os.environ.get(secret_name)
        if secret:
            redacted = redacted.replace(secret, f"[{secret_name}]")
    redacted = _DSN_RE.sub("[DATABASE_URL]", redacted)
    return _GROQ_KEY_RE.sub("[GROQ_API_KEY]", redacted)


def client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        parts = [part.strip() for part in forwarded_for.split(",") if part.strip()]
        if parts:
            return parts[-1]
    if request.client:
        return request.client.host
    return "unknown"


def hit_rate_limit(
    bucket: dict[str, deque[float]],
    key: str,
    limit: int,
    window_seconds: int,
    message: str,
) -> None:
    if limit <= 0:
        return
    now = time.monotonic()
    cutoff = now - window_seconds
    attempts = bucket.setdefault(key, deque())
    while attempts and attempts[0] < cutoff:
        attempts.popleft()
    if len(attempts) >= limit:
        raise HTTPException(status_code=429, detail=message)
    attempts.append(now)


def check_auth_rate_limit(request: Request) -> None:
    hit_rate_limit(
        _auth_attempts,
        client_ip(request),
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW_SECONDS,
        "Too many sign-in attempts. Try again later.",
    )


def check_ai_rate_limit(user_id: int) -> None:
    hit_rate_limit(
        _ai_attempts,
        f"user:{user_id}",
        AI_RATE_LIMIT,
        AI_RATE_WINDOW_SECONDS,
        "Too many AI requests. Try again later.",
    )


def enforce_state_body_limit(request: Request) -> None:
    if STATE_BODY_MAX_BYTES <= 0:
        return
    raw = request.headers.get("content-length")
    if not raw:
        return
    try:
        length = int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Content-Length.") from None
    if length > STATE_BODY_MAX_BYTES:
        raise HTTPException(status_code=413, detail="State document is too large.")


def cloud_database_unavailable(exc: Exception) -> None:
    logger.error("Cloud database operation failed\n%s", redact_secrets(traceback.format_exc()))
    raise HTTPException(
        status_code=503,
        detail={
            "error": "cloud_database_unavailable",
            "message": "The backend could not reach the cloud database.",
        },
    ) from exc


def cloud_session_user(token: str | None) -> dict | None:
    try:
        return cloud_store.session_user(token)
    except Exception as exc:
        cloud_database_unavailable(exc)


def require_api_user(token: str | None) -> dict:
    if cloud_store.enabled():
        user = cloud_session_user(token)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        return user
    with connect() as conn:
        return require_user(conn, token)


def require_ai_user(token: str | None) -> dict:
    user = require_api_user(token)
    check_ai_rate_limit(int(user["id"]))
    return user


def require_legacy_sqlite(token: str | None) -> None:
    """SQLite diary APIs are leftover. Hidden when the product uses Postgres."""
    if cloud_store.enabled():
        raise HTTPException(status_code=404, detail="Not found.")
    require_api_user(token)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "PUT" and request.url.path == "/api/state":
            try:
                enforce_state_body_limit(request)
            except HTTPException as exc:
                response: Response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
                apply_security_headers(request, response)
                return response
        response = await call_next(request)
        apply_security_headers(request, response)
        return response


def apply_security_headers(request: Request, response: Response) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    if proto == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


_DOCS_ENABLED = os.environ.get("TRACKER_ENABLE_DOCS") == "1"
app = FastAPI(
    title="Personal Fat Loss + Hybrid Training Tracker API",
    lifespan=lifespan,
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)
app.add_middleware(SecurityHeadersMiddleware)
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
        info = cloud_store.status()
    except Exception as exc:
        cloud_database_unavailable(exc)
    return {"enabled": bool(info.get("enabled")), "ok": bool(info.get("ok"))}


@app.get("/api/config")
def public_config() -> dict:
    return {"googleClientId": os.environ.get("GOOGLE_CLIENT_ID", "")}


def _auth_payload(user: dict, session: dict) -> dict:
    return {
        "session": session,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "picture": user["picture"],
        },
    }


def _complete_google_login(credential: str) -> dict:
    profile = verify_google_id_token(credential)
    if cloud_store.enabled():
        try:
            user = cloud_store.create_or_update_user(profile)
            session = cloud_store.create_session(int(user["id"]))
        except Exception as exc:
            cloud_database_unavailable(exc)
        return _auth_payload(user, session)
    with connect() as conn:
        user = create_or_update_user(conn, profile)
        session = create_session(conn, int(user["id"]))
        return _auth_payload(user, session)


def frontend_origin_for_redirect(request: Request) -> str:
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    host = (
        request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    ).split(",")[0].strip()
    if host:
        return f"{proto}://{host}".rstrip("/")
    origins = configured_cors_origins()
    if origins:
        return origins[0]
    return str(request.base_url).rstrip("/")


def google_login_redirect(request: Request, **params: str) -> RedirectResponse:
    origin = frontend_origin_for_redirect(request)
    query = "&".join(f"{key}={quote(value, safe='')}" for key, value in params.items() if value)
    return RedirectResponse(f"{origin}/#{query}", status_code=303)


def http_exception_message(exc: HTTPException) -> str:
    if isinstance(exc.detail, str) and exc.detail:
        return exc.detail
    return "Google sign-in failed."


@app.post("/api/auth/google", response_model=None)
async def google_login(request: Request):
    check_auth_rate_limit(request)
    content_type = (request.headers.get("content-type") or "").lower()
    is_form = "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type
    if is_form:
        form = await request.form()
        credential = str(form.get("credential") or "")
        csrf_body = str(form.get("g_csrf_token") or "")
        csrf_cookie = request.cookies.get("g_csrf_token") or ""
        if not credential:
            return google_login_redirect(request, google_error="Google sign-in failed.")
        if not csrf_body or not csrf_cookie or csrf_body != csrf_cookie:
            return google_login_redirect(request, google_error="Sign-in was blocked. Refresh and try again.")
    else:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Google sign-in failed.") from exc
        credential = GoogleLoginRequest.model_validate(body).credential
    try:
        result = _complete_google_login(credential)
    except HTTPException as exc:
        if is_form:
            return google_login_redirect(request, google_error=http_exception_message(exc))
        raise
    if is_form:
        return google_login_redirect(
            request,
            google_session=str(result["session"]["token"]),
            expires=str(result["session"]["expiresAt"]),
        )
    return result


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
            delete_session(conn, token)
    return {"ok": True}


@app.get("/api/today")
def today(
    date_: date | None = Query(default=None, alias="date"),
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return build_today(conn, date_ or date.today())


@app.get("/api/day/{local_date}")
def get_day(local_date: str, token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return get_or_create_day(conn, parse_date(local_date))


@app.put("/api/day/{local_date}")
def put_day(
    local_date: str,
    payload: DayLogUpdate,
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return upsert_day(conn, parse_date(local_date), payload.model_dump(exclude_unset=True))


@app.get("/api/progress")
def progress(
    date_: date | None = Query(default=None, alias="date"),
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return build_progress(conn, date_ or date.today())


@app.post("/api/import")
def import_data(payload: ImportRequest, token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        if payload.rows is not None:
            return import_rows(conn, payload.rows)
        if payload.csv_text:
            return import_csv(conn, payload.csv_text)
        raise HTTPException(status_code=400, detail="Provide rows or csv_text.")


@app.post("/api/plan/import/excel/preview")
def preview_excel_plan(
    payload: ExcelPlanImportRequest,
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
    try:
        parsed = parse_workbook_plan(decode_workbook_payload(payload.file_base64))
        return preview_workbook_plan(parsed, payload.filename, payload.start_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/plan/import/excel")
def import_excel_plan(
    payload: ExcelPlanImportRequest,
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
    try:
        parsed = parse_workbook_plan(decode_workbook_payload(payload.file_base64))
        with connect() as conn:
            return apply_workbook_plan(conn, parsed, payload.filename, payload.start_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/plan/timeline")
def plan_timeline(
    date_: date | None = Query(default=None, alias="date"),
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
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
def put_state(
    payload: StateDocument,
    request: Request,
    token: str | None = Depends(bearer_token),
) -> dict:
    enforce_state_body_limit(request)
    dumped = payload.model_dump()
    dumped["rowMerge"] = "tombstones" in payload.model_fields_set
    if STATE_BODY_MAX_BYTES > 0:
        size = len(json.dumps(dumped, separators=(",", ":")).encode("utf-8"))
        if size > STATE_BODY_MAX_BYTES:
            raise HTTPException(status_code=413, detail="State document is too large.")
    if cloud_store.enabled():
        user = cloud_session_user(token)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        try:
            result = cloud_store.put_state_document(dumped, int(user["id"]))
        except Exception as exc:
            cloud_database_unavailable(exc)
        if result.get("conflict"):
            raise HTTPException(status_code=409, detail=result)
        return result
    with connect() as conn:
        user = require_user(conn, token)
        result = put_state_document(conn, dumped, int(user["id"]))
        if result.get("conflict"):
            raise HTTPException(status_code=409, detail=result)
        return result


@app.get("/api/workout/{local_date}")
def read_workout(local_date: str, token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return get_workout(conn, parse_date(local_date))


@app.put("/api/workout/{local_date}")
def write_workout(
    local_date: str,
    payload: WorkoutUpsert,
    token: str | None = Depends(bearer_token),
) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return upsert_workout(conn, parse_date(local_date), payload.model_dump())


@app.post("/api/runs")
def post_run(payload: RunCreate, token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return create_run(conn, payload.model_dump())


@app.get("/api/phase")
def get_phase(token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
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
def put_phase(payload: PhaseUpdate, token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
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
def settings(token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return get_settings(conn)


@app.put("/api/settings")
def update_settings(payload: SettingsUpdate, token: str | None = Depends(bearer_token)) -> dict:
    require_legacy_sqlite(token)
    with connect() as conn:
        return upsert_settings(conn, payload.values)


@app.post("/api/coach-note")
def coach_note(payload: CoachNoteRequest, token: str | None = Depends(bearer_token)) -> dict:
    user = require_ai_user(token)
    user_id = int(user["id"])
    if payload.summary is not None:
        if cloud_store.enabled():
            return cached_coach_note_for_summary(
                payload.summary,
                payload.promptVersion,
                payload.rulesVersion,
                payload.force,
                user_id=user_id,
            )
        with connect() as conn:
            return cached_coach_note_for_summary(
                payload.summary,
                payload.promptVersion,
                payload.rulesVersion,
                payload.force,
                user_id=user_id,
                conn=conn,
            )
    if cloud_store.enabled():
        raise HTTPException(status_code=400, detail="summary is required.")
    with connect() as conn:
        return cached_coach_note(conn, user_id, payload.force)


@app.post("/api/coach-chat")
def chat_with_coach(payload: CoachChatRequest, token: str | None = Depends(bearer_token)) -> dict:
    require_ai_user(token)
    return coach_chat(payload.model_dump())


@app.post("/api/food/parse")
def parse_food(payload: FoodParseRequest, token: str | None = Depends(bearer_token)) -> dict:
    require_ai_user(token)
    try:
        return food_parse(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/onboarding/draft")
def draft_onboarding(payload: OnboardingDraftRequest, token: str | None = Depends(bearer_token)) -> dict:
    require_ai_user(token)
    try:
        return onboarding_draft(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str) -> FileResponse:
    if full_path in {"docs", "redoc", "openapi.json"} or full_path == "api" or full_path.startswith("api/"):
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
