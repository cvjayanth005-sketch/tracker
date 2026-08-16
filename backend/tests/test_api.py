from __future__ import annotations

import base64
import json

from fastapi.testclient import TestClient


def make_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("TRACKER_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("TRACKER_ALLOW_UNVERIFIED_GOOGLE", "1")
    monkeypatch.setenv("AUTH_RATE_LIMIT", "0")
    monkeypatch.setenv("AI_RATE_LIMIT", "0")
    monkeypatch.delenv("SUPABASE_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from app import main
    from app.database import init_db

    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    main.AUTH_RATE_LIMIT = 0
    main.AI_RATE_LIMIT = 0
    init_db()
    return TestClient(main.app)


def fake_google_credential(sub: str, email: str) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": sub, "email": email, "name": email.split("@")[0], "exp": 4102444800}).encode()
    ).decode().rstrip("=")
    return f"{header}.{payload}."


def auth_headers(client: TestClient, sub: str = "test-user", email: str = "test@example.com") -> dict[str, str]:
    login = client.post("/api/auth/google", json={"credential": fake_google_credential(sub, email)}).json()
    return {"Authorization": f"Bearer {login['session']['token']}"}


def test_health_and_seeded_phase(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    assert client.get("/api/health").json() == {"ok": True}
    assert client.get("/api/phase", headers=headers).json()["name"] == "Phase 1"


def test_google_form_login_redirects_with_session_token(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    credential = fake_google_credential("phone-user", "phone@example.com")
    response = client.post(
        "/api/auth/google",
        data={"credential": credential, "g_csrf_token": "csrf-token"},
        cookies={"g_csrf_token": "csrf-token"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    location = response.headers["location"]
    assert "google_session=" in location
    assert "expires=" in location


def test_google_form_login_rejects_csrf_mismatch(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    credential = fake_google_credential("csrf-user", "csrf@example.com")
    response = client.post(
        "/api/auth/google",
        data={"credential": credential, "g_csrf_token": "one"},
        cookies={"g_csrf_token": "two"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert "google_error=" in response.headers["location"]


def test_public_config_exposes_backend_google_client_id(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "backend-client-id.apps.googleusercontent.com")

    assert client.get("/api/config").json() == {
        "googleClientId": "backend-client-id.apps.googleusercontent.com"
    }


def test_daily_log_upsert_preserves_nullable_values(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    response = client.put("/api/day/2026-01-01", json={"weight_kg": 88.2, "protein_g": 164}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["weight_kg"] == 88.2
    assert data["protein_g"] == 164
    assert data["calories"] is None

    response = client.put("/api/day/2026-01-01", json={"steps": 11000}, headers=headers)
    data = response.json()
    assert data["weight_kg"] == 88.2
    assert data["steps"] == 11000
    assert data["calories"] is None


def test_import_csv_and_progress(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)
    csv_text = "date,weight,calories,protein,steps\n2026-01-01,88,2050,165,11000\n2026-01-08,87,2000,160,11200\n"

    result = client.post("/api/import", json={"csv_text": csv_text}, headers=headers).json()
    assert result == {"imported": 2, "skipped": 0}

    progress = client.get("/api/progress?date=2026-01-08", headers=headers).json()
    assert progress["latest_weight_kg"] == 87
    assert progress["compliance"]["protein"]["scheduled"] == 1


def test_settings_update(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    settings = client.put("/api/settings", json={"values": {"calorie_floor": 1800}}, headers=headers).json()

    assert settings["calorie_floor"] == 1800


def test_workout_progression_endpoint(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    payload = {
        "workout_name": "Upper A",
        "completed": True,
        "sets": [
            {"exercise": "Bench press", "set_number": 1, "weight": 70, "reps": 12, "rir": 2},
            {"exercise": "Bench press", "set_number": 2, "weight": 70, "reps": 12, "rir": 1},
            {"exercise": "Bench press", "set_number": 3, "weight": 70, "reps": 12, "rir": 1},
        ],
    }
    response = client.put("/api/workout/2026-01-01", json=payload, headers=headers)

    assert response.status_code == 200
    assert response.json()["progression"][0]["ready_to_increase_load"] is True


def test_coach_note_is_cached(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    first = client.post("/api/coach-note", json={}, headers=headers).json()
    second = client.post("/api/coach-note", json={}, headers=headers).json()

    assert first["state_hash"] == second["state_hash"]
    assert first["note"]


def test_session_token_is_hashed_at_rest(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("hash-user", "hash@example.com")},
    ).json()
    raw = login["session"]["token"]
    headers = {"Authorization": f"Bearer {raw}"}

    assert client.get("/api/auth/me", headers=headers).status_code == 200

    from app.auth import hash_session_token
    from app.database import connect

    with connect() as conn:
        stored = conn.execute("SELECT token FROM auth_sessions").fetchone()["token"]
    assert stored == hash_session_token(raw)
    assert stored != raw


def test_legacy_plaintext_session_is_upgraded_to_hash(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("legacy-user", "legacy@example.com")},
    ).json()
    raw = login["session"]["token"]

    from app.auth import hash_session_token
    from app.database import connect

    with connect() as conn:
        conn.execute("UPDATE auth_sessions SET token = ? WHERE token = ?", (raw, hash_session_token(raw)))
        conn.commit()

    headers = {"Authorization": f"Bearer {raw}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    with connect() as conn:
        stored = conn.execute("SELECT token FROM auth_sessions").fetchone()["token"]
    assert stored == hash_session_token(raw)


def test_unverified_google_flag_is_ignored_when_client_id_is_set(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "prod-client.apps.googleusercontent.com")
    monkeypatch.setenv("TRACKER_ALLOW_UNVERIFIED_GOOGLE", "1")

    def fail_open(*_args, **_kwargs):
        raise OSError("tokeninfo must be called")

    monkeypatch.setattr("urllib.request.urlopen", fail_open)
    response = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("prod-user", "prod@example.com")},
    )
    assert response.status_code == 401


def test_coach_note_cache_is_per_user(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    calls: list[str] = []

    def fake_note(summary, api_key, model):
        calls.append("hit")
        return f"note-{len(calls)}"

    monkeypatch.setattr("app.services.request_groq_note", fake_note)
    payload = {"summary": {"recommendation": {"headline": "Hold"}}, "rulesVersion": "1.0.0"}
    first = auth_headers(client, "cache-a", "a@example.com")
    second = auth_headers(client, "cache-b", "b@example.com")

    note_a = client.post("/api/coach-note", json=payload, headers=first)
    note_a_again = client.post("/api/coach-note", json=payload, headers=first)
    note_b = client.post("/api/coach-note", json=payload, headers=second)

    assert note_a.status_code == 200
    assert note_a.json()["note"] == "note-1"
    assert note_a_again.json()["note"] == "note-1"
    assert note_b.json()["note"] == "note-2"
    assert calls == ["hit", "hit"]


def test_frontend_state_sync_round_trip_and_conflict(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("sync-user", "sync@example.com")},
    ).json()
    headers = {"Authorization": f"Bearer {login['session']['token']}"}
    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "baseVersion": 0,
        "tables": {
            "dailyLogs": [{"date": "2026-01-01", "weightKg": 88, "calories": None}],
            "settings": [],
        },
    }

    assert client.get("/api/state/version", headers=headers).json() == {"version": 0}
    pushed = client.put("/api/state", json=doc, headers=headers)
    assert pushed.status_code == 200
    assert pushed.json()["version"] == 1
    assert client.get("/api/state/version", headers=headers).json() == {"version": 1}
    assert client.get("/api/state", headers=headers).json()["tables"]["dailyLogs"][0]["weightKg"] == 88

    stale = client.put("/api/state", json={**doc, "version": 2, "baseVersion": 0}, headers=headers)
    assert stale.status_code == 409


def test_state_sync_round_trips_tombstones(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("tomb-user", "tomb@example.com")},
    ).json()
    headers = {"Authorization": f"Bearer {login['session']['token']}"}
    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "baseVersion": 0,
        "tables": {"meals": [{"id": "keep", "date": "2026-01-01", "slot": "lunch", "name": "Rice"}]},
        "tombstones": [{"table": "meals", "id": "gone", "deletedAt": "2026-01-01T01:00:00.000Z"}],
    }

    assert client.put("/api/state", json=doc, headers=headers).status_code == 200
    pulled = client.get("/api/state", headers=headers).json()
    assert pulled["tables"]["meals"][0]["id"] == "keep"
    assert pulled["tombstones"][0]["id"] == "gone"
    assert pulled["tombstones"][0]["table"] == "meals"


def test_state_sync_requires_sign_in(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "baseVersion": 0,
        "tables": {},
    }

    assert client.get("/api/state/version").status_code == 401
    assert client.get("/api/state").status_code == 401
    assert client.put("/api/state", json=doc).status_code == 401


def test_legacy_sqlite_routes_require_sign_in(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    assert client.get("/api/today").status_code == 401
    assert client.get("/api/day/2026-01-01").status_code == 401
    assert client.put("/api/day/2026-01-01", json={"steps": 1}).status_code == 401
    assert client.get("/api/progress").status_code == 401
    assert client.post("/api/import", json={"csv_text": "date\n2026-01-01"}).status_code == 401
    assert client.get("/api/phase").status_code == 401
    assert client.put("/api/phase", json={"current_phase_id": 1}).status_code == 401
    assert client.get("/api/settings").status_code == 401
    assert client.put("/api/settings", json={"values": {}}).status_code == 401
    assert client.get("/api/workout/2026-01-01").status_code == 401
    assert client.put("/api/workout/2026-01-01", json={"workout_name": "Upper A"}).status_code == 401
    assert client.post("/api/runs", json={"local_date": "2026-01-01"}).status_code == 401
    assert client.get("/api/plan/timeline").status_code == 401
    assert client.post(
        "/api/plan/import/excel/preview",
        json={"filename": "plan.xlsx", "file_base64": "YQ==", "start_date": "2026-08-03"},
    ).status_code == 401
    assert client.post("/api/coach-note", json={}).status_code == 401


def test_legacy_sqlite_routes_are_hidden_when_cloud_is_on(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setattr("app.main.cloud_store.enabled", lambda: True)

    assert client.get("/api/today").status_code == 404
    assert client.get("/api/day/2026-01-01").status_code == 404
    assert client.post("/api/import", json={"csv_text": "date\n2026-01-01"}).status_code == 404
    assert client.get("/api/phase").status_code == 404
    assert client.get("/api/plan/timeline").status_code == 404


def test_import_rejects_oversized_csv(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    response = client.post(
        "/api/import",
        json={"csv_text": "x" * 1_000_001},
        headers=headers,
    )

    assert response.status_code == 422


def test_openapi_docs_disabled_by_default(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_cloud_status_hides_account_counts(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    assert client.get("/api/cloud/status").json() == {"enabled": False, "ok": False}

    import app.main as main

    monkeypatch.setattr(
        main.cloud_store,
        "status",
        lambda: {"enabled": True, "ok": True, "users": 99, "sessions": 12, "state_documents": 7},
    )
    assert client.get("/api/cloud/status").json() == {"enabled": True, "ok": True}


def test_security_headers_are_present(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "strict-transport-security" not in response.headers

    https = client.get("/api/health", headers={"x-forwarded-proto": "https"})
    assert https.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_state_document_rejects_oversized_body(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    import app.main as main

    main.STATE_BODY_MAX_BYTES = 800
    headers = auth_headers(client)
    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "baseVersion": 0,
        "tables": {"dailyLogs": [{"date": "2026-01-01", "notes": "x" * 2000}]},
    }

    assert client.put("/api/state", json=doc, headers=headers).status_code == 413


def test_google_accounts_get_separate_state_documents(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    first = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("google-a", "a@example.com")},
    ).json()
    second = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("google-b", "b@example.com")},
    ).json()

    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "baseVersion": 0,
        "tables": {"dailyLogs": [{"date": "2026-01-01", "weightKg": 88}]},
    }
    headers = {"Authorization": f"Bearer {first['session']['token']}"}
    assert client.put("/api/state", json=doc, headers=headers).status_code == 200
    assert client.get("/api/state/version", headers=headers).json() == {"version": 1}

    other_headers = {"Authorization": f"Bearer {second['session']['token']}"}
    assert client.get("/api/state/version", headers=other_headers).json() == {"version": 0}
    assert client.get("/api/state", headers=other_headers).json()["tables"] == {}


def test_state_sync_uses_supabase_store_when_configured(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://example")

    import app.main as main

    store = {"version": 0, "updatedAt": "", "tables": {}}

    def create_or_update_user(profile):
        assert profile["sub"] == "cloud-user"
        return {
            "id": 321,
            "google_sub": profile["sub"],
            "email": profile["email"],
            "name": profile["name"],
            "picture": profile.get("picture"),
        }

    def create_session(user_id):
        assert user_id == 321
        return {"token": "cloud-token", "expiresAt": "2099-01-01T00:00:00+00:00"}

    def session_user(token):
        if token != "cloud-token":
            return None
        return {"id": 321, "email": "cloud@example.com", "name": "Cloud", "picture": None}

    def get_state_version(user_id):
        assert user_id == 321
        return {"version": store["version"]}

    def get_state_document(user_id):
        assert user_id == 321
        return dict(store)

    def put_state_document(doc, user_id):
        assert user_id == 321
        if doc.get("baseVersion") != store["version"]:
            return {"conflict": True, "serverVersion": store["version"]}
        store.update(
            {
                "version": doc["version"],
                "updatedAt": doc["updatedAt"],
                "tables": doc["tables"],
            }
        )
        return dict(store)

    monkeypatch.setattr(main.cloud_store, "create_or_update_user", create_or_update_user)
    monkeypatch.setattr(main.cloud_store, "create_session", create_session)
    monkeypatch.setattr(main.cloud_store, "session_user", session_user)
    monkeypatch.setattr(main.cloud_store, "get_state_version", get_state_version)
    monkeypatch.setattr(main.cloud_store, "get_state_document", get_state_document)
    monkeypatch.setattr(main.cloud_store, "put_state_document", put_state_document)

    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("cloud-user", "cloud@example.com")},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['session']['token']}"}

    assert client.get("/api/state/version").status_code == 401
    assert client.get("/api/state/version", headers=headers).json() == {"version": 0}

    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "baseVersion": 0,
        "tables": {"dailyLogs": [{"date": "2026-01-01", "weightKg": 88}]},
    }
    assert client.put("/api/state", json=doc, headers=headers).status_code == 200
    assert client.get("/api/state", headers=headers).json()["tables"]["dailyLogs"][0]["weightKg"] == 88

    stale = {**doc, "version": 2, "baseVersion": 0}
    assert client.put("/api/state", json=stale, headers=headers).status_code == 409


def test_supabase_state_errors_return_service_unavailable(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("SUPABASE_DATABASE_URL", "postgresql://example")

    import app.main as main

    def fail_session_user(_token):
        raise RuntimeError("connection failed")

    monkeypatch.setattr(main.cloud_store, "session_user", fail_session_user)

    response = client.get("/api/state/version", headers={"Authorization": "Bearer broken-token"})

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "error": "cloud_database_unavailable",
        "message": "The backend could not reach the cloud database.",
    }
    assert "type" not in response.json()["detail"]
    assert "connection failed" not in str(response.json())


def test_google_sign_in_is_rate_limited_to_20_attempts(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    import app.main as main

    main.AUTH_RATE_LIMIT = 20
    headers = {"x-forwarded-for": "203.0.113.20"}

    for _ in range(20):
        response = client.post("/api/auth/google", json={"credential": "not-a-jwt"}, headers=headers)
        assert response.status_code == 401

    response = client.post("/api/auth/google", json={"credential": "not-a-jwt"}, headers=headers)
    assert response.status_code == 429


def test_auth_rate_limit_uses_rightmost_forwarded_ip(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    import app.main as main

    main.AUTH_RATE_LIMIT = 2
    spoofed = {"x-forwarded-for": "198.51.100.1, 203.0.113.88"}
    for _ in range(2):
        assert client.post("/api/auth/google", json={"credential": "not-a-jwt"}, headers=spoofed).status_code == 401
    assert client.post("/api/auth/google", json={"credential": "not-a-jwt"}, headers=spoofed).status_code == 429
    assert client.post(
        "/api/auth/google",
        json={"credential": "not-a-jwt"},
        headers={"x-forwarded-for": "198.51.100.1"},
    ).status_code == 401


def test_onboarding_draft_requires_auth_and_falls_back_without_groq(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    payload = {
        "answers": {
            "name": "Jay",
            "age": "28",
            "sex": "Male",
            "heightCm": "178",
            "currentWeightKg": "88",
            "goalWeightKg": "72",
            "activityLevel": "Moderate",
            "gymDaysPerWeek": "4",
            "desiredPace": "Moderate",
        },
        "pasted_text": "I prefer lifting and walking.",
    }

    assert client.post("/api/onboarding/draft", json=payload).status_code == 401

    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("onboard-user", "onboard@example.com")},
    ).json()
    response = client.post(
        "/api/onboarding/draft",
        json=payload,
        headers={"Authorization": f"Bearer {login['session']['token']}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "rules"
    assert data["profile"]["name"] == "Jay"
    assert data["targets"]["calories"] > 0
    assert data["phases"]
    assert data["sourceUsed"] is True


def test_frontend_coach_note_shape_is_supported(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    headers = auth_headers(client)
    payload = {
        "summary": {
            "recommendation": {
                "headline": "Hold",
                "detail": "On target - keep current plan.",
            }
        },
        "promptVersion": "1.0.0",
        "rulesVersion": "1.0.0",
    }

    response = client.post("/api/coach-note", json=payload, headers=headers)

    assert response.status_code == 200
    assert response.json()["note"] == "On target - keep current plan."
    assert response.json()["provider"] == "rules"


def test_coach_chat_requires_auth_and_returns_rules_fallback(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    payload = {
        "question": "What should I focus on today?",
        "context": {
            "dashboard": {"recommendation": {"headline": "On target - change nothing"}},
            "weekAverages": {"calories": 2050, "protein": 165, "steps": 9800},
        },
        "messages": [],
    }

    assert client.post("/api/coach-chat", json=payload).status_code == 401

    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("chat-user", "chat@example.com")},
    ).json()
    response = client.post(
        "/api/coach-chat",
        json=payload,
        headers={"Authorization": f"Bearer {login['session']['token']}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "rules"
    assert "On target" in data["answer"]


def test_coach_chat_fallback_uses_activity_context() -> None:
    from app.services import fallback_coach_chat

    answer = fallback_coach_chat(
        "How should I approach today's workout and recovery?",
        {
            "activity": {
                "today": {
                    "schedule": {
                        "gym": True,
                        "sessionType": "upper",
                        "runKm": 5,
                        "runType": "easy",
                    },
                    "sleepScore": 72,
                    "sleepScoreConfidence": "medium",
                },
                "recoveryConcern": {"reason": "short_sleep", "averageValue": 6.4},
                "adaptiveRecommendation": {
                    "headline": "Keep the session productive, not maximal",
                    "readinessScore": 63,
                    "exercises": [
                        {
                            "exerciseName": "Bench Press",
                            "targetSets": 3,
                            "repRangeMin": 6,
                            "repRangeMax": 10,
                        }
                    ],
                },
            }
        },
    )

    assert "upper plus 5 km easy" in answer
    assert "short sleep" in answer
    assert "63/100 readiness" in answer
    assert "Sleep score: 72/100 (medium confidence)" in answer
    assert "Bench Press: 3 sets of 6-10 reps" in answer


def test_frontend_coach_note_uses_groq_without_changing_rules(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    monkeypatch.setattr("app.services.request_groq_note", lambda summary, api_key, model: "Stay steady. Your trend is on plan.")

    response = client.post(
        "/api/coach-note",
        json={"summary": {"recommendation": {"headline": "Hold"}}, "rulesVersion": "1.0.0"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["note"] == "Stay steady. Your trend is on plan."
    assert response.json()["provider"] == "groq"
    assert response.json()["model"] == "openai/gpt-oss-20b"


def test_frontend_coach_note_falls_back_when_groq_fails(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    def fail(*_args):
        raise RuntimeError("temporary failure")

    monkeypatch.setattr("app.services.request_groq_note", fail)
    response = client.post(
        "/api/coach-note",
        json={"summary": {"recommendation": {"headline": "Hold"}}},
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    assert response.json()["note"] == "Hold"
    assert response.json()["provider"] == "rules"
    assert response.json()["fallback"] is True


def test_food_parse_requires_auth_and_falls_back_without_groq(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    payload = {"text": "eggs, toast", "defaultSlot": "breakfast"}

    assert client.post("/api/food/parse", json=payload).status_code == 401

    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("food-user", "food@example.com")},
    ).json()
    response = client.post(
        "/api/food/parse",
        json=payload,
        headers={"Authorization": f"Bearer {login['session']['token']}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "rules"
    assert data["needsManual"] is True
    assert [meal["name"] for meal in data["meals"]] == ["eggs", "toast"]


def test_ai_endpoints_are_rate_limited_per_user(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    import app.main as main

    main.AI_RATE_LIMIT = 2
    headers = auth_headers(client, sub="ai-limit-user", email="ai-limit@example.com")
    payload = {"text": "eggs", "defaultSlot": "breakfast"}

    assert client.post("/api/food/parse", json=payload, headers=headers).status_code == 200
    assert client.post("/api/food/parse", json=payload, headers=headers).status_code == 200
    assert client.post("/api/food/parse", json=payload, headers=headers).status_code == 429


def test_coach_note_rejects_oversized_summary(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    response = client.post(
        "/api/coach-note",
        json={"summary": {"detail": "x" * 50_100}},
        headers=headers,
    )

    assert response.status_code == 422


def test_food_parse_endpoint_returns_groq_estimate(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    monkeypatch.setattr(
        "app.services.request_groq_food_parse",
        lambda text, slot, api_key, model: {
            "meals": [
                {
                    "name": "roti",
                    "slot": slot,
                    "calories": 80,
                    "proteinG": 3,
                    "carbsG": 15,
                    "fatG": 1,
                }
            ],
            "summary": "One roti.",
        },
    )
    login = client.post(
        "/api/auth/google",
        json={"credential": fake_google_credential("food-ai", "food-ai@example.com")},
    ).json()

    response = client.post(
        "/api/food/parse",
        json={"text": "1 roti", "defaultSlot": "lunch"},
        headers={"Authorization": f"Bearer {login['session']['token']}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "groq"
    assert data["model"] == "openai/gpt-oss-20b"
    assert data["meals"][0]["calories"] == 80
    assert data["needsManual"] is False


def _ip_request(headers: dict[str, str]):
    """Minimal stand-in for a Request: client_ip only reads headers and .client."""
    from types import SimpleNamespace

    return SimpleNamespace(headers=headers, client=SimpleNamespace(host="203.0.113.9"))


def test_client_ip_uses_rightmost_forwarded_entry(monkeypatch):
    from app import main

    # Leftmost entries are caller-supplied; only the rightmost is appended by our
    # own proxy, so a forged prefix must not change the bucket.
    monkeypatch.setattr(main, "TRUSTED_PROXY_SECRET", "")
    request = _ip_request({"x-forwarded-for": "1.1.1.1, 2.2.2.2, 9.9.9.9"})
    assert main.client_ip(request) == "9.9.9.9"


def test_client_ip_trusts_forwarded_visitor_only_with_the_shared_secret(monkeypatch):
    from app import main

    monkeypatch.setattr(main, "TRUSTED_PROXY_SECRET", "s3cret")
    signed = _ip_request(
        {
            "x-forwarded-for": "8.8.8.8, 5.5.5.5",
            "x-tracker-client-ip": "70.70.70.70",
            "x-tracker-proxy-secret": "s3cret",
        }
    )
    assert main.client_ip(signed) == "70.70.70.70"

    # Same headers, wrong secret: the claim is ignored rather than believed.
    forged = _ip_request(
        {
            "x-forwarded-for": "8.8.8.8, 5.5.5.5",
            "x-tracker-client-ip": "70.70.70.70",
            "x-tracker-proxy-secret": "wrong",
        }
    )
    assert main.client_ip(forged) == "5.5.5.5"


def test_client_ip_ignores_the_visitor_header_when_no_secret_is_configured(monkeypatch):
    from app import main

    # Unconfigured deployments must not become spoofable by adding a header.
    monkeypatch.setattr(main, "TRUSTED_PROXY_SECRET", "")
    request = _ip_request(
        {"x-forwarded-for": "8.8.8.8, 5.5.5.5", "x-tracker-client-ip": "70.70.70.70"}
    )
    assert main.client_ip(request) == "5.5.5.5"
