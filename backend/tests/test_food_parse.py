from __future__ import annotations

import httpx
import pytest

from app.services import (
    FOOD_PARSE_RETRY_MODEL,
    extract_json_object,
    food_parse,
    normalize_food_parse,
    request_groq_food_parse,
)


def test_extract_json_object_strips_fences_and_padding() -> None:
    assert extract_json_object('```json\n{"meals":[]}\n```') == {"meals": []}
    assert extract_json_object('Here you go:\n{"meals":[{"name":"roti"}]}\nThanks') == {
        "meals": [{"name": "roti"}]
    }


def test_food_parse_offline_without_key(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    result = food_parse({"text": "eggs, toast", "defaultSlot": "breakfast"})

    assert result["provider"] == "rules"
    assert "fallback" not in result
    assert result["needsManual"] is True
    assert [meal["name"] for meal in result["meals"]] == ["eggs", "toast"]
    assert all(meal["calories"] is None for meal in result["meals"])


def test_food_parse_uses_groq(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")

    def fake(_text: str, _slot: str, _key: str, model: str) -> dict:
        assert model == "openai/gpt-oss-20b"
        return {
            "meals": [
                {
                    "slot": "lunch",
                    "name": "roti",
                    "quantity": 5,
                    "unit": "piece",
                    "calories": 400,
                    "proteinG": 12,
                    "carbsG": 70,
                    "fatG": 8,
                }
            ],
            "summary": "About 400 kcal from five roti.",
        }

    monkeypatch.setattr("app.services.request_groq_food_parse", fake)

    result = food_parse({"text": "5 roti", "defaultSlot": "lunch"})

    assert result["provider"] == "groq"
    assert result["model"] == "openai/gpt-oss-20b"
    assert result["needsManual"] is False
    assert result["meals"][0]["calories"] == 400
    assert result["meals"][0]["quantity"] == 5


def test_normalize_food_parse_keeps_meal_extras_and_normalizes_submacros() -> None:
    result = normalize_food_parse(
        {
            "meals": [
                {
                    "name": "latte",
                    "calories": 180,
                    "carbsG": 12,
                    "sugarG": 20,
                    "fatG": 6,
                    "satFatG": 9,
                    "caffeineMg": 95,
                    "sodiumMg": 160,
                    "alcoholUnits": 0,
                }
            ]
        },
        "breakfast",
        "groq",
    )

    meal = result["meals"][0]
    assert meal["caffeineMg"] == 95
    assert meal["sodiumMg"] == 160
    assert meal["alcoholUnits"] == 0
    assert meal["sugarG"] == 12
    assert meal["satFatG"] == 6


@pytest.mark.parametrize("text", ["2 kg uranium", "1 La Ferrari", "one human"])
def test_food_parse_rejects_non_edible_input_before_calling_ai(monkeypatch, text: str) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    with pytest.raises(ValueError, match="edible foods and drinks"):
        food_parse({"text": text, "defaultSlot": "snack"})


def test_food_parse_retries_then_succeeds(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    calls: list[str] = []

    def fake(_text: str, _slot: str, _key: str, model: str) -> dict:
        calls.append(model)
        if model == "openai/gpt-oss-20b":
            raise ValueError("Groq json_validate_failed: Failed to validate JSON")
        return {
            "meals": [{"name": "aloo bhujiya", "calories": 250, "proteinG": 4, "carbsG": 20, "fatG": 16}],
            "summary": "Fried snack, mostly fat and carbs.",
        }

    monkeypatch.setattr("app.services.request_groq_food_parse", fake)

    result = food_parse({"text": "150g aloo bhujiya", "defaultSlot": "lunch"})

    assert calls == ["openai/gpt-oss-20b", FOOD_PARSE_RETRY_MODEL]
    assert result["provider"] == "groq"
    assert result["model"] == FOOD_PARSE_RETRY_MODEL
    assert result["meals"][0]["calories"] == 250


def test_food_parse_falls_back_when_all_models_fail(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")

    def fail(*_args: object) -> dict:
        raise ValueError("Groq json_validate_failed: Failed to validate JSON")

    monkeypatch.setattr("app.services.request_groq_food_parse", fail)

    result = food_parse({"text": "5 roti and aloo bhujiya", "defaultSlot": "lunch"})

    assert result["provider"] == "rules"
    assert result["fallback"] is True
    assert "json_validate_failed" in result["fallbackReason"]
    assert result["needsManual"] is True
    assert result["meals"][0]["name"]


def test_normalize_food_parse_clamps_and_drops_junk() -> None:
    raw = {
        "meals": [
            {
                "slot": "brunch",
                "name": "  eggs  ",
                "calories": "220kcal",
                "proteinG": -4,
                "carbsG": 2,
                "fatG": 16,
                "confidence": "medium",
                "micros": {"potassiumMg": 120, "caffeineMg": 80},
            },
            {"name": ""},
            "skip me",
        ],
        "summary": "A couple of eggs.",
    }

    result = normalize_food_parse(raw, "breakfast", "groq")

    assert result["provider"] == "groq"
    assert result["needsManual"] is False
    assert len(result["meals"]) == 1
    meal = result["meals"][0]
    assert meal["slot"] == "breakfast"
    assert meal["name"] == "eggs"
    assert meal["calories"] == 220
    assert meal["proteinG"] is None
    assert meal["micros"] == {"potassiumMg": 120}


def test_request_groq_food_parse_uses_strict_schema_for_gpt_oss(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_post(url: str, headers=None, json=None, timeout=None):
        captured["json"] = json
        request = httpx.Request("POST", url)
        body = {
            "choices": [
                {
                    "message": {
                        "content": '{"meals":[{"name":"roti","calories":80}],"summary":"ok"}'
                    }
                }
            ]
        }
        return httpx.Response(200, request=request, json=body)

    monkeypatch.setattr("app.services.httpx.post", fake_post)

    result = request_groq_food_parse("roti", "lunch", "key", "openai/gpt-oss-20b")
    payload = captured["json"]
    assert isinstance(payload, dict)
    fmt = payload["response_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["strict"] is True
    assert payload["reasoning_effort"] == "low"
    assert payload["max_completion_tokens"] == 4096
    assert result["meals"][0]["name"] == "roti"


def test_request_groq_food_parse_uses_json_object_for_llama(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_post(url: str, headers=None, json=None, timeout=None):
        captured["json"] = json
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            request=request,
            json={"choices": [{"message": {"content": '{"meals":[{"name":"cucumber"}],"summary":null}'}}]},
        )

    monkeypatch.setattr("app.services.httpx.post", fake_post)

    result = request_groq_food_parse("cucumber", "lunch", "key", FOOD_PARSE_RETRY_MODEL)
    payload = captured["json"]
    assert isinstance(payload, dict)
    assert payload["response_format"] == {"type": "json_object"}
    assert "reasoning_effort" not in payload
    assert result["meals"][0]["name"] == "cucumber"


def test_request_groq_food_parse_surfaces_json_validate_failed(monkeypatch) -> None:
    def fake_post(url: str, headers=None, json=None, timeout=None):
        request = httpx.Request("POST", url)
        return httpx.Response(
            400,
            request=request,
            json={
                "error": {
                    "code": "json_validate_failed",
                    "message": "Failed to validate JSON. Please adjust your prompt.",
                    "failed_generation": "{not json",
                }
            },
        )

    monkeypatch.setattr("app.services.httpx.post", fake_post)

    try:
        request_groq_food_parse("5 roti", "lunch", "key", "openai/gpt-oss-20b")
    except ValueError as exc:
        assert "json_validate_failed" in str(exc)
        assert "Failed to validate JSON" in str(exc)
    else:
        raise AssertionError("expected ValueError")
