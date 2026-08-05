"""Unit tests for CategorizerAgent — mocked smolagents, no real LLM calls."""
from unittest.mock import MagicMock, patch
import pytest

from app.agents.categorizer_agent import (
    AgentRateLimitedError,
    CategorizationResult,
    CategorizerAgent,
    _is_rate_limit_error,
    _parse_result,
)


def test_parse_result_extracts_structured_fields():
    raw = (
        "CATEGORY: Food & Dining\n"
        "CONFIDENCE: 0.9\n"
        "REASONING: Rule matched 'starbucks' -> Food & Dining (Cafe)."
    )
    result = _parse_result(raw)
    assert result.category == "Food & Dining"
    assert result.confidence == pytest.approx(0.9)
    assert "starbucks" in result.reasoning.lower()


def test_parse_result_falls_back_to_other_on_garbage_output():
    result = _parse_result("nothing useful here at all")
    assert result.category == "Other"
    assert result.confidence == pytest.approx(0.5)


def test_parse_result_survives_non_numeric_confidence():
    # LLMs annotate confidence often enough that float() would 502 a good run.
    raw = "CATEGORY: Transfer\nCONFIDENCE: 0.8 (high)\nREASONING: Rule matched."
    assert _parse_result(raw).confidence == pytest.approx(0.8)

    raw_bad = "CATEGORY: Transfer\nCONFIDENCE: high\nREASONING: Rule matched."
    assert _parse_result(raw_bad).confidence == pytest.approx(0.5)


@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_calls_agent_run(mock_model_cls, mock_agent_cls):
    mock_agent = MagicMock()
    mock_agent.run.return_value = (
        "CATEGORY: Transportation\n"
        "CONFIDENCE: 0.85\n"
        "REASONING: Grab rule matched -> Transportation (Online)."
    )
    mock_agent.memory.steps = [MagicMock(), MagicMock(), MagicMock()]
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    result = agent.categorize("GJ*GRAB CAR JAKARTA", "BCA", 35000)

    mock_agent.run.assert_called_once()
    assert result.category == "Transportation"
    assert result.confidence == pytest.approx(0.85)
    assert result.tool_calls_count == 3


@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_re_raises_on_agent_error(mock_model_cls, mock_agent_cls):
    mock_agent = MagicMock()
    mock_agent.run.side_effect = RuntimeError("model timeout")
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    with pytest.raises(RuntimeError, match="model timeout"):
        agent.categorize("TX", "BCA", 0)


def test_is_rate_limit_error_detects_429_and_quota_language():
    assert _is_rate_limit_error(Exception("429 RESOURCE_EXHAUSTED: quota exceeded"))
    assert _is_rate_limit_error(Exception("litellm.RateLimitError: too many requests"))
    assert not _is_rate_limit_error(Exception("malformed json output"))


@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_raises_agent_rate_limited_error_on_quota_exhaustion(mock_model_cls, mock_agent_cls):
    # smolagents/litellm already retried internally (3 attempts) before this
    # surfaces — by the time it reaches here it's a real exhausted quota, not
    # a transient blip. Callers must be able to distinguish this from a
    # generic bug (see the endpoint's separate except AgentRateLimitedError).
    mock_agent = MagicMock()
    mock_agent.run.side_effect = Exception(
        "litellm.RateLimitError: geminiException - 429 RESOURCE_EXHAUSTED: "
        "Quota exceeded for metric: generate_content_free_tier_requests"
    )
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    with pytest.raises(AgentRateLimitedError):
        agent.categorize("Monthly salary payment", "BCA", 8000000)
