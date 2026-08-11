from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DayLogUpdate(BaseModel):
    weight_kg: float | None = None
    calories: int | None = None
    protein_g: float | None = None
    steps: int | None = None
    run_completed: bool | None = None
    gym_completed: bool | None = None
    breakfast_completed: bool | None = None
    lunch_completed: bool | None = None
    pre_workout_completed: bool | None = None
    post_workout_completed: bool | None = None
    dinner_completed: bool | None = None
    sleep_hours: float | None = None
    notes: str | None = None
    recovery: int | None = Field(default=None, ge=1, le=5)
    hunger: int | None = Field(default=None, ge=1, le=5)
    energy: int | None = Field(default=None, ge=1, le=5)
    calorie_target_override: int | None = None


class DayLog(DayLogUpdate):
    local_date: date


class ImportRequest(BaseModel):
    csv_text: str | None = None
    rows: list[dict[str, Any]] | None = None


class ExcelPlanImportRequest(BaseModel):
    filename: str = "Phase_1_to_5_Fat_Loss_Tracker.xlsx"
    file_base64: str
    start_date: date


class WorkoutSetIn(BaseModel):
    exercise: str
    set_number: int
    weight: float | None = None
    unit: str = "kg"
    reps: int | None = None
    rir: int | None = Field(default=None, ge=0, le=10)
    target_min_reps: int = 8
    target_max_reps: int = 12
    notes: str | None = None


class WorkoutUpsert(BaseModel):
    workout_name: str
    completed: bool | None = None
    notes: str | None = None
    sets: list[WorkoutSetIn] = []


class RunCreate(BaseModel):
    local_date: date
    distance_km: float | None = None
    duration_minutes: float | None = None
    pace_min_per_km: float | None = None
    run_type: str = "Easy"
    notes: str | None = None


class PhaseUpdate(BaseModel):
    current_phase_id: int


class SettingsUpdate(BaseModel):
    values: dict[str, Any]


class CoachNoteRequest(BaseModel):
    force: bool = False
    summary: dict[str, Any] | None = None
    promptVersion: str | None = None
    rulesVersion: str | None = None


class CoachChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CoachChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1200)
    context: dict[str, Any]
    messages: list[CoachChatMessage] = Field(default_factory=list)


class OnboardingDraftRequest(BaseModel):
    answers: dict[str, Any]
    pasted_text: str | None = None
    file_name: str | None = None
    file_base64: str | None = None


class GoogleLoginRequest(BaseModel):
    credential: str


class StateDocument(BaseModel):
    version: int
    updatedAt: str
    tables: dict[str, list[Any]]
    baseVersion: int | None = None


class ApiResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    data: Any
