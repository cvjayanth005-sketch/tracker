"""Dexie camelCase tables ↔ per-user Postgres rows.

The client still speaks the StateDocument `tables` object. This module is the
only place that knows SQL table names and snake_case columns.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from typing import Any, Iterable

# Dexie export order from frontend/src/sync/client.ts
DEXIE_TABLES = (
    "profile",
    "settings",
    "phases",
    "dailyLogs",
    "meals",
    "foods",
    "measurements",
    "exercises",
    "workouts",
    "workoutSets",
    "runs",
    "weeklyCheckIns",
)

# Parents before children. `order` is a SQL reserved word, so it is sort_order.
SQL_INSERT_ORDER = (
    "profiles",
    "settings",
    "phases",
    "goal_revisions",
    "daily_logs",
    "meals",
    "saved_foods",
    "measurements",
    "weekly_check_ins",
    "exercises",
    "workouts",
    "workout_sets",
    "runs",
)

SQL_DELETE_ORDER = tuple(reversed(SQL_INSERT_ORDER))

DEXIE_TO_SQL = {
    "profile": "profiles",
    "settings": "settings",
    "phases": "phases",
    "dailyLogs": "daily_logs",
    "meals": "meals",
    "foods": "saved_foods",
    "measurements": "measurements",
    "exercises": "exercises",
    "workouts": "workouts",
    "workoutSets": "workout_sets",
    "runs": "runs",
    "weeklyCheckIns": "weekly_check_ins",
}

SQL_TO_DEXIE = {sql: dexie for dexie, sql in DEXIE_TO_SQL.items()}
DATE_PK_SQL = frozenset({"daily_logs", "measurements"})
SINGLETON_SQL = {"profiles": "me", "settings": "settings"}

JSON_COLUMNS = frozenset({"schedule", "micros", "prescription"})
DATE_COLUMNS = frozenset(
    {"local_date", "started_on", "ended_on", "plan_start_date", "week_start", "effective_date"}
)
INSTANT_COLUMNS = frozenset(
    {"created_at", "updated_at", "started_at", "finished_at", "last_used_at", "deleted_at"}
)
# Singleton Dexie rows; SQL uses user_id as the primary key.
DROP_DEXIE_ID = frozenset({"profile", "settings"})

# Dexie field name → SQL column when camel_to_snake is not enough.
FIELD_TO_COLUMN = {
    "date": "local_date",
    "order": "sort_order",
}

COLUMN_TO_FIELD = {sql: dexie for dexie, sql in FIELD_TO_COLUMN.items()}

# Whitelist: a Dexie field without a column here is stored only in the blob.
DEXIE_FIELDS: dict[str, tuple[str, ...]] = {
    "profile": ("name", "heightCm", "birthYear", "startWeightKg", "goalWeightKg", "updatedAt"),
    "settings": (
        "timezone",
        "planStartDate",
        "onboardingCompleted",
        "calorieFloor",
        "targetLossPerWeekMin",
        "targetLossPerWeekMax",
        "fastLossPerWeekThreshold",
        "plateauLossPerWeekThreshold",
        "plateauWeeksBeforeCut",
        "maxCalorieCutsPerPhase",
        "phaseHoldDays",
        "minReadingsPerWindow",
        "goodCompliancePct",
        "manualPhaseOverrideId",
        "updatedAt",
    ),
    "phases": (
        "id",
        "order",
        "name",
        "startWeightKg",
        "targetWeightKg",
        "targetWaistCm",
        "calories",
        "proteinG",
        "steps",
        "sleepHours",
        "mealsPerDay",
        "weeklyRunKmTarget",
        "schedule",
        "startedOn",
        "endedOn",
        "calorieCutsApplied",
        "notes",
    ),
    "dailyLogs": (
        "date",
        "weightKg",
        "calories",
        "proteinG",
        "carbsG",
        "fatG",
        "fiberG",
        "sugarG",
        "satFatG",
        "micros",
        "waterMl",
        "sodiumMg",
        "alcoholUnits",
        "caffeineMg",
        "foodComplete",
        "steps",
        "runKm",
        "gymDone",
        "mealsOnPlan",
        "sleepHours",
        "sleepQuality",
        "sleepBedtime",
        "sleepWakeTime",
        "nightAwakenings",
        "energy",
        "hunger",
        "soreness",
        "stress",
        "trainingMinutesAvailable",
        "trainingConstraints",
        "notes",
        "createdAt",
        "updatedAt",
    ),
    "meals": (
        "id",
        "date",
        "slot",
        "name",
        "time",
        "quantity",
        "unit",
        "calories",
        "proteinG",
        "carbsG",
        "fatG",
        "fiberG",
        "sugarG",
        "satFatG",
        "micros",
        "caffeineMg",
        "sodiumMg",
        "alcoholUnits",
        "notes",
        "source",
        "groupId",
        "createdAt",
        "updatedAt",
    ),
    "foods": (
        "id",
        "name",
        "defaultSlot",
        "quantity",
        "unit",
        "calories",
        "proteinG",
        "carbsG",
        "fatG",
        "fiberG",
        "sugarG",
        "satFatG",
        "micros",
        "caffeineMg",
        "sodiumMg",
        "alcoholUnits",
        "useCount",
        "lastUsedAt",
        "createdAt",
        "updatedAt",
    ),
    "measurements": ("date", "waistCm", "chestCm", "hipsCm", "thighCm", "armCm", "updatedAt"),
    "exercises": (
        "id",
        "name",
        "sessionType",
        "repRangeMin",
        "repRangeMax",
        "targetSets",
        "targetRir",
        "loadIncrementKg",
        "order",
        "archived",
    ),
    "workouts": ("id", "date", "sessionType", "startedAt", "finishedAt", "notes", "prescription"),
    "workoutSets": (
        "id",
        "workoutId",
        "exerciseId",
        "setNumber",
        "weightKg",
        "reps",
        "rir",
        "isWarmup",
        "createdAt",
    ),
    "runs": (
        "id",
        "date",
        "type",
        "distanceKm",
        "durationMin",
        "rpe",
        "avgHr",
        "notes",
        "createdAt",
        "updatedAt",
    ),
    "weeklyCheckIns": ("id", "weekStart", "win", "friction", "intent", "updatedAt"),
}


def camel_to_snake(name: str) -> str:
    stepped = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", stepped).lower()


def snake_to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(part.title() for part in parts[1:])


def sql_column(dexie_field: str) -> str:
    return FIELD_TO_COLUMN.get(dexie_field, camel_to_snake(dexie_field))


def dexie_field(column: str) -> str:
    return COLUMN_TO_FIELD.get(column, snake_to_camel(column))


def explode(user_id: int, tables: dict[str, list[Any]]) -> dict[str, list[dict[str, Any]]]:
    """Turn a StateDocument `tables` object into SQL rows keyed by table name."""
    exploded: dict[str, list[dict[str, Any]]] = {name: [] for name in SQL_INSERT_ORDER}
    for dexie_name, sql_name in DEXIE_TO_SQL.items():
        records = tables.get(dexie_name)
        if not isinstance(records, list):
            continue
        for record in records:
            if not isinstance(record, dict):
                continue
            exploded[sql_name].append(_record_to_row(user_id, dexie_name, record))
    exploded["goal_revisions"] = _revisions_from_phases(user_id, exploded["phases"], tables)
    return exploded


def assemble(sql_rows: dict[str, list[dict[str, Any]]]) -> dict[str, list[Any]]:
    """Turn SQL rows into the Dexie `tables` object. Always includes every Dexie key."""
    tables: dict[str, list[Any]] = {name: [] for name in DEXIE_TABLES}
    for dexie_name, sql_name in DEXIE_TO_SQL.items():
        for row in sql_rows.get(sql_name, []):
            if row.get("deleted_at"):
                continue
            tables[dexie_name].append(_row_to_record(dexie_name, row))
    return tables


def replace_user_rows(cur: Any, user_id: int, tables: dict[str, list[Any]]) -> None:
    exploded = explode(user_id, tables)
    for sql_name in SQL_DELETE_ORDER:
        cur.execute(f"delete from {sql_name} where user_id = %s", (user_id,))
    for sql_name in SQL_INSERT_ORDER:
        for row in exploded[sql_name]:
            _insert_row(cur, sql_name, row)


def merge_user_rows(
    cur: Any,
    user_id: int,
    tables: dict[str, list[Any]],
    tombstones: list[dict[str, Any]] | None = None,
) -> None:
    """Upsert payload rows. Never delete a row just because the export omitted it."""
    exploded = explode(user_id, tables)
    for sql_name in SQL_INSERT_ORDER:
        for row in exploded[sql_name]:
            _upsert_row(cur, sql_name, row)
            _clear_tombstone(cur, user_id, sql_name, row)
    apply_tombstones(cur, user_id, tombstones or [])


def apply_tombstones(cur: Any, user_id: int, tombstones: list[dict[str, Any]]) -> None:
    for stamp in tombstones:
        dexie_name = stamp.get("table")
        row_id = stamp.get("id")
        if not isinstance(dexie_name, str) or dexie_name not in DEXIE_TO_SQL:
            continue
        if row_id is None or row_id == "":
            continue
        row_id = str(row_id)
        deleted_at = _in_value("deleted_at", stamp.get("deletedAt")) or datetime.now(tz=timezone.utc)
        sql_name = DEXIE_TO_SQL[dexie_name]
        cur.execute(
            """
            insert into sync_tombstones (user_id, table_name, row_id, deleted_at)
            values (%s, %s, %s, %s)
            on conflict (user_id, table_name, row_id) do update set
                deleted_at = excluded.deleted_at
            """,
            (user_id, dexie_name, row_id, deleted_at),
        )
        _soft_delete_fact(cur, user_id, sql_name, row_id, deleted_at)


def fetch_tombstones(cur: Any, user_id: int) -> list[dict[str, str]]:
    cur.execute(
        """
        select table_name, row_id, deleted_at
        from sync_tombstones
        where user_id = %s
        order by deleted_at, table_name, row_id
        """,
        (user_id,),
    )
    out: list[dict[str, str]] = []
    for row in cur.fetchall():
        record = dict(row)
        out.append(
            {
                "table": str(record["table_name"]),
                "id": str(record["row_id"]),
                "deletedAt": format_instant(record["deleted_at"]),
            }
        )
    return out


def fetch_user_tables(cur: Any, user_id: int) -> dict[str, list[Any]]:
    sql_rows: dict[str, list[dict[str, Any]]] = {}
    for sql_name in DEXIE_TO_SQL.values():
        cur.execute(
            f"select * from {sql_name} where user_id = %s and deleted_at is null",
            (user_id,),
        )
        sql_rows[sql_name] = [dict(row) for row in cur.fetchall()]
    return assemble(sql_rows)


def upsert_sync_meta(cur: Any, user_id: int, version: int, updated_at: datetime) -> None:
    cur.execute(
        """
        insert into sync_meta (user_id, version, updated_at)
        values (%s, %s, %s)
        on conflict (user_id) do update set
            version = excluded.version,
            updated_at = excluded.updated_at
        """,
        (user_id, version, updated_at),
    )


def read_sync_meta(cur: Any, user_id: int) -> dict[str, Any] | None:
    cur.execute(
        "select version, updated_at from sync_meta where user_id = %s",
        (user_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _record_to_row(user_id: int, dexie_name: str, record: dict[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {"user_id": user_id, "deleted_at": None}
    for field in DEXIE_FIELDS[dexie_name]:
        if field == "id" and dexie_name in DROP_DEXIE_ID:
            continue
        column = sql_column(field)
        row[column] = _in_value(column, record.get(field))
    return row


def _row_to_record(dexie_name: str, row: dict[str, Any]) -> dict[str, Any]:
    record: dict[str, Any] = {}
    if dexie_name == "profile":
        record["id"] = "me"
    elif dexie_name == "settings":
        record["id"] = "settings"
    for field in DEXIE_FIELDS[dexie_name]:
        if field == "id" and dexie_name in DROP_DEXIE_ID:
            continue
        column = sql_column(field)
        if column not in row and field not in record:
            continue
        value = _out_value(column, field, row.get(column))
        if field == "groupId" and not value:
            continue
        record[field] = value
    return record


def _revisions_from_phases(
    user_id: int,
    phase_rows: Iterable[dict[str, Any]],
    tables: dict[str, list[Any]],
) -> list[dict[str, Any]]:
    plan_start = None
    settings_rows = tables.get("settings") or []
    if settings_rows and isinstance(settings_rows[0], dict):
        plan_start = settings_rows[0].get("planStartDate")
    revisions: list[dict[str, Any]] = []
    for phase in phase_rows:
        effective = phase.get("started_on") or plan_start or date(1970, 1, 1)
        revisions.append(
            {
                "user_id": user_id,
                "phase_id": phase["id"],
                "effective_date": _in_value("effective_date", effective),
                "calories": phase.get("calories"),
                "protein_g": phase.get("protein_g"),
                "steps": phase.get("steps"),
                "sleep_hours": phase.get("sleep_hours"),
                "meals_per_day": phase.get("meals_per_day"),
                "weekly_run_km_target": phase.get("weekly_run_km_target"),
                "reason": "migrated_from_phase",
            }
        )
    return revisions


def _in_value(column: str, value: Any) -> Any:
    if value is None:
        return None
    if column in JSON_COLUMNS:
        return value if isinstance(value, str) else json.dumps(value)
    if column in DATE_COLUMNS:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return str(value)[:10]
    if column in INSTANT_COLUMNS:
        if isinstance(value, datetime):
            return value
        text = str(value).replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return value
    return value


def _out_value(column: str, field: str, value: Any) -> Any:
    if value is None:
        return None
    if column in JSON_COLUMNS:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        if hasattr(value, "keys"):
            return dict(value)
        if isinstance(value, list):
            return list(value)
        return value
    if column in DATE_COLUMNS:
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return str(value)[:10]
    if column in INSTANT_COLUMNS:
        return _instant_out(value)
    if field == "order" and isinstance(value, (int, float)):
        return int(value)
    return value


def format_instant(value: Any) -> str:
    return _instant_out(value)


def _instant_out(value: Any) -> str:
    if isinstance(value, datetime):
        stamp = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    text = str(value)
    if text.endswith("+00:00"):
        return text[:-6] + "Z"
    return text


def _insert_row(cur: Any, sql_name: str, row: dict[str, Any]) -> None:
    # Drop None so NOT NULL columns (created_at, timezone, …) keep their defaults.
    # Nullable metrics omitted here also become NULL, which matches "unknown".
    columns = [name for name, value in row.items() if value is not None]
    if not columns:
        return
    placeholders = ", ".join("%s::jsonb" if col in JSON_COLUMNS else "%s" for col in columns)
    sql = f"insert into {sql_name} ({', '.join(columns)}) values ({placeholders})"
    cur.execute(sql, _sql_values(columns, row))


def _upsert_row(cur: Any, sql_name: str, row: dict[str, Any]) -> None:
    columns = [name for name, value in row.items() if value is not None]
    if not columns:
        return
    conflict = _conflict_target(sql_name)
    for key in conflict:
        if key not in columns:
            return
    placeholders = ", ".join("%s::jsonb" if col in JSON_COLUMNS else "%s" for col in columns)
    assignments = [
        f"{col} = excluded.{col}"
        for col in columns
        if col not in conflict
    ]
    assignments.append("deleted_at = null")
    if not assignments:
        return
    sql = (
        f"insert into {sql_name} ({', '.join(columns)}) values ({placeholders}) "
        f"on conflict ({', '.join(conflict)}) do update set {', '.join(assignments)}"
    )
    if "updated_at" in columns:
        sql += (
            f" where {sql_name}.deleted_at is not null"
            f" or {sql_name}.updated_at is null"
            f" or excluded.updated_at is null"
            f" or excluded.updated_at >= {sql_name}.updated_at"
        )
    cur.execute(sql, _sql_values(columns, row))


def _sql_values(columns: list[str], row: dict[str, Any]) -> list[Any]:
    values = []
    for col in columns:
        value = row[col]
        if col in JSON_COLUMNS and not isinstance(value, str):
            value = json.dumps(value)
        values.append(value)
    return values


def _conflict_target(sql_name: str) -> tuple[str, ...]:
    if sql_name in SINGLETON_SQL:
        return ("user_id",)
    if sql_name in DATE_PK_SQL:
        return ("user_id", "local_date")
    if sql_name == "goal_revisions":
        return ("user_id", "phase_id", "effective_date")
    return ("user_id", "id")


def _dexie_row_id(sql_name: str, row: dict[str, Any]) -> str | None:
    if sql_name in SINGLETON_SQL:
        return SINGLETON_SQL[sql_name]
    if sql_name in DATE_PK_SQL:
        value = row.get("local_date")
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return str(value)[:10]
    value = row.get("id")
    return str(value) if value is not None else None


def _clear_tombstone(cur: Any, user_id: int, sql_name: str, row: dict[str, Any]) -> None:
    dexie_name = SQL_TO_DEXIE.get(sql_name)
    row_id = _dexie_row_id(sql_name, row)
    if not dexie_name or not row_id:
        return
    cur.execute(
        "delete from sync_tombstones where user_id = %s and table_name = %s and row_id = %s",
        (user_id, dexie_name, row_id),
    )


def _soft_delete_fact(cur: Any, user_id: int, sql_name: str, row_id: str, deleted_at: Any) -> None:
    if sql_name in SINGLETON_SQL:
        cur.execute(
            f"update {sql_name} set deleted_at = %s where user_id = %s",
            (deleted_at, user_id),
        )
        return
    if sql_name in DATE_PK_SQL:
        cur.execute(
            f"update {sql_name} set deleted_at = %s where user_id = %s and local_date = %s",
            (deleted_at, user_id, row_id),
        )
        return
    cur.execute(
        f"update {sql_name} set deleted_at = %s where user_id = %s and id = %s",
        (deleted_at, user_id, row_id),
    )
