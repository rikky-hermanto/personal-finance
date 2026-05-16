"""Tests for PortfolioReviewer — mocks the LlmProvider, never calls real API."""
import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from app.models import PortfolioHolding, PortfolioReviewRequest, PortfolioReviewResponse
from app.services.portfolio_reviewer import PortfolioReviewer


FIXTURE_REVIEW_RESPONSE = {
    "diagnostics": {
        "health_score": 72,
        "archetype_fit_score": 85,
        "strengths": ["Diversified across 3 asset classes", "Blue-chip IDX names"],
        "gaps": ["No fixed income", "IDR concentration risk"],
        "allocation_summary": [
            {"asset_class": "equity", "current_pct": 100, "target_pct": 70},
        ],
    },
    "holdings_evaluation": {
        "holdings": [
            {
                "name": "Bank Central Asia",
                "ticker": "BBCA",
                "asset_class": "equity",
                "current_allocation_pct": 40,
                "recommendation": "HOLD",
                "conviction": "HIGH",
                "rationale": "Dominant retail bank with strong ROE.",
                "risk_flags": [],
            }
        ]
    },
    "macro_map": {
        "factors": [
            {
                "factor": "BI Rate",
                "direction": "NEUTRAL",
                "magnitude": "MEDIUM",
                "portfolio_impact": "Stable rates support equity valuations.",
                "source": "Bank Indonesia",
            }
        ]
    },
    "scenarios": {
        "scenarios": [
            {
                "label": "BULL",
                "probability_pct": 30,
                "key_driver": "Foreign inflow surge",
                "portfolio_return_est": "+25%",
                "action_trigger": "IHSG breaks 8000",
                "portfolio_adjustments": ["Add equity exposure"],
            },
            {
                "label": "BASE",
                "probability_pct": 50,
                "key_driver": "Steady BI policy",
                "portfolio_return_est": "+12%",
                "action_trigger": "IHSG stays 6500-7500",
                "portfolio_adjustments": [],
            },
            {
                "label": "BEAR",
                "probability_pct": 20,
                "key_driver": "Global risk-off",
                "portfolio_return_est": "-20%",
                "action_trigger": "IDR breaches 17000",
                "portfolio_adjustments": ["Reduce equity, add gold"],
            },
        ]
    },
    "resilience_test": {
        "overall_resilience_score": 65,
        "stress_tests": [
            {
                "shock_name": "IDR depreciation 20%",
                "shock_magnitude": "-20% IDR/USD",
                "estimated_drawdown_pct": -18,
                "recovery_months_est": 12,
                "most_exposed_holdings": ["BBCA"],
            }
        ],
    },
    "decision_tree": {
        "nodes": [
            {
                "condition": "IHSG P/E > 18",
                "true_action": "Reduce equity to 50%, add bonds",
                "false_action": "Maintain current allocation",
                "priority": "HIGH",
            }
        ]
    },
    "recommended_portfolio": {
        "rebalance_urgency": "QUARTERLY",
        "target_allocations": [
            {"asset_class": "equity", "current_pct": 100, "target_pct": 70, "delta_pct": -30}
        ],
        "priority_actions": [
            {
                "action": "Add SBN bonds 20%",
                "rationale": "Reduce concentration risk.",
                "timeline": "Within 30 days",
            }
        ],
        "expected_improvement": "Lower volatility and improved Sharpe ratio.",
    },
}


@pytest.fixture
def mock_provider():
    provider = MagicMock()
    provider.extract_structured = AsyncMock(return_value=FIXTURE_REVIEW_RESPONSE)
    return provider


@pytest.fixture
def sample_request():
    return PortfolioReviewRequest(
        setup_name="Test Balanced Portfolio",
        archetype={"id": "balanced", "label": "Balanced / Moderate"},
        snapshot_label="May 2026 review",
        total_value=Decimal("100000000"),
        currency="IDR",
        holdings=[
            PortfolioHolding(
                name="Bank Central Asia",
                ticker="BBCA",
                asset_class="equity",
                allocation_pct=Decimal("40"),
            )
        ],
    )


@pytest.mark.asyncio
async def test_portfolio_reviewer_returns_valid_response(mock_provider, sample_request):
    reviewer = PortfolioReviewer(provider=mock_provider)
    response = await reviewer.review(sample_request)

    assert isinstance(response, PortfolioReviewResponse)
    assert response.diagnostics["health_score"] == 72
    assert response.diagnostics["archetype_fit_score"] == 85
    assert len(response.holdings_evaluation["holdings"]) == 1
    assert len(response.scenarios["scenarios"]) == 3
    assert response.resilience_test["overall_resilience_score"] == 65


@pytest.mark.asyncio
async def test_portfolio_reviewer_calls_provider_once(mock_provider, sample_request):
    reviewer = PortfolioReviewer(provider=mock_provider)
    await reviewer.review(sample_request)

    mock_provider.extract_structured.assert_called_once()
    call_kwargs = mock_provider.extract_structured.call_args
    assert "system_prompt" in call_kwargs.kwargs
    assert "user_text" in call_kwargs.kwargs
    assert "schema" in call_kwargs.kwargs


@pytest.mark.asyncio
async def test_portfolio_reviewer_prompt_contains_setup_name(mock_provider, sample_request):
    reviewer = PortfolioReviewer(provider=mock_provider)
    await reviewer.review(sample_request)

    user_text = mock_provider.extract_structured.call_args.kwargs["user_text"]
    assert sample_request.setup_name in user_text
    assert sample_request.snapshot_label in user_text


def test_portfolio_review_request_model_valid():
    req = PortfolioReviewRequest(
        setup_name="Test",
        archetype={"id": "balanced"},
        snapshot_label="Test snapshot",
        holdings=[],
    )
    assert req.currency == "IDR"
    assert req.total_value is None


def test_portfolio_holding_asset_class_validation():
    h = PortfolioHolding(name="BBCA", asset_class="equity")
    assert h.asset_class == "equity"
