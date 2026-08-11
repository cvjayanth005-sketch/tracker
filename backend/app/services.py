from __future__ import annotations

import csv
import base64
import hashlib
import io
import json
import os
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Mapping

import httpx
from pypdf import PdfReader

from .database import get_settings, row_to_dict
from .excel_plan import resolve_phase_targets
from .rules import (
    DayMetric,
    PhaseTarget,
    calorie_compliance,
    calorie_recommendation,
    completion_ratio,
    double_progression_ready,
    phase_review_eligibility,
    target_compliance,
    trailing_weight_average,
    weekly_average_change,
    weight_trend_series,
)


DAY_FIELDS = [
    "weight_kg",
    "calories",
    "protein_g",
    "steps",
    "run_completed",
    "gym_completed",
    "breakfast_completed",
    "lunch_completed",
    "pre_workout_completed",
    "post_workout_completed",
    "dinner_completed",
    "sleep_hours",
    "notes",
    "recovery",
    "hunger",
    "energy",
    "calorie_target_override",
]

BOOL_FIELDS = {
    "run_completed",
    "gym_completed",
    "breakfast_completed",
    "lunch_completed",
    "pre_workout_completed",
    "post_workout_completed",
    "dinner_completed",
}


def parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def row_to_day_metric(row: sqlite3.Row) -> DayMetric:
    return DayMetric(
        date=parse_date(row["local_date"]),
        weight_kg=row["weight_kg"],
        calories=row["calories"],
        protein_g=row["protein_g"],
        steps=row["steps"],
        gym_completed=bool(row["gym_completed"]) if row["gym_completed"] is not None else None,
        sleep_hours=row["sleep_hours"],
        recovery=row["recovery"],
        hunger=row["hunger"],
        energy=row["energy"],
    )


def row_to_phase(row: Mapping[str, Any]) -> PhaseTarget:
    return PhaseTarget(
        id=row["id"],
        name=row["name"],
        order_index=row["order_index"],
        start_weight_kg=row["start_weight_kg"],
        end_weight_kg=row["end_weight_kg"],
        calorie_target=row["calorie_target"],
        protein_min_g=row["protein_min_g"],
        protein_max_g=row["protein_max_g"],
        steps_target=row["steps_target"],
        weekday_run_km=row["weekday_run_km"],
        sunday_run_km=row["sunday_run_km"],
        workout_days_per_week=row["workout_days_per_week"],
    )


def serialize_day(row: sqlite3.Row | None) -> dict[str, Any] | None:
    data = row_to_dict(row)
    if data is None:
        return None
    for field in BOOL_FIELDS:
        if data.get(field) is not None:
            data[field] = bool(data[field])
    return data


