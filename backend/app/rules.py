from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable


@dataclass(frozen=True)
class DayMetric:
    date: date
    weight_kg: float | None = None
    calories: int | None = None
    protein_g: float | None = None
    steps: int | None = None
    run_distance_km: float | None = None
    gym_completed: bool | None = None
    sleep_hours: float | None = None
    recovery: int | None = None
    hunger: int | None = None
    energy: int | None = None


@dataclass(frozen=True)
class PhaseTarget:
    id: int
    name: str
    order_index: int
    start_weight_kg: float
    end_weight_kg: float
    calorie_target: int | None
    protein_min_g: int
    protein_max_g: int
    steps_target: int
    weekday_run_km: float
    sunday_run_km: float
    workout_days_per_week: int


@dataclass(frozen=True)
class ComplianceResult:
    completed: int
    scheduled: int
    percent: float | None


@dataclass(frozen=True)
class CalorieRecommendation:
    status: str
    message: str
    suggested_delta: int | None = None


def trailing_weight_average(days: Iterable[DayMetric], end_date: date, window: int = 7) -> float | None:
    start = end_date - timedelta(days=window - 1)
    weights = [
        day.weight_kg
        for day in days
        if start <= day.date <= end_date and day.weight_kg is not None
    ]
    if not weights:
        return None
    return round(sum(weights) / len(weights), 2)


def weight_trend_series(days: Iterable[DayMetric], window: int = 7) -> list[dict]:
    ordered = sorted(days, key=lambda item: item.date)
    return [
        {"date": day.date.isoformat(), "avg_weight_kg": trailing_weight_average(ordered, day.date, window)}
        for day in ordered
        if day.weight_kg is not None
    ]


def weekly_average_change(days: Iterable[DayMetric], end_date: date) -> float | None:
    current = trailing_weight_average(days, end_date, 7)
    previous = trailing_weight_average(days, end_date - timedelta(days=7), 7)
    if current is None or previous is None:
        return None
    return round(current - previous, 2)


def completion_ratio(values: Iterable[bool | None], scheduled: int | None = None) -> ComplianceResult:
    known = [value for value in values if value is not None]
    denominator = scheduled if scheduled is not None else len(known)
    completed = sum(1 for value in known if value)
    if denominator <= 0:
        return ComplianceResult(completed=completed, scheduled=0, percent=None)
    return ComplianceResult(completed=completed, scheduled=denominator, percent=round(completed / denominator, 3))


def target_compliance(actuals: Iterable[float | int | None], target: float | int) -> ComplianceResult:
    known = [actual for actual in actuals if actual is not None]
    completed = sum(1 for actual in known if actual >= target)
    if not known:
        return ComplianceResult(completed=0, scheduled=0, percent=None)
    return ComplianceResult(completed=completed, scheduled=len(known), percent=round(completed / len(known), 3))


def calorie_compliance(actuals: Iterable[int | None], target: int, tolerance: int = 100) -> ComplianceResult:
    known = [actual for actual in actuals if actual is not None]
    completed = sum(1 for actual in known if actual <= target + tolerance)
    if not known:
        return ComplianceResult(completed=0, scheduled=0, percent=None)
    return ComplianceResult(completed=completed, scheduled=len(known), percent=round(completed / len(known), 3))


def phase_review_eligibility(
    days: Iterable[DayMetric],
    phase: PhaseTarget,
    today: date,
    dwell_days: int = 5,
) -> dict:
    qualifying_dates: list[str] = []
    for offset in range(dwell_days - 1, -1, -1):
        check_date = today - timedelta(days=offset)
        trend = trailing_weight_average(days, check_date, 7)
        if trend is None or trend > phase.end_weight_kg:
            return {
                "eligible": False,
                "message": "Keep current phase until trend weight holds below the threshold.",
                "qualifying_dates": qualifying_dates,
            }
        qualifying_dates.append(check_date.isoformat())
    return {
        "eligible": True,
        "message": "Phase target reached - review before advancing.",
        "qualifying_dates": qualifying_dates,
    }


def calorie_recommendation(
    weekly_change_kg: float | None,
    adherence_percent: float | None,
    current_target: int | None,
    calorie_floor: int = 1700,
    prior_cut_count: int = 0,
    low_loss_weeks: int = 0,
    recovery_avg: float | None = None,
) -> CalorieRecommendation:
    if weekly_change_kg is None:
        return CalorieRecommendation("insufficient_data", "Log more weight data before changing calories.")
    if current_target is None:
        return CalorieRecommendation("maintenance", "No fat-loss calorie target is active for this phase.")
    if adherence_percent is not None and adherence_percent < 0.75:
        return CalorieRecommendation("adherence_first", "Improve tracking and target adherence before changing intake.")
    if recovery_avg is not None and recovery_avg <= 2:
        return CalorieRecommendation("recovery_concern", "Recovery looks low. Hold calories and review sleep, stress, and training load.")

    loss_rate = -weekly_change_kg
    if 0.5 <= loss_rate <= 0.8:
        return CalorieRecommendation("on_target", "On target - keep current plan.")
    if loss_rate > 1.0:
        return CalorieRecommendation("too_fast", "Weight loss may be too fast. Consider increasing calories by 100-200 kcal.", 150)
    if loss_rate < 0.3 and low_loss_weeks >= 2:
        if current_target <= calorie_floor or prior_cut_count >= 2:
            return CalorieRecommendation("hold_review", "Hold calories and check sleep, steps, hunger, and adherence before another cut.")
        return CalorieRecommendation("consider_cut", "Consider reducing calories by 100-150 kcal or adding a small amount of cardio.", -125)
    return CalorieRecommendation("monitor", "Trend is not decisive yet. Keep logging and review the next weekly average.")


def double_progression_ready(sets: Iterable[dict], target_min_reps: int, target_max_reps: int) -> bool:
    relevant = [item for item in sets if item.get("reps") is not None]
    if not relevant:
        return False
    if any(item["reps"] < target_max_reps for item in relevant):
        return False
    rir_values = [item.get("rir") for item in relevant if item.get("rir") is not None]
    return not rir_values or min(rir_values) >= 1
