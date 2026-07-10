"""Unit tests for QueryPlanner — mocked provider, no real LLM calls.

The planner's job is narrow: turn a raw question into a validated QueryPlan and
enforce the closed-category vocabulary. Date *resolution* is the model's job — we
only assert the reference date reaches the prompt, not that Python computed a range.
"""
import datetime
import logging

from unittest.mock import AsyncMock

import pytest
from google.genai import types

from app.models import QueryPlan
from app.services.query_planner import PLAN_SCHEMA, QueryPlanner

CATEGORIES = ["Food", "Groceries", "Electricity", "Salary"]
TODAY = datetime.date(2026, 7, 8)


def test_PlanSchema_ValidatedAsGeminiSchema_DoesNotRaise():
    # Reason: google-genai calls types.Schema.model_validate(response_schema)
    # before any API call. Union-type arrays and None-in-enum fail here.
    types.Schema.model_validate(PLAN_SCHEMA)


def _planner(raw: dict) -> tuple[QueryPlanner, AsyncMock]:
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value=raw)
    return QueryPlanner(provider), provider


@pytest.mark.asyncio
async def test_plan_aggregate_intent_with_food_and_april_dates():
    planner, _ = _planner({
        "intent": "aggregate", "categories": ["Food"], "flow": "DB",
        "date_from": "2026-04-01", "date_to": "2026-04-30",
    })
    plan = await planner.plan("berapa total pengeluaran makan bulan april?", TODAY, CATEGORIES)
    assert plan.intent == "aggregate"
    assert plan.categories == ["Food"]
    assert plan.flow == "DB"
    assert plan.date_from == "2026-04-01" and plan.date_to == "2026-04-30"


@pytest.mark.asyncio
async def test_plan_lookup_intent_for_when_question():
    planner, _ = _planner({"intent": "lookup", "categories": ["Electricity"], "flow": "DB"})
    plan = await planner.plan("kapan terakhir bayar PLN?", TODAY, CATEGORIES)
    assert plan.intent == "lookup"
    assert plan.categories == ["Electricity"]


@pytest.mark.asyncio
async def test_plan_drops_invented_category_and_logs(caplog):
    planner, _ = _planner({
        "intent": "aggregate", "categories": ["Makanan Enak", "Food"], "flow": "DB",
    })
    with caplog.at_level(logging.WARNING):
        plan = await planner.plan("pengeluaran makanan enak", TODAY, CATEGORIES)
    assert plan.categories == ["Food"]                      # invented value dropped
    assert "Makanan Enak" not in plan.categories
    assert any("invented" in r.message.lower() for r in caplog.records)


@pytest.mark.asyncio
async def test_plan_injects_reference_date_into_prompt():
    """Relative-date resolution is the model's job — we prove the reference date reaches it."""
    planner, provider = _planner({
        "intent": "aggregate", "categories": ["Food"], "flow": "DB",
        "date_from": "2026-06-01", "date_to": "2026-06-30",
    })
    await planner.plan("pengeluaran makan bulan lalu", TODAY, CATEGORIES)
    user_prompt = provider.generate_json.call_args.args[1]
    assert "2026-07-08" in user_prompt                       # today injected
    assert "Food" in user_prompt                             # closed vocab injected


@pytest.mark.asyncio
async def test_plan_missing_optional_fields_uses_defaults():
    planner, _ = _planner({"intent": "lookup", "categories": []})
    plan = await planner.plan("transaksi apa saja minggu ini?", TODAY, CATEGORIES)
    assert plan.intent == "lookup"
    assert plan.categories == []
    assert plan.date_from is None and plan.date_to is None
    assert plan.flow is None


@pytest.mark.asyncio
async def test_plan_returns_query_plan_type():
    planner, _ = _planner({"intent": "aggregate", "categories": ["Salary"], "flow": "CR"})
    plan = await planner.plan("berapa total gaji tahun ini?", TODAY, CATEGORIES)
    assert isinstance(plan, QueryPlan)
    assert plan.flow == "CR"