def get_current_phase(conn: sqlite3.Connection) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT phases.*
        FROM user_profile
        JOIN phases ON phases.id = user_profile.current_phase_id
        WHERE user_profile.id = 1
        """
    ).fetchone()
    if row is None:
        raise ValueError("Current phase is not configured.")
    return row


def all_day_metrics(conn: sqlite3.Connection) -> list[DayMetric]:
    rows = conn.execute("SELECT * FROM daily_logs ORDER BY local_date").fetchall()
    return [row_to_day_metric(row) for row in rows]


def get_or_create_day(conn: sqlite3.Connection, local_date: date) -> dict[str, Any]:
    conn.execute(
        "INSERT OR IGNORE INTO daily_logs (local_date) VALUES (?)",
        (local_date.isoformat(),),
    )
    conn.commit()
    return serialize_day(conn.execute("SELECT * FROM daily_logs WHERE local_date = ?", (local_date.isoformat(),)).fetchone())


def upsert_day(conn: sqlite3.Connection, local_date: date, payload: dict[str, Any]) -> dict[str, Any]:
    get_or_create_day(conn, local_date)
    clean = {key: value for key, value in payload.items() if key in DAY_FIELDS}
    for field in BOOL_FIELDS:
        if field in clean and clean[field] is not None:
            clean[field] = 1 if clean[field] else 0
    if clean:
        assignments = ", ".join(f"{key} = ?" for key in clean)
        conn.execute(
            f"UPDATE daily_logs SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE local_date = ?",
            (*clean.values(), local_date.isoformat()),
        )
    conn.commit()
    return get_or_create_day(conn, local_date)


def planned_run_for_date(phase: Mapping[str, Any], local_date: date) -> float:
    return phase["sunday_run_km"] if local_date.weekday() == 6 else phase["weekday_run_km"]


def planned_workout_for_date(settings: dict[str, Any], local_date: date) -> str:
    split = settings.get("workout_split", {})
    return split.get(local_date.strftime("%A").lower(), "Rest")


def daily_completion(day: dict[str, Any], phase: Mapping[str, Any], local_date: date) -> dict[str, Any]:
    items = [
        day.get("breakfast_completed"),
        day.get("lunch_completed"),
        day.get("pre_workout_completed"),
        day.get("post_workout_completed"),
        day.get("dinner_completed"),
        day.get("gym_completed") if local_date.weekday() != 6 else None,
        day.get("run_completed"),
        day.get("sleep_hours") is not None and day["sleep_hours"] >= 8,
        day.get("protein_g") is not None and day["protein_g"] >= phase["protein_min_g"],
        day.get("calories") is not None and phase["calorie_target"] is not None and day["calories"] <= phase["calorie_target"] + 100,
        day.get("steps") is not None and day["steps"] >= phase["steps_target"],
    ]
    result = completion_ratio(items)
    return {"completed": result.completed, "scheduled": result.scheduled, "percent": result.percent}


def build_today(conn: sqlite3.Connection, local_date: date) -> dict[str, Any]:
    day = get_or_create_day(conn, local_date)
    phase = resolve_phase_targets(conn, get_current_phase(conn), local_date)
    settings = get_settings(conn)
    metrics = all_day_metrics(conn)
    weekly_change = weekly_average_change(metrics, local_date)
    compliance = build_compliance(metrics, phase, local_date)
    recovery_values = [item.recovery for item in metrics if item.recovery is not None and local_date - timedelta(days=14) <= item.date <= local_date]
    recovery_avg = round(sum(recovery_values) / len(recovery_values), 2) if recovery_values else None
    calorie_target = day.get("calorie_target_override") or phase["calorie_target"]
    recommendation = calorie_recommendation(
        weekly_change,
        compliance["calories"]["percent"],
        calorie_target,
        settings.get("calorie_floor", 1700),
        prior_cut_count=0,
        low_loss_weeks=count_low_loss_weeks(metrics, local_date),
        recovery_avg=recovery_avg,
    )
    return {
        "date": local_date.isoformat(),
        "day": day,
        "phase": phase,
        "targets": {
            "calories": calorie_target,
            "protein_min_g": phase["protein_min_g"],
            "protein_max_g": phase["protein_max_g"],
            "steps": phase["steps_target"],
            "run_km": planned_run_for_date(phase, local_date),
            "workout": planned_workout_for_date(settings, local_date),
            "sleep_hours": 8,
        },
        "trend": {
            "weight_7_day_avg": trailing_weight_average(metrics, local_date),
            "weekly_change_kg": weekly_change,
        },
        "completion": daily_completion(day, phase, local_date),
        "calorie_recommendation": recommendation.__dict__,
    }


def build_compliance(metrics: list[DayMetric], phase: Mapping[str, Any], end_date: date) -> dict[str, Any]:
    start = end_date - timedelta(days=6)
    recent = [item for item in metrics if start <= item.date <= end_date]
    calories_target = phase["calorie_target"] or 10**9
    return {
        "calories": calorie_compliance([item.calories for item in recent], calories_target).__dict__,
        "protein": target_compliance([item.protein_g for item in recent], phase["protein_min_g"]).__dict__,
        "steps": target_compliance([item.steps for item in recent], phase["steps_target"]).__dict__,
        "gym": completion_ratio([item.gym_completed for item in recent if item.date.weekday() != 6], scheduled=phase["workout_days_per_week"]).__dict__,
    }


def count_low_loss_weeks(metrics: list[DayMetric], end_date: date) -> int:
    count = 0
    for offset in (0, 7, 14):
        change = weekly_average_change(metrics, end_date - timedelta(days=offset))
        if change is None or -change >= 0.3:
            break
        count += 1
    return count


def build_progress(conn: sqlite3.Connection, end_date: date | None = None) -> dict[str, Any]:
    if end_date is None:
        end_date = date.today()
    phase_row = resolve_phase_targets(conn, get_current_phase(conn), end_date)
    phase = row_to_phase(phase_row)
    metrics = all_day_metrics(conn)
    latest_weight = next((item.weight_kg for item in reversed(metrics) if item.weight_kg is not None), None)
    profile = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    measurements = [row_to_dict(row) for row in conn.execute("SELECT * FROM body_measurements ORDER BY local_date").fetchall()]
    compliance = build_compliance(metrics, phase_row, end_date)
    phase_review = phase_review_eligibility(metrics, phase, end_date, get_settings(conn).get("phase_dwell_days", 5))
    return {
        "phase": phase_row,
        "latest_weight_kg": latest_weight,
        "goal_weight_min_kg": profile["goal_weight_min_kg"],
        "goal_weight_max_kg": profile["goal_weight_max_kg"],
        "total_lost_kg": round(profile["start_weight_kg"] - latest_weight, 2) if latest_weight is not None else None,
        "remaining_to_goal_kg": round(latest_weight - profile["goal_weight_max_kg"], 2) if latest_weight is not None else None,
        "weight_7_day_avg": trailing_weight_average(metrics, end_date),
        "weekly_change_kg": weekly_average_change(metrics, end_date),
        "weight_trend": weight_trend_series(metrics),
        "waist_measurements": measurements,
        "compliance": compliance,
        "phase_review": phase_review,
    }


def import_rows(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> dict[str, int]:
    imported = 0
    skipped = 0
    for raw in rows:
        raw_date = raw.get("local_date") or raw.get("date") or raw.get("Date")
        if not raw_date:
            skipped += 1
            continue
        local_date = parse_date(str(raw_date)[:10])
        payload: dict[str, Any] = {}
        aliases = {
            "Weight": "weight_kg",
            "weight": "weight_kg",
            "Calories": "calories",
            "calories": "calories",
            "Protein": "protein_g",
            "protein": "protein_g",
            "Steps": "steps",
            "steps": "steps",
            "Notes": "notes",
            "notes": "notes",
        }
        for key, value in raw.items():
            field = aliases.get(key, key)
            if field in DAY_FIELDS and value not in ("", None):
                payload[field] = coerce_value(field, value)
        upsert_day(conn, local_date, payload)
        imported += 1
    return {"imported": imported, "skipped": skipped}


def import_csv(conn: sqlite3.Connection, csv_text: str) -> dict[str, int]:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    return import_rows(conn, list(reader))


def coerce_value(field: str, value: Any) -> Any:
    if field in BOOL_FIELDS:
        return str(value).strip().lower() in {"1", "true", "yes", "y", "✓", "checked", "complete"}
    if field in {"calories", "steps", "recovery", "hunger", "energy", "calorie_target_override"}:
        return int(float(value))
    if field in {"weight_kg", "protein_g", "sleep_hours"}:
        return float(value)
    return value


def upsert_workout(conn: sqlite3.Connection, local_date: date, payload: dict[str, Any]) -> dict[str, Any]:
    existing = conn.execute("SELECT * FROM workouts WHERE local_date = ? LIMIT 1", (local_date.isoformat(),)).fetchone()
    if existing is None:
        cursor = conn.execute(
            "INSERT INTO workouts (local_date, workout_name, completed, notes) VALUES (?, ?, ?, ?)",
            (
                local_date.isoformat(),
                payload["workout_name"],
                bool_to_int(payload.get("completed")),
                payload.get("notes"),
            ),
        )
        workout_id = cursor.lastrowid
    else:
        workout_id = existing["id"]
        conn.execute(
            "UPDATE workouts SET workout_name = ?, completed = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (payload["workout_name"], bool_to_int(payload.get("completed")), payload.get("notes"), workout_id),
        )
        conn.execute("DELETE FROM workout_sets WHERE workout_id = ?", (workout_id,))
    for item in payload.get("sets", []):
        conn.execute(
            """
            INSERT INTO workout_sets (
                workout_id, exercise, set_number, weight, unit, reps, rir,
                target_min_reps, target_max_reps, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                workout_id,
                item["exercise"],
                item["set_number"],
                item.get("weight"),
                item.get("unit", "kg"),
                item.get("reps"),
                item.get("rir"),
                item.get("target_min_reps", 8),
                item.get("target_max_reps", 12),
                item.get("notes"),
            ),
        )
    conn.commit()
    return get_workout(conn, local_date)


