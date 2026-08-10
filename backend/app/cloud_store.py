from __future__ import annotations

import json
import os
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

try:
    import psycopg
    from psycopg.rows import dict_row
except ModuleNotFoundError:  # Local SQLite-only tests do not need psycopg installed.
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]


SESSION_DAYS = 30


def database_url() -> str | None:
    url = os.environ.get("SUPABASE_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if url and "=" in url and not url.strip().startswith(("postgres://", "postgresql://")):
        _key, _separator, value = url.partition("=")
        url = value
    return url


def enabled() -> bool:
    return bool(database_url())


@contextmanager
def connect() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    url = database_url()
    if not url:
        raise RuntimeError("SUPABASE_DATABASE_URL or DATABASE_URL is not configured.")
    if psycopg is None or dict_row is None:
        raise RuntimeError("psycopg is required when Supabase/Postgres storage is enabled.")
    with psycopg.connect(url, row_factory=dict_row, connect_timeout=10) as conn:
        conn.prepare_threshold = None
        yield conn


def status() -> dict[str, Any]:
    if not enabled():
        return {"enabled": False, "ok": False}
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  (select count(*) from app_users)::int as users,
                  (select count(*) from auth_sessions)::int as sessions,
                  (select count(*) from app_state)::int as state_documents
                """
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("Cloud status query did not return a row.")
            return {"enabled": True, "ok": True, **dict(row)}


def create_or_update_user(profile: dict[str, Any]) -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into app_users (google_sub, email, name, picture)
                values (%s, %s, %s, %s)
                on conflict (google_sub) do update set
                    email = excluded.email,
                    name = excluded.name,
                    picture = excluded.picture,
                    updated_at = now()
                returning id, google_sub, email, name, picture, created_at, updated_at
                """,
                (
                    str(profile["sub"]),
                    str(profile["email"]),
                    profile.get("name"),
                    profile.get("picture"),
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("User upsert did not return a row.")
            return dict(row)


def create_session(user_id: int) -> dict[str, Any]:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(tz=timezone.utc) + timedelta(days=SESSION_DAYS)
    expires_at = expires.isoformat()
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "insert into auth_sessions (token, user_id, expires_at) values (%s, %s, %s)",
                (token, user_id, expires),
            )
    return {"token": token, "expiresAt": expires_at}


def session_user(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select app_users.id, app_users.google_sub, app_users.email, app_users.name, app_users.picture,
                       app_users.created_at, app_users.updated_at
                from auth_sessions
                join app_users on app_users.id = auth_sessions.user_id
                where auth_sessions.token = %s
                  and auth_sessions.expires_at > now()
                """,
                (token,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def delete_session(token: str | None) -> None:
    if not token:
        return
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("delete from auth_sessions where token = %s", (token,))


def get_state_version(user_id: int | None = None) -> dict[str, int]:
    with connect() as conn:
        with conn.cursor() as cur:
            if user_id is None:
                cur.execute("select version from app_state where user_id is null")
            else:
                cur.execute("select version from app_state where user_id = %s", (user_id,))
            row = cur.fetchone()
            return {"version": int(row["version"]) if row else 0}


def get_state_document(user_id: int | None = None) -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            if user_id is None:
                cur.execute("select version, updated_at, document_json from app_state where user_id is null")
            else:
                cur.execute(
                    "select version, updated_at, document_json from app_state where user_id = %s",
                    (user_id,),
                )
            row = cur.fetchone()
            if row is None:
                return {"version": 0, "updatedAt": "", "tables": {}}
            doc = row["document_json"]
            if isinstance(doc, str):
                return json.loads(doc)
            return dict(doc)


def put_state_document(doc: dict[str, Any], user_id: int | None = None) -> dict[str, Any]:
    current = get_state_version(user_id)["version"]
    base = doc.get("baseVersion")
    if base is not None and int(base) != current:
        return {"conflict": True, "serverVersion": current}
    stored = {
        "version": int(doc["version"]),
        "updatedAt": doc["updatedAt"],
        "tables": doc["tables"],
    }
    updated_at = datetime.fromisoformat(stored["updatedAt"].replace("Z", "+00:00"))
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into app_state (user_id, version, updated_at, document_json)
                values (%s, %s, %s, %s::jsonb)
                on conflict (user_id) do update set
                    version = excluded.version,
                    updated_at = excluded.updated_at,
                    document_json = excluded.document_json
                """,
                (user_id, stored["version"], updated_at, json.dumps(stored)),
            )
    return stored


def get_cached_note(state_hash: str) -> dict[str, Any] | None:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select state_hash, note, state_summary_json, created_at
                from ai_note_cache
                where state_hash = %s
                """,
                (state_hash,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def put_cached_note(state_hash: str, note: str, state_summary_json: str) -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into ai_note_cache (state_hash, note, state_summary_json)
                values (%s, %s, %s::jsonb)
                on conflict (state_hash) do update set
                    note = excluded.note,
                    state_summary_json = excluded.state_summary_json
                returning state_hash, note, state_summary_json, created_at
                """,
                (state_hash, note, state_summary_json),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("Coach note cache upsert did not return a row.")
            return dict(row)
