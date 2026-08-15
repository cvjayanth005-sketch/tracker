from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from .seeds import FOODS, PHASES, settings_rows


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "tracker.sqlite3"


def database_path() -> Path:
    return Path(os.environ.get("TRACKER_DB_PATH", DEFAULT_DB_PATH))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                display_name TEXT,
                start_weight_kg REAL,
                goal_weight_min_kg REAL,
                goal_weight_max_kg REAL,
                timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
                current_phase_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (current_phase_id) REFERENCES phases(id)
            );

            CREATE TABLE IF NOT EXISTS phases (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                order_index INTEGER NOT NULL UNIQUE,
                start_weight_kg REAL NOT NULL,
                end_weight_kg REAL NOT NULL,
                calorie_target INTEGER,
                calorie_min INTEGER,
                calorie_max INTEGER,
                protein_min_g INTEGER NOT NULL,
                protein_max_g INTEGER NOT NULL,
                steps_target INTEGER NOT NULL,
                weekday_run_km REAL NOT NULL,
                sunday_run_km REAL NOT NULL,
                workout_days_per_week INTEGER NOT NULL,
                primary_goal TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_logs (
                local_date TEXT PRIMARY KEY,
                weight_kg REAL,
                calories INTEGER,
                protein_g REAL,
                steps INTEGER,
                run_completed INTEGER,
                gym_completed INTEGER,
                breakfast_completed INTEGER,
                lunch_completed INTEGER,
                pre_workout_completed INTEGER,
                post_workout_completed INTEGER,
                dinner_completed INTEGER,
                sleep_hours REAL,
                notes TEXT,
                recovery INTEGER,
                hunger INTEGER,
                energy INTEGER,
                calorie_target_override INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS body_measurements (
                local_date TEXT PRIMARY KEY,
                waist_cm REAL,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                local_date TEXT NOT NULL,
                workout_name TEXT NOT NULL,
                completed INTEGER,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS workout_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id INTEGER NOT NULL,
                exercise TEXT NOT NULL,
                set_number INTEGER NOT NULL,
                weight REAL,
                unit TEXT NOT NULL DEFAULT 'kg',
                reps INTEGER,
                rir INTEGER,
                target_min_reps INTEGER NOT NULL DEFAULT 8,
                target_max_reps INTEGER NOT NULL DEFAULT 12,
                notes TEXT,
                FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                local_date TEXT NOT NULL,
                distance_km REAL,
                duration_minutes REAL,
                pace_min_per_km REAL,
                run_type TEXT NOT NULL DEFAULT 'Easy',
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS foods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                kcal_per_g REAL,
                protein_per_g REAL,
                price_value REAL,
                price_unit TEXT,
                editable INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_note_cache (
                user_id INTEGER NOT NULL,
                state_hash TEXT NOT NULL,
                note TEXT NOT NULL,
                state_summary_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, state_hash),
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS plan_imports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_name TEXT NOT NULL,
                source_sha256 TEXT NOT NULL,
                sheet_name TEXT NOT NULL,
                plan_start_date TEXT NOT NULL,
                tracking_weeks INTEGER NOT NULL,
                summary_json TEXT NOT NULL,
                imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_sha256, plan_start_date)
            );

            CREATE TABLE IF NOT EXISTS goal_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phase_id INTEGER NOT NULL,
                effective_date TEXT NOT NULL,
                start_weight_kg REAL NOT NULL,
                end_weight_kg REAL NOT NULL,
                calorie_target INTEGER,
                calorie_min INTEGER,
                calorie_max INTEGER,
                protein_min_g INTEGER NOT NULL,
                protein_max_g INTEGER NOT NULL,
                steps_target INTEGER NOT NULL,
                weekday_run_km REAL NOT NULL,
                sunday_run_km REAL NOT NULL,
                workout_days_per_week INTEGER NOT NULL,
                primary_goal TEXT NOT NULL,
                source_import_id INTEGER,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (phase_id) REFERENCES phases(id),
                FOREIGN KEY (source_import_id) REFERENCES plan_imports(id)
            );

            CREATE TABLE IF NOT EXISTS app_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL,
                name TEXT,
                picture TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE,
                version INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                document_json TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            );

            """
        )
        migrate_phase_targets(conn)
        migrate_app_state(conn)
        migrate_ai_note_cache(conn)
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS app_state_global_once
                ON app_state((user_id IS NULL))
                WHERE user_id IS NULL
            """
        )
        seed_db(conn)