def get_workout(conn: sqlite3.Connection, local_date: date) -> dict[str, Any]:
    workout = conn.execute("SELECT * FROM workouts WHERE local_date = ? LIMIT 1", (local_date.isoformat(),)).fetchone()
    if workout is None:
        return {"local_date": local_date.isoformat(), "workout": None, "sets": [], "progression": []}
    sets = [row_to_dict(row) for row in conn.execute("SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY exercise, set_number", (workout["id"],)).fetchall()]
    progression = []
    by_exercise: dict[str, list[dict[str, Any]]] = {}
    for item in sets:
        by_exercise.setdefault(item["exercise"], []).append(item)
    for exercise, exercise_sets in by_exercise.items():
        first = exercise_sets[0]
        progression.append(
            {
                "exercise": exercise,
                "ready_to_increase_load": double_progression_ready(
                    exercise_sets,
                    first.get("target_min_reps", 8),
                    first.get("target_max_reps", 12),
                ),
            }
        )
    data = row_to_dict(workout)
    data["completed"] = bool(data["completed"]) if data["completed"] is not None else None
    return {"local_date": local_date.isoformat(), "workout": data, "sets": sets, "progression": progression}


def bool_to_int(value: bool | None) -> int | None:
    if value is None:
        return None
    return 1 if value else 0


