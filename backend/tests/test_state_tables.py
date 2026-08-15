from __future__ import annotations

from datetime import date

from app.state_tables import (
    DEXIE_TABLES,
    SQL_DELETE_ORDER,
    apply_tombstones,
    assemble,
    explode,
    merge_user_rows,
    replace_user_rows,
    sql_column,
)


def test_sql_column_maps_reserved_and_date_fields() -> None:
    assert sql_column("order") == "sort_order"
    assert sql_column("date") == "local_date"
    assert sql_column("groupId") == "group_id"
    assert sql_column("weightKg") == "weight_kg"
    assert sql_column("satFatG") == "sat_fat_g"


def test_explode_assemble_round_trip_preserves_null_versus_zero() -> None:
    tables = {
        "profile": [
            {
                "id": "me",
                "name": "Jay",
                "heightCm": 178,
                "birthYear": 1995,
                "startWeightKg": 88,
                "goalWeightKg": 75,
                "updatedAt": "2026-08-15T10:00:00.000Z",
            }
        ],
        "settings": [
            {
                "id": "settings",
                "timezone": "Asia/Kolkata",
                "planStartDate": "2026-01-01",
                "onboardingCompleted": True,
                "calorieFloor": 1800,
                "updatedAt": "2026-08-15T10:00:00.000Z",
            }
        ],
        "phases": [
            {
                "id": "phase-1",
                "order": 1,
                "name": "Phase 1",
                "startWeightKg": 88,
                "targetWeightKg": 82,
                "targetWaistCm": None,
                "calories": 2100,
                "proteinG": 160,
                "steps": 10000,
                "sleepHours": 8,
                "mealsPerDay": 3,
                "weeklyRunKmTarget": 12,
                "schedule": [{"dow": 1, "gym": True, "sessionType": "upper", "runKm": None, "runType": None}],
                "startedOn": "2026-01-01",
                "endedOn": None,
                "calorieCutsApplied": 0,
                "notes": None,
            }
        ],
        "dailyLogs": [
            {
                "date": "2026-08-15",
                "weightKg": 87.4,
                "calories": None,
                "proteinG": 0,
                "steps": None,
                "createdAt": "2026-08-15T01:00:00.000Z",
                "updatedAt": "2026-08-15T01:00:00.000Z",
            }
        ],
        "meals": [
            {
                "id": "meal-1",
                "date": "2026-08-15",
                "slot": "lunch",
                "name": "Chicken rice",
                "time": "13:10",
                "quantity": 1,
                "unit": "bowl",
                "calories": 620,
                "proteinG": 48,
                "carbsG": 70,
                "fatG": 14,
                "fiberG": None,
                "sugarG": None,
                "satFatG": None,
                "micros": {"potassiumMg": 800},
                "notes": None,
                "source": "ai",
                "groupId": "grp-9",
                "createdAt": "2026-08-15T07:40:00.000Z",
                "updatedAt": "2026-08-15T07:40:00.000Z",
            },
            {
                "id": "meal-2",
                "date": "2026-08-15",
                "slot": "lunch",
                "name": "Yogurt",
                "calories": 120,
                "proteinG": 12,
                "source": "manual",
                "createdAt": "2026-08-15T07:40:00.000Z",
                "updatedAt": "2026-08-15T07:40:00.000Z",
            },
        ],
        "workouts": [
            {
                "id": "wo-1",
                "date": "2026-08-14",
                "sessionType": "upper",
                "startedAt": None,
                "finishedAt": None,
                "notes": None,
                "prescription": {
                    "version": 1,
                    "generatedAt": "2026-08-14T06:00:00.000Z",
                    "sessionType": "upper",
                    "readinessScore": 7,
                    "readinessBand": "ready",
                    "confidence": "high",
                    "headline": "Hold loads",
                    "adjustments": [],
                    "exercises": [],
                },
            }
        ],
        "workoutSets": [
            {
                "id": "set-1",
                "workoutId": "wo-1",
                "exerciseId": "ex-1",
                "setNumber": 1,
                "weightKg": 60,
                "reps": 8,
                "rir": 2,
                "isWarmup": False,
                "createdAt": "2026-08-14T06:30:00.000Z",
            }
        ],
    }

    exploded = explode(42, tables)
    assert exploded["profiles"][0]["user_id"] == 42
    assert "id" not in exploded["profiles"][0]
    assert exploded["phases"][0]["sort_order"] == 1
    assert exploded["daily_logs"][0]["local_date"] == "2026-08-15"
    assert exploded["daily_logs"][0]["calories"] is None
    assert exploded["daily_logs"][0]["protein_g"] == 0
    assert exploded["meals"][0]["group_id"] == "grp-9"
    assert exploded["meals"][1].get("group_id") is None
    assert exploded["goal_revisions"][0]["phase_id"] == "phase-1"
    assert exploded["goal_revisions"][0]["effective_date"] == "2026-01-01"
    assert exploded["goal_revisions"][0]["calories"] == 2100

    assembled = assemble(exploded)
    assert set(assembled) == set(DEXIE_TABLES)
    assert assembled["profile"][0]["id"] == "me"
    assert assembled["settings"][0]["id"] == "settings"
    assert assembled["phases"][0]["order"] == 1
    assert assembled["dailyLogs"][0]["calories"] is None
    assert assembled["dailyLogs"][0]["proteinG"] == 0
    assert assembled["meals"][0]["groupId"] == "grp-9"
    assert "groupId" not in assembled["meals"][1]
    assert assembled["meals"][0]["micros"] == {"potassiumMg": 800}
    assert assembled["workouts"][0]["prescription"]["headline"] == "Hold loads"
    assert assembled["workoutSets"][0]["workoutId"] == "wo-1"