def migrate_phase_targets(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(phases)").fetchall()}
    if "calorie_min" not in columns:
        conn.execute("ALTER TABLE phases ADD COLUMN calorie_min INTEGER")
    if "calorie_max" not in columns:
        conn.execute("ALTER TABLE phases ADD COLUMN calorie_max INTEGER")
    conn.execute(
        """
        UPDATE phases SET
            calorie_min = COALESCE(calorie_min, calorie_target),
            calorie_max = COALESCE(calorie_max, calorie_target)
        """
    )


def migrate_ai_note_cache(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(ai_note_cache)").fetchall()}
    if not columns or "user_id" in columns:
        return
    conn.executescript(
        """
        DROP TABLE ai_note_cache;
        CREATE TABLE ai_note_cache (
            user_id INTEGER NOT NULL,
            state_hash TEXT NOT NULL,
            note TEXT NOT NULL,
            state_summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, state_hash),
            FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
        );
        """
    )


def migrate_app_state(conn: sqlite3.Connection) -> None:
    columns = [row["name"] for row in conn.execute("PRAGMA table_info(app_state)").fetchall()]
    if columns and "user_id" not in columns:
        conn.executescript(
            """
            ALTER TABLE app_state RENAME TO app_state_legacy;

            CREATE TABLE app_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE,
                version INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                document_json TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            );

            INSERT INTO app_state (user_id, version, updated_at, document_json)
            SELECT NULL, version, updated_at, document_json
            FROM app_state_legacy
            WHERE id = 1;

            DROP TABLE app_state_legacy;

            CREATE UNIQUE INDEX IF NOT EXISTS app_state_global_once
                ON app_state((user_id IS NULL))
                WHERE user_id IS NULL;
            """
        )


def seed_db(conn: sqlite3.Connection) -> None:
    for phase in PHASES:
        conn.execute(
            """
            INSERT OR IGNORE INTO phases (
                name, order_index, start_weight_kg, end_weight_kg, calorie_target,
                calorie_min, calorie_max, protein_min_g, protein_max_g,
                steps_target, weekday_run_km, sunday_run_km,
                workout_days_per_week, primary_goal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                phase["name"],
                phase["order_index"],
                phase["start_weight_kg"],
                phase["end_weight_kg"],
                phase["calorie_target"],
                phase["calorie_min"],
                phase["calorie_max"],
                phase["protein_min_g"],
                phase["protein_max_g"],
                phase["steps_target"],
                phase["weekday_run_km"],
                phase["sunday_run_km"],
                phase["workout_days_per_week"],
                phase["primary_goal"],
            ),
        )
    conn.execute(
        """
        INSERT OR IGNORE INTO user_profile (
            id, display_name, start_weight_kg, goal_weight_min_kg,
            goal_weight_max_kg, timezone, current_phase_id
        ) VALUES (1, 'Jayanth', 88, 72, 73, 'Asia/Kolkata', 1)
        """
    )
    for food in FOODS:
        conn.execute(
            """
            INSERT OR IGNORE INTO foods
                (name, kcal_per_g, protein_per_g, price_value, price_unit)
            VALUES (?, ?, ?, ?, ?)
            """,
            food,
        )
    for key, value_json in settings_rows():
        conn.execute("INSERT OR IGNORE INTO settings (key, value_json) VALUES (?, ?)", (key, value_json))
    conn.commit()


def get_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("SELECT key, value_json FROM settings").fetchall()
    return {row["key"]: json.loads(row["value_json"]) for row in rows}


def upsert_settings(conn: sqlite3.Connection, values: dict[str, Any]) -> dict[str, Any]:
    for key, value in values.items():
        conn.execute(
            "INSERT INTO settings (key, value_json) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            (key, json.dumps(value)),
        )
    conn.commit()
    return get_settings(conn)
