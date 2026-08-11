from __future__ import annotations

import base64
import json

from fastapi.testclient import TestClient


def make_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("TRACKER_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("TRACKER_ALLOW_UNVERIFIED_GOOGLE", "1")
    monkeypatch.delenv("SUPABASE_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from app.database import init_db
    from app.main import app

    init_db()
    return TestClient(app)


def fake_google_credential(sub: str, email: str) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": sub, "email": email, "name": email.split("@")[0], "exp": 4102444800}).encode()
    ).decode().rstrip("=")
    return f"{header}.{payload}."


def test_health_and_seeded_phase(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    assert client.get("/api/health").json() == {"ok": True}
    assert client.get("/api/phase").json()["name"] == "Phase 1"


def test_public_config_exposes_backend_google_client_id(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "backend-client-id.apps.googleusercontent.com")
    client = make_client(tmp_path, monkeypatch)

    assert client.get("/api/config").json() == {
        "googleClientId": "backend-client-id.apps.googleusercontent.com"
    }


def test_daily_log_upsert_preserves_nullable_values(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    response = client.put("/api/day/2026-01-01", json={"weight_kg": 88.2, "protein_g": 164})
    assert response.status_code == 200
    data = response.json()
    assert data["weight_kg"] == 88.2
    assert data["protein_g"] == 164
    assert data["calories"] is None

    response = client.put("/api/day/2026-01-01", json={"steps": 11000})
    data = response.json()
    assert data["weight_kg"] == 88.2
    assert data["steps"] == 11000
    assert data["calories"] is None


def test_import_csv_and_progress(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    csv_text = "date,weight,calories,protein,steps\n2026-01-01,88,2050,165,11000\n2026-01-08,87,2000,160,11200\n"

    result = client.post("/api/import", json={"csv_text": csv_text}).json()
    assert result == {"imported": 2, "skipped": 0}

    progress = client.get("/api/progress?date=2026-01-08").json()
    assert progress["latest_weight_kg"] == 87
    assert progress["compliance"]["protein"]["scheduled"] == 1


def test_settings_update(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    settings = client.put("/api/settings", json={"values": {"calorie_floor": 1800}}).json()

    assert settings["calorie_floor"] == 1800


def test_workout_progression_endpoint(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    payload = {
        "workout_name": "Upper A",
        "completed": True,
        "sets": [
            {"exercise": "Bench press", "set_number": 1, "weight": 70, "reps": 12, "rir": 2},
            {"exercise": "Bench press", "set_number": 2, "weight": 70, "reps": 12, "rir": 1},
            {"exercise": "Bench press", "set_number": 3, "weight": 70, "reps": 12, "rir": 1},
        ],
    }
    response = client.put("/api/workout/2026-01-01", json=payload)

    assert response.status_code == 200
    assert response.json()["progression"][0]["ready_to_increase_load"] is True


def test_coach_note_is_cached(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    first = client.post("/api/coach-note", json={}).json()
    second = client.post("/api/coach-note", json={}).json()

    assert first["state_hash"] == second["state_hash"]
    assert first["note"]


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
    assert response.json()["detail"]["error"] == "cloud_database_unavailable"
    assert response.json()["detail"]["type"] == "RuntimeError"


def test_google_sign_in_is_rate_limited_to_20_attempts(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    headers = {"x-forwarded-for": "203.0.113.20"}

    for _ in range(20):
        response = client.post("/api/auth/google", json={"credential": "not-a-jwt"}, headers=headers)
        assert response.status_code == 401

    response = client.post("/api/auth/google", json={"credential": "not-a-jwt"}, headers=headers)
    assert response.status_code == 429


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

    response = client.post("/api/coach-note", json=payload)

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


def test_frontend_coach_note_uses_groq_without_changing_rules(tmp_path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    monkeypatch.setattr("app.services.request_groq_note", lambda summary, api_key, model: "Stay steady. Your trend is on plan.")

    response = client.post(
        "/api/coach-note",
        json={"summary": {"recommendation": {"headline": "Hold"}}, "rulesVersion": "1.0.0"},
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
    )

    assert response.status_code == 200
    assert response.json()["note"] == "Hold"
    assert response.json()["provider"] == "rules"
    assert response.json()["fallback"] is True