def test_assemble_skips_soft_deleted_rows() -> None:
    assembled = assemble(
        {
            "meals": [
                {
                    "user_id": 1,
                    "id": "gone",
                    "local_date": date(2026, 8, 15),
                    "slot": "snack",
                    "name": "deleted",
                    "source": "manual",
                    "deleted_at": "2026-08-15T12:00:00Z",
                },
                {
                    "user_id": 1,
                    "id": "kept",
                    "local_date": date(2026, 8, 15),
                    "slot": "snack",
                    "name": "kept",
                    "source": "manual",
                    "deleted_at": None,
                },
            ]
        }
    )
    assert [meal["id"] for meal in assembled["meals"]] == ["kept"]


def test_replace_user_rows_deletes_children_before_parents() -> None:
    recorded: list[str] = []

    class Cursor:
        def execute(self, sql: str, params=None) -> None:
            recorded.append(sql)

    replace_user_rows(
        Cursor(),
        7,
        {
            "workouts": [{"id": "wo-1", "date": "2026-08-14", "sessionType": "upper"}],
            "workoutSets": [
                {
                    "id": "set-1",
                    "workoutId": "wo-1",
                    "exerciseId": "ex-1",
                    "setNumber": 1,
                    "isWarmup": False,
                }
            ],
        },
    )

    deletes = [sql for sql in recorded if sql.startswith("delete from ")]
    assert [sql.split()[2] for sql in deletes] == list(SQL_DELETE_ORDER)
    assert recorded.index("delete from workout_sets where user_id = %s") < recorded.index(
        "delete from workouts where user_id = %s"
    )
    inserts = [sql for sql in recorded if sql.startswith("insert into workouts")]
    set_inserts = [sql for sql in recorded if sql.startswith("insert into workout_sets")]
    assert inserts and set_inserts
    assert recorded.index(inserts[0]) < recorded.index(set_inserts[0])


def test_merge_user_rows_upserts_without_wiping_omitted_tables() -> None:
    recorded: list[str] = []

    class Cursor:
        def execute(self, sql: str, params=None) -> None:
            recorded.append(sql)

    merge_user_rows(
        Cursor(),
        7,
        {"meals": [{"id": "meal-new", "date": "2026-08-15", "slot": "lunch", "name": "Rice", "source": "manual"}]},
        [{"table": "meals", "id": "meal-old", "deletedAt": "2026-08-15T12:00:00.000Z"}],
    )

    fact_deletes = [
        sql
        for sql in recorded
        if sql.startswith("delete from ") and "sync_tombstones" not in sql
    ]
    assert fact_deletes == []
    assert any("on conflict" in sql and "insert into meals" in sql for sql in recorded)
    assert any("insert into sync_tombstones" in sql for sql in recorded)
    assert any(sql.startswith("update meals set deleted_at") for sql in recorded)


def test_apply_tombstones_ignores_unknown_tables() -> None:
    recorded: list[tuple[str, object]] = []

    class Cursor:
        def execute(self, sql: str, params=None) -> None:
            recorded.append((sql, params))

    apply_tombstones(
        Cursor(),
        3,
        [{"table": "notATable", "id": "x", "deletedAt": "2026-08-15T12:00:00.000Z"}],
    )
    assert recorded == []

