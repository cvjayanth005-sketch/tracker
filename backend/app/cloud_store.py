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


from . import state_tables
from .auth import hash_session_token, session_ttl_days


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
            cur.execute("select 1")
            cur.fetchone()
    return {"enabled": True, "ok": True}


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
    expires = datetime.now(tz=timezone.utc) + timedelta(days=session_ttl_days())
    expires_at = expires.isoformat()
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "insert into auth_sessions (token, user_id, expires_at) values (%s, %s, %s)",
                (hash_session_token(token), user_id, expires),
            )
    return {"token": token, "expiresAt": expires_at}


def session_user(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    digest = hash_session_token(token)
    with connect() as conn:
        with conn.cursor() as cur:
            row = _session_user_row(cur, digest)
            if row is not None:
                return row
            row = _session_user_row(cur, token)
            if row is None:
                return None
            cur.execute(
                "update auth_sessions set token = %s where token = %s",
                (digest, token),
            )
            return row


def _session_user_row(cur, stored_token: str) -> dict[str, Any] | None:
    cur.execute(
        """
        select app_users.id, app_users.google_sub, app_users.email, app_users.name, app_users.picture,
               app_users.created_at, app_users.updated_at
        from auth_sessions
        join app_users on app_users.id = auth_sessions.user_id
        where auth_sessions.token = %s
          and auth_sessions.expires_at > now()
        """,
        (stored_token,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def delete_session(token: str | None) -> None:
    if not token:
        return
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "delete from auth_sessions where token in (%s, %s)",
                (hash_session_token(token), token),
            )


def get_state_version(user_id: int | None = None) -> dict[str, int]:
    with connect() as conn:
        with conn.cursor() as cur:
            return {"version": _read_version(cur, user_id)}


def get_state_document(user_id: int | None = None) -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            blob_row = _fetch_blob_row(cur, user_id)
            if user_id is None:
                return _document_from_blob(blob_row)

            meta = state_tables.read_sync_meta(cur, user_id)
            blob_doc = _document_from_blob(blob_row)
            if meta is None:
                if blob_row is None:
                    return {"version": 0, "updatedAt": "", "tables": {}}
                tables = blob_doc.get("tables") or {}
                if tables:
                    state_tables.replace_user_rows(cur, user_id, tables)
                    updated_at = _parse_updated_at(blob_doc.get("updatedAt") or "") or datetime.now(
                        tz=timezone.utc
                    )
                    state_tables.upsert_sync_meta(cur, user_id, int(blob_doc.get("version") or 0), updated_at)
                    meta = {"version": int(blob_doc.get("version") or 0), "updated_at": updated_at}
                else:
                    return blob_doc

            return {
                "version": int(meta["version"]),
                "updatedAt": (
                    state_tables.format_instant(meta["updated_at"])
                    if meta.get("updated_at")
                    else blob_doc.get("updatedAt") or ""
                ),
                "tables": state_tables.fetch_user_tables(cur, user_id),
                "tombstones": state_tables.fetch_tombstones(cur, user_id),
            }


def put_state_document(doc: dict[str, Any], user_id: int | None = None) -> dict[str, Any]:
    row_merge = bool(doc.pop("rowMerge", False))
    stored = {
        "version": int(doc["version"]),
        "updatedAt": doc["updatedAt"],
        "tables": doc["tables"],
        "tombstones": list(doc.get("tombstones") or []),
    }
    updated_at = _parse_updated_at(stored["updatedAt"])
    if updated_at is None:
        updated_at = datetime.now(tz=timezone.utc)
        stored["updatedAt"] = updated_at.isoformat().replace("+00:00", "Z")

    with connect() as conn:
        with conn.cursor() as cur:
            current = _read_version(cur, user_id, for_update=True)
            base = doc.get("baseVersion")
            if base is not None and int(base) != current:
                return {"conflict": True, "serverVersion": current}
            if user_id is not None:
                if row_merge:
                    state_tables.merge_user_rows(cur, user_id, stored["tables"], stored["tombstones"])
                else:
                    state_tables.replace_user_rows(cur, user_id, stored["tables"])
                    cur.execute("delete from sync_tombstones where user_id = %s", (user_id,))
                state_tables.upsert_sync_meta(cur, user_id, stored["version"], updated_at)
                stored["tables"] = state_tables.fetch_user_tables(cur, user_id)
                stored["tombstones"] = state_tables.fetch_tombstones(cur, user_id)
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


def _read_version(cur: Any, user_id: int | None, for_update: bool = False) -> int:
    lock = " for update" if for_update else ""
    if user_id is not None:
        cur.execute(f"select version from sync_meta where user_id = %s{lock}", (user_id,))
        row = cur.fetchone()
        if row:
            return int(row["version"])
        cur.execute(f"select version from app_state where user_id = %s{lock}", (user_id,))
    else:
        cur.execute(f"select version from app_state where user_id is null{lock}")
    row = cur.fetchone()
    return int(row["version"]) if row else 0


def _fetch_blob_row(cur: Any, user_id: int | None) -> dict[str, Any] | None:
    if user_id is None:
        cur.execute("select version, updated_at, document_json from app_state where user_id is null")
    else:
        cur.execute(
            "select version, updated_at, document_json from app_state where user_id = %s",
            (user_id,),
        )
    row = cur.fetchone()
    return dict(row) if row else None


def _document_from_blob(row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        return {"version": 0, "updatedAt": "", "tables": {}}
    doc = row["document_json"]
    if isinstance(doc, str):
        return json.loads(doc)
    return dict(doc)


def _parse_updated_at(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def get_cached_note(state_hash: str, user_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select state_hash, note, state_summary_json, created_at
                from ai_note_cache
                where user_id = %s and state_hash = %s
                """,
                (user_id, state_hash),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def put_cached_note(state_hash: str, note: str, state_summary_json: str, user_id: int) -> dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into ai_note_cache (user_id, state_hash, note, state_summary_json)
                values (%s, %s, %s, %s::jsonb)
                on conflict (user_id, state_hash) do update set
                    note = excluded.note,
                    state_summary_json = excluded.state_summary_json
                returning state_hash, note, state_summary_json, created_at
                """,
                (user_id, state_hash, note, state_summary_json),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("Coach note cache upsert did not return a row.")
            return dict(row)