def create_run(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    conn.execute(
        """
        INSERT INTO runs (local_date, distance_km, duration_minutes, pace_min_per_km, run_type, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            payload["local_date"].isoformat() if hasattr(payload["local_date"], "isoformat") else payload["local_date"],
            payload.get("distance_km"),
            payload.get("duration_minutes"),
            payload.get("pace_min_per_km"),
            payload.get("run_type", "Easy"),
            payload.get("notes"),
        ),
    )
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone())


def cached_coach_note(conn: sqlite3.Connection, force: bool = False) -> dict[str, Any]:
    state = build_progress(conn)
    summary = json.dumps(state, sort_keys=True)
    state_hash = hashlib.sha256(summary.encode("utf-8")).hexdigest()
    cached = conn.execute("SELECT * FROM ai_note_cache WHERE state_hash = ?", (state_hash,)).fetchone()
    if cached is not None and not force:
        return row_to_dict(cached)
    note = make_rule_based_note(state)
    conn.execute(
        """
        INSERT INTO ai_note_cache (state_hash, note, state_summary_json)
        VALUES (?, ?, ?)
        ON CONFLICT(state_hash) DO UPDATE SET note = excluded.note, state_summary_json = excluded.state_summary_json
        """,
        (state_hash, note, summary),
    )
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM ai_note_cache WHERE state_hash = ?", (state_hash,)).fetchone())


def cached_coach_note_for_summary(
    conn: sqlite3.Connection,
    summary: dict[str, Any],
    prompt_version: str | None,
    rules_version: str | None,
    force: bool = False,
) -> dict[str, Any]:
    groq_key = os.environ.get("GROQ_API_KEY")
    groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    narrator = "groq" if groq_key else "rules"
    state = {
        "summary": summary,
        "promptVersion": prompt_version,
        "rulesVersion": rules_version,
        "narrator": narrator,
        "model": groq_model if groq_key else None,
    }
    payload = json.dumps(state, sort_keys=True)
    state_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    cached = conn.execute("SELECT * FROM ai_note_cache WHERE state_hash = ?", (state_hash,)).fetchone()
    if cached is not None and not force:
        return {**row_to_dict(cached), "provider": narrator, "model": groq_model if groq_key else None}

    fallback = make_frontend_summary_note(summary)
    provider = "rules"
    model: str | None = None
    if groq_key:
        try:
            note = request_groq_note(summary, groq_key, groq_model)
            provider = "groq"
            model = groq_model
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError, IndexError):
            # A narrator outage must never make the dashboard unavailable. Do
            # not cache the transient fallback under the Groq key: the next
            # request should get another chance to use the configured model.
            return {
                "state_hash": state_hash,
                "note": fallback,
                "state_summary_json": payload,
                "provider": "rules",
                "model": None,
                "fallback": True,
            }
    else:
        note = fallback
    conn.execute(
        """
        INSERT INTO ai_note_cache (state_hash, note, state_summary_json)
        VALUES (?, ?, ?)
        ON CONFLICT(state_hash) DO UPDATE SET note = excluded.note, state_summary_json = excluded.state_summary_json
        """,
        (state_hash, note, payload),
    )
    conn.commit()
    stored = row_to_dict(conn.execute("SELECT * FROM ai_note_cache WHERE state_hash = ?", (state_hash,)).fetchone())
    return {**stored, "provider": provider, "model": model}


def request_groq_note(summary: dict[str, Any], api_key: str, model: str) -> str:
    response = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.35,
            "max_completion_tokens": 180,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You narrate a personal fat-loss and hybrid-training tracker. "
                        "The deterministic rules in the supplied JSON have already made the decision. "
                        "Never change the recommendation, calorie target, thresholds, or phase status. "
                        "Write 2-4 concise, encouraging sentences grounded only in the supplied data. "
                        "Be direct and warm, avoid shame, diagnosis, medical claims, and invented facts."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(summary, sort_keys=True),
                },
            ],
        },
        timeout=12.0,
    )
    response.raise_for_status()
    data = response.json()
    note = data["choices"][0]["message"]["content"]
    if not isinstance(note, str) or not note.strip():
        raise ValueError("Groq returned an empty coaching note.")
    return note.strip()[:900]


def fallback_coach_chat(_question: str, context: dict[str, Any]) -> str:
    dashboard = context.get("dashboard") if isinstance(context, dict) else {}
    recommendation = dashboard.get("recommendation") if isinstance(dashboard, dict) else {}
    headline = recommendation.get("headline") if isinstance(recommendation, dict) else None
    week = context.get("weekAverages") if isinstance(context, dict) else {}
    parts = []
    if isinstance(headline, str) and headline:
        parts.append(f"Current priority: {headline}.")
    if isinstance(week, dict):
        calories = week.get("calories")
        protein = week.get("protein")
        steps = week.get("steps")
        if calories or protein or steps:
            parts.append(
                "Recent averages: "
                + ", ".join(
                    item
                    for item in [
                        f"{round(calories)} kcal" if isinstance(calories, (int, float)) else "",
                        f"{round(protein)} g protein" if isinstance(protein, (int, float)) else "",
                        f"{round(steps)} steps" if isinstance(steps, (int, float)) else "",
                    ]
                    if item
                )
                + "."
            )
    parts.append(
        "The AI coach is offline, so keep the deterministic plan as the source of truth. "
        "Ask again after the Groq connection is available for a deeper read."
    )
    return " ".join(parts)


def request_groq_chat(
    question: str,
    context: dict[str, Any],
    history: list[dict[str, str]],
    api_key: str,
    model: str,
) -> str:
    clipped_history = [
        {
            "role": item.get("role", "user") if item.get("role") in {"user", "assistant"} else "user",
            "content": str(item.get("content", ""))[:900],
        }
        for item in history[-8:]
        if str(item.get("content", "")).strip()
    ]
    response = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.35,
            "max_completion_tokens": 520,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a friendly AI coach in a fat-loss and hybrid-training tracker. "
                        "Reply like a normal chat, not like a report. Answer the user's exact question first. "
                        "Use tracker data only when it helps the answer, and mention only the few numbers that matter. "
                        "Do not start with headings like 'What the tracker shows' unless the user asks for a summary. "
                        "Do not dump every calorie, protein, step, workout, sleep, and weight field in one answer. "
                        "Avoid generic checklists. Prefer 1-3 short paragraphs, or 3 bullets max if bullets are clearer. "
                        "If the user asks a casual/simple question, give a casual/simple answer. "
                        "Do not invent app features, reminders, meal-plan tools, integrations, missing logs, or new sessions. "
                        "Do not change targets, phases, calories, or workouts; say those require the app controls. "
                        "For injuries, medical limitations, chest pain, fainting, eating disorder signals, or severe symptoms, "
                        "recommend a qualified professional and avoid aggressive advice. "
                        "Keep the tone direct, warm, and human."
                    ),
                },
                {
                    "role": "user",
                    "content": "Tracker context JSON:\n" + json.dumps(context, sort_keys=True)[:12000],
                },
                *clipped_history,
                {"role": "user", "content": question},
            ],
        },
        timeout=18.0,
    )
    response.raise_for_status()
    data = response.json()
    answer = data["choices"][0]["message"]["content"]
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("Groq returned an empty chat response.")
    return answer.strip()[:2200]


def coach_chat(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question", "")).strip()
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
    groq_key = os.environ.get("GROQ_API_KEY")
    groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    if groq_key:
        try:
            return {
                "answer": request_groq_chat(question, context, messages, groq_key, groq_model),
                "provider": "groq",
                "model": groq_model,
            }
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError, IndexError) as exc:
            return {
                "answer": fallback_coach_chat(question, context),
                "provider": "rules",
                "model": None,
                "fallback": True,
                "fallbackReason": f"{type(exc).__name__}: {str(exc)[:300]}",
            }
    return {"answer": fallback_coach_chat(question, context), "provider": "rules", "model": None}


def extract_pdf_text(file_base64: str) -> str:
    try:
        raw = base64.b64decode(file_base64, validate=True)
    except Exception as exc:
        raise ValueError("Uploaded PDF was not valid base64.") from exc
    try:
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise ValueError("Could not read text from that PDF.") from exc
    text = text.strip()
    if not text:
        raise ValueError("That PDF has no readable text layer. Scanned PDFs are not supported yet.")
    return text[:20_000]


def onboarding_source_text(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    pasted = payload.get("pasted_text")
    if isinstance(pasted, str) and pasted.strip():
        chunks.append(pasted.strip()[:20_000])
    file_base64 = payload.get("file_base64")
    file_name = str(payload.get("file_name") or "").lower()
    if isinstance(file_base64, str) and file_base64.strip():
        if not file_name.endswith(".pdf"):
            raise ValueError("Only readable PDF upload is supported for onboarding v1.")
        chunks.append(extract_pdf_text(file_base64))
    return "\n\n".join(chunks)


def _num(value: Any, default: float, lo: float, hi: float) -> float:
    try:
        parsed = float(str(value).replace("kg", "").replace("cm", "").strip())
    except (TypeError, ValueError):
        parsed = default
    return max(lo, min(hi, parsed))


def _int(value: Any, default: int, lo: int, hi: int) -> int:
    return int(round(_num(value, default, lo, hi)))


def fallback_onboarding_draft(answers: dict[str, Any], source_text: str = "") -> dict[str, Any]:
    current_weight = _num(answers.get("currentWeightKg") or answers.get("current_weight_kg"), 88, 40, 250)
    goal_weight = _num(answers.get("goalWeightKg") or answers.get("goal_weight_kg"), max(45, current_weight - 12), 40, current_weight)
    height_cm = _num(answers.get("heightCm") or answers.get("height_cm"), 175, 120, 230)
    age = _int(answers.get("age"), 28, 13, 90)
    gym_days = _int(answers.get("gymDaysPerWeek") or answers.get("gym_days_per_week"), 3, 0, 6)
    sex = str(answers.get("sex") or "").lower()
    pace = str(answers.get("desiredPace") or answers.get("desired_pace") or "moderate").lower()
    activity = str(answers.get("activityLevel") or answers.get("activity_level") or "moderate").lower()
    birth_year = datetime.now().year - age

    bmr = 10 * current_weight + 6.25 * height_cm - 5 * age + (-161 if sex.startswith("f") else 5)
    factor = 1.35 if "sedentary" in activity else 1.55 if "active" in activity else 1.45
    deficit = 350 if pace == "steady" else 650 if pace == "aggressive" else 500
    calories = int(round(max(1500, min(3200, bmr * factor - deficit)) / 50) * 50)
    if sex.startswith("f"):
        calories = max(1300, calories)
    protein = int(round(max(1.8 * goal_weight, 1.6 * current_weight) / 5) * 5)
    steps = 8000 if "sedentary" in activity else 11000 if "active" in activity else 9500
    weekly_run = 0 if gym_days >= 5 else 8 if gym_days <= 2 else 6
    total_loss = max(0, current_weight - goal_weight)
    phase_count = 1 if total_loss < 4 else min(5, max(2, int(round(total_loss / 4))))
    step = total_loss / phase_count if phase_count else 0
    phases = []
    start = current_weight
    for index in range(phase_count):
        target = goal_weight if index == phase_count - 1 else round(current_weight - step * (index + 1), 1)
        phase_calories = max(1300 if sex.startswith("f") else 1500, calories - index * 75)
        phases.append(
            {
                "name": f"Phase {index + 1}",
                "startWeightKg": round(start, 1),
                "targetWeightKg": round(target, 1),
                "calories": int(phase_calories),
                "proteinG": protein,
                "steps": steps,
                "weeklyRunKmTarget": weekly_run,
                "notes": "AI fallback draft from onboarding answers.",
            }
        )
        start = target
    cautions: list[str] = []
    red_flags = " ".join(str(answers.get(key, "")) for key in ("injuries", "medicalLimitations", "medical_limitations")).lower()
    if any(term in red_flags for term in ("diabetes", "heart", "pregnan", "eating disorder", "injury", "pain")):
        cautions.append("Medical or injury limits were mentioned. Keep the plan conservative and check with a qualified professional before aggressive dieting or training.")
    if pace == "aggressive":
        cautions.append("Aggressive fat loss can affect recovery and performance. The rules engine should slow changes if logging shows poor recovery.")
    return {
        "provider": "rules",
        "profileSummary": f"{answers.get('name') or 'User'} wants to move from {current_weight:.1f} kg toward {goal_weight:.1f} kg with {gym_days} gym days per week.",
        "planStartDate": date.today().isoformat(),
        "profile": {
            "name": answers.get("name") or None,
            "birthYear": birth_year,
            "heightCm": round(height_cm, 1),
            "startWeightKg": round(current_weight, 1),
            "goalWeightKg": round(goal_weight, 1),
        },
        "targets": {
            "calories": calories,
            "proteinG": protein,
            "steps": steps,
            "sleepHours": 7.5,
            "gymDaysPerWeek": gym_days,
            "weeklyRunKmTarget": weekly_run,
            "fatLossPace": pace if pace in {"steady", "moderate", "aggressive"} else "moderate",
            "cardioSuggestion": "Add easy cardio on non-lifting days and keep intensity conversational.",
        },
        "phases": phases,
        "cautions": cautions,
        "missingInfo": [],
        "sourceUsed": bool(source_text),
    }


def request_groq_onboarding_draft(answers: dict[str, Any], source_text: str, api_key: str, model: str) -> dict[str, Any]:
    response = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.25,
            "max_completion_tokens": 1800,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You draft initial fat-loss and hybrid-training plans. Return strict JSON only. "
                        "Never diagnose, never prescribe medical treatment, and avoid aggressive targets when medical, injury, pregnancy, or eating-disorder concerns appear. "
                        "Use these keys: profileSummary, planStartDate, profile{name,birthYear,heightCm,startWeightKg,goalWeightKg}, "
                        "targets{calories,proteinG,steps,sleepHours,gymDaysPerWeek,weeklyRunKmTarget,fatLossPace,cardioSuggestion}, "
                        "phases array of {name,startWeightKg,targetWeightKg,calories,proteinG,steps,weeklyRunKmTarget,notes}, cautions array, missingInfo array. "
                        "Use kg, cm, kcal, grams. Draft only; the user must approve before applying."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({"answers": answers, "optionalPlanText": source_text[:20_000]}, sort_keys=True),
                },
            ],
        },
        timeout=20.0,
    )
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"]
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Groq returned an invalid onboarding draft.")
    return parsed


def normalize_onboarding_draft(raw: dict[str, Any], answers: dict[str, Any], source_text: str = "", provider: str = "rules") -> dict[str, Any]:
    fallback = fallback_onboarding_draft(answers, source_text)
    profile = raw.get("profile") if isinstance(raw.get("profile"), dict) else {}
    targets = raw.get("targets") if isinstance(raw.get("targets"), dict) else {}
    phases_raw = raw.get("phases") if isinstance(raw.get("phases"), list) else []
    merged = {
        **fallback,
        **{key: raw[key] for key in ("profileSummary", "planStartDate") if isinstance(raw.get(key), str) and raw.get(key)},
        "provider": provider,
        "profile": {
            **fallback["profile"],
            **{key: profile[key] for key in fallback["profile"] if profile.get(key) is not None},
        },
        "targets": {
            **fallback["targets"],
            **{key: targets[key] for key in fallback["targets"] if targets.get(key) is not None},
        },
        "cautions": raw.get("cautions") if isinstance(raw.get("cautions"), list) else fallback["cautions"],
        "missingInfo": raw.get("missingInfo") if isinstance(raw.get("missingInfo"), list) else [],
        "sourceUsed": bool(source_text),
    }
    phases = []
    for index, phase in enumerate(phases_raw[:5]):
        if not isinstance(phase, dict):
            continue
        base = fallback["phases"][min(index, len(fallback["phases"]) - 1)]
        phases.append({**base, **{key: phase[key] for key in base if phase.get(key) is not None}})
    merged["phases"] = phases or fallback["phases"]
    return merged


def onboarding_draft(payload: dict[str, Any]) -> dict[str, Any]:
    answers = payload.get("answers") if isinstance(payload.get("answers"), dict) else {}
    source_text = onboarding_source_text(payload)
    groq_key = os.environ.get("GROQ_API_KEY")
    groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    if groq_key:
        try:
            raw = request_groq_onboarding_draft(answers, source_text, groq_key, groq_model)
            return {**normalize_onboarding_draft(raw, answers, source_text, "groq"), "model": groq_model}
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError, IndexError, json.JSONDecodeError):
            fallback = fallback_onboarding_draft(answers, source_text)
            return {**fallback, "fallback": True, "model": None}
    return fallback_onboarding_draft(answers, source_text)


def make_rule_based_note(state: dict[str, Any]) -> str:
    weekly_change = state.get("weekly_change_kg")
    compliance = state.get("compliance", {})
    if weekly_change is None:
        return "Log a few more weigh-ins and daily targets. Once there is enough history, I will judge the trend from averages, not single scale spikes."
    loss_rate = -weekly_change
    protein = compliance.get("protein", {}).get("percent")
    steps = compliance.get("steps", {}).get("percent")
    if 0.5 <= loss_rate <= 0.8:
        return "You are in the target loss range. Keep calories steady and protect training quality."
    if protein is not None and protein < 0.75:
        return "Before changing calories, tighten protein consistency. Muscle preservation depends on that more than another small calorie cut."
    if steps is not None and steps < 0.75:
        return "Steps are the first lever to clean up. Bring the baseline back before reducing food."
    if loss_rate < 0.3:
        return "The trend is slow. If compliance is solid for another review, consider a small calorie cut or a little extra easy cardio."
    if loss_rate > 1.0:
        return "The trend is fast. Watch recovery and strength, and consider adding a little food if performance dips."
    return "Keep logging. The current signal is mixed, so the best move is consistency until the next average-to-average review."


def make_frontend_summary_note(summary: dict[str, Any]) -> str:
    recommendation = summary.get("recommendation") or {}
    review = summary.get("phaseReview") or summary.get("review") or {}
    weak = summary.get("weakestMetrics") or []
    headline = recommendation.get("headline") or recommendation.get("status") or "Today is about execution."
    detail = recommendation.get("detail") or recommendation.get("message")
    if detail:
        return str(detail)
    if review.get("code") == "ready_for_review":
        return "Your trend has reached the phase threshold. Review recovery, waist, and strength before advancing."
    if weak:
        first = weak[0]
        label = first.get("metric", first) if isinstance(first, dict) else first
        return f"Keep the plan steady and make {label} the next focus. The rules stay in charge; this note is just the nudge."
    return str(headline)


def get_state_version(conn: sqlite3.Connection, user_id: int | None = None) -> dict[str, int]:
    if user_id is None:
        row = conn.execute("SELECT version FROM app_state WHERE user_id IS NULL").fetchone()
    else:
        row = conn.execute("SELECT version FROM app_state WHERE user_id = ?", (user_id,)).fetchone()
    return {"version": row["version"] if row else 0}


def get_state_document(conn: sqlite3.Connection, user_id: int | None = None) -> dict[str, Any]:
    if user_id is None:
        row = conn.execute("SELECT * FROM app_state WHERE user_id IS NULL").fetchone()
    else:
        row = conn.execute("SELECT * FROM app_state WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        return {"version": 0, "updatedAt": "", "tables": {}}
    return json.loads(row["document_json"])


def put_state_document(conn: sqlite3.Connection, doc: dict[str, Any], user_id: int | None = None) -> dict[str, Any]:
    current = get_state_version(conn, user_id)["version"]
    base = doc.get("baseVersion")
    if base is not None and int(base) != current:
        return {"conflict": True, "serverVersion": current}
    stored = {
        "version": int(doc["version"]),
        "updatedAt": doc["updatedAt"],
        "tables": doc["tables"],
    }
    if user_id is None:
        existing = conn.execute("SELECT id FROM app_state WHERE user_id IS NULL").fetchone()
        if existing:
            conn.execute(
                "UPDATE app_state SET version = ?, updated_at = ?, document_json = ? WHERE id = ?",
                (stored["version"], stored["updatedAt"], json.dumps(stored), existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO app_state (user_id, version, updated_at, document_json) VALUES (NULL, ?, ?, ?)",
                (stored["version"], stored["updatedAt"], json.dumps(stored)),
            )
    else:
        conn.execute(
            """
            INSERT INTO app_state (user_id, version, updated_at, document_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at,
                document_json = excluded.document_json
            """,
            (user_id, stored["version"], stored["updatedAt"], json.dumps(stored)),
        )
    conn.commit()
    return stored
