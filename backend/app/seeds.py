from __future__ import annotations

import json


PHASES = [
    {
        "name": "Phase 1",
        "order_index": 1,
        "start_weight_kg": 88,
        "end_weight_kg": 84,
        "calorie_target": 2050,
        "protein_min_g": 160,
        "protein_max_g": 170,
        "steps_target": 11000,
        "weekday_run_km": 2,
        "sunday_run_km": 5,
        "workout_days_per_week": 6,
        "primary_goal": "Build routine and strength.",
    },
    {
        "name": "Phase 2",
        "order_index": 2,
        "start_weight_kg": 84,
        "end_weight_kg": 80,
        "calorie_target": 2000,
        "protein_min_g": 160,
        "protein_max_g": 170,
        "steps_target": 11000,
        "weekday_run_km": 2,
        "sunday_run_km": 5,
        "workout_days_per_week": 6,
        "primary_goal": "Continue fat loss while maintaining strength.",
    },
    {
        "name": "Phase 3",
        "order_index": 3,
        "start_weight_kg": 80,
        "end_weight_kg": 76,
        "calorie_target": 1950,
        "protein_min_g": 160,
        "protein_max_g": 170,
        "steps_target": 11000,
        "weekday_run_km": 2,
        "sunday_run_km": 5,
        "workout_days_per_week": 6,
        "primary_goal": "Muscle preservation and recovery management.",
    },
    {
        "name": "Phase 4",
        "order_index": 4,
        "start_weight_kg": 76,
        "end_weight_kg": 73,
        "calorie_target": 1900,
        "protein_min_g": 160,
        "protein_max_g": 170,
        "steps_target": 11000,
        "weekday_run_km": 2,
        "sunday_run_km": 5,
        "workout_days_per_week": 6,
        "primary_goal": "Final controlled cut.",
    },
    {
        "name": "Phase 5",
        "order_index": 5,
        "start_weight_kg": 73,
        "end_weight_kg": 72,
        "calorie_target": None,
        "protein_min_g": 150,
        "protein_max_g": 165,
        "steps_target": 11000,
        "weekday_run_km": 2,
        "sunday_run_km": 5,
        "workout_days_per_week": 4,
        "primary_goal": "Maintain and develop hybrid endurance.",
    },
]


WORKOUT_SPLIT = {
    "monday": "Upper A",
    "tuesday": "Lower A",
    "wednesday": "Upper B",
    "thursday": "Lower B",
    "friday": "Upper C",
    "saturday": "Lower C",
    "sunday": "Rest",
}


FOODS = [
    ("Oats", 3.89, 0.169, 250, "per_kg"),
    ("Avvatar whey", 3.8, 0.76, 2700, "per_kg"),
    ("Banana", 0.89, 0.011, 35, "per_kg"),
    ("Double-toned milk", 0.46, 0.032, 10, "per_pack"),
    ("Curd", 0.61, 0.035, 10, "per_pack"),
    ("Soya chunks", 3.45, 0.52, 100, "per_kg"),
    ("Roti", 1.1, 0.03, None, "editable"),
    ("Rice", 1.3, 0.027, None, "editable"),
    ("Dal", 1.16, 0.09, None, "editable"),
    ("Sabzi", 0.8, 0.02, None, "editable"),
    ("Paneer", 2.65, 0.18, None, "editable"),
    ("Tofu", 0.76, 0.08, None, "editable"),
    ("Eggs", 1.55, 0.13, None, "editable"),
    ("Chicken", 1.65, 0.31, None, "editable"),
]


SETTINGS = {
    "timezone": "Asia/Kolkata",
    "calorie_floor": 1700,
    "phase_dwell_days": 5,
    "max_calorie_cut_recommendations": 2,
    "workout_split": WORKOUT_SPLIT,
    "goal_weight_min_kg": 72,
    "goal_weight_max_kg": 73,
}


def settings_rows() -> list[tuple[str, str]]:
    return [(key, json.dumps(value)) for key, value in SETTINGS.items()]
