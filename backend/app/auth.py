from __future__ import annotations

import base64
import json
import os
import secrets
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Header, HTTPException


SESSION_DAYS = 30


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    try:
        payload = token.split(".")[1]
        padded = payload + "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Google token.") from exc


def verify_google_id_token(id_token: str) -> dict[str, Any]:
    expected_aud = os.environ.get("GOOGLE_CLIENT_ID")
    allow_unverified = os.environ.get("TRACKER_ALLOW_UNVERIFIED_GOOGLE") == "1"
    if not expected_aud and not allow_unverified:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID is not configured on the backend.")

    if expected_aud and not allow_unverified:
        url = "https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": id_token})
        try:
            with urllib.request.urlopen(url, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Google token verification failed.") from exc
    else:
        payload = _decode_jwt_payload(id_token)

    if expected_aud and not allow_unverified and payload.get("aud") != expected_aud:
        raise HTTPException(status_code=401, detail="Google token audience mismatch.")
    if payload.get("iss") not in (None, "accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Google token issuer mismatch.")
    exp = payload.get("exp")
    if isinstance(exp, str) and exp.isdigit():
        exp = int(exp)
    if isinstance(exp, int) and exp < int(datetime.now(tz=timezone.utc).timestamp()):
        raise HTTPException(status_code=401, detail="Google token expired.")
    if not payload.get("sub") or not payload.get("email"):
        raise HTTPException(status_code=401, detail="Google token missing profile.")
    return payload


def create_or_update_user(conn: sqlite3.Connection, profile: dict[str, Any]) -> dict[str, Any]:
    conn.execute(
        """
        INSERT INTO app_users (google_sub, email, name, picture)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(google_sub) DO UPDATE SET
            email = excluded.email,
            name = excluded.name,
            picture = excluded.picture,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            str(profile["sub"]),
            str(profile["email"]),
            profile.get("name"),
            profile.get("picture"),
        ),
    )
    row = conn.execute(
        "SELECT * FROM app_users WHERE google_sub = ?",
        (str(profile["sub"]),),
    ).fetchone()
    return dict(row)


def create_session(conn: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(tz=timezone.utc) + timedelta(days=SESSION_DAYS)
    expires_at = expires.isoformat()
    conn.execute(
        "INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires_at),
    )
    conn.commit()
    return {"token": token, "expiresAt": expires_at}


def session_user(conn: sqlite3.Connection, token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    row = conn.execute(
        """
        SELECT app_users.*
        FROM auth_sessions
        JOIN app_users ON app_users.id = auth_sessions.user_id
        WHERE auth_sessions.token = ?
          AND auth_sessions.expires_at > ?
        """,
        (token, datetime.now(tz=timezone.utc).isoformat()),
    ).fetchone()
    return dict(row) if row else None


def bearer_token(authorization: str | None = Header(default=None)) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid authorization header.")
    return authorization[len(prefix) :]


def require_user(conn: sqlite3.Connection, token: str | None) -> dict[str, Any]:
    user = session_user(conn, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return user
