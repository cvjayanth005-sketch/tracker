from datetime import date, timedelta

from app.rules import (
    DayMetric,
    PhaseTarget,
    calorie_recommendation,
    completion_ratio,
    double_progression_ready,
    phase_review_eligibility,
    target_compliance,
    trailing_weight_average,
    weekly_average_change,
)


def make_days(start: date, weights: list[float | None]) -> list[DayMetric]:
    return [DayMetric(date=start + timedelta(days=index), weight_kg=weight) for index, weight in enumerate(weights)]


def test_trailing_weight_average_ignores_missing_not_zero() -> None:
    days = make_days(date(2026, 1, 1), [88, None, 87, None, 86, None, 85])

    assert trailing_weight_average(days, date(2026, 1, 7)) == 86.5


def test_weekly_average_change_compares_average_to_average() -> None:
    days = make_days(date(2026, 1, 1), [88, 88, 88, 88, 88, 88, 88, 87, 87, 87, 87, 87, 87, 87])

    assert weekly_average_change(days, date(2026, 1, 14)) == -1


def test_compliance_denominator_excludes_unknown_values() -> None:
    result = target_compliance([160, None, 120, 170], 160)

    assert result.completed == 2
    assert result.scheduled == 3
    assert result.percent == 0.667


def test_completion_ratio_can_use_schedule_denominator() -> None:
    result = completion_ratio([True, False, True, None], scheduled=4)

    assert result.completed == 2
    assert result.scheduled == 4
    assert result.percent == 0.5


def test_phase_review_requires_five_day_trend_dwell() -> None:
    start = date(2026, 1, 1)
    days = make_days(start, [84, 84, 84, 84, 84, 83.8, 83.8, 83.8, 83.8, 83.8, 83.8])
    phase = PhaseTarget(1, "Phase 1", 1, 88, 84, 2050, 160, 170, 11000, 2, 5, 6)

    result = phase_review_eligibility(days, phase, date(2026, 1, 11), dwell_days=5)

    assert result["eligible"] is True


def test_calorie_recommendation_checks_adherence_before_cut() -> None:
    result = calorie_recommendation(-0.1, adherence_percent=0.5, current_target=2050, low_loss_weeks=3)

    assert result.status == "adherence_first"
    assert result.suggested_delta is None


def test_calorie_recommendation_respects_floor_and_cut_counter() -> None:
    floor = calorie_recommendation(-0.1, 0.9, 1700, low_loss_weeks=3)
    counter = calorie_recommendation(-0.1, 0.9, 1900, prior_cut_count=2, low_loss_weeks=3)

    assert floor.status == "hold_review"
    assert counter.status == "hold_review"


def test_double_progression_ready_when_all_sets_hit_top_reps() -> None:
    sets = [{"reps": 12, "rir": 2}, {"reps": 12, "rir": 1}, {"reps": 12, "rir": 1}]

    assert double_progression_ready(sets, 8, 12) is True


def test_double_progression_not_ready_below_top_reps() -> None:
    sets = [{"reps": 12, "rir": 2}, {"reps": 11, "rir": 1}, {"reps": 12, "rir": 1}]

    assert double_progression_ready(sets, 8, 12) is False
