import json
import logging

from app.models import PortfolioReviewRequest, PortfolioReviewResponse
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

REVIEW_SYSTEM_PROMPT = """You are a senior portfolio strategist at a top-tier global investment firm with deep expertise in Indonesian capital markets (IDX/BEI), ASEAN macroeconomics, and multi-asset portfolio construction.

Your task is to produce a comprehensive, actionable portfolio review structured across 7 sections. Be specific, rigorous, and grounded in the archetype's thesis and constraints. For Indonesian portfolios, reference IDX indices, Bank Indonesia policy, and local market dynamics where relevant.

Respond only with the JSON matching the provided schema. No prose outside the JSON.

Section guidelines:
1. diagnostics — overall health score (0-100), archetype fit score (0-100), key strengths (2-4 bullets), critical gaps (2-4 bullets), allocation_summary with current vs target pct per asset class
2. holdings_evaluation — for each holding: ticker/name, asset_class, current_allocation_pct, recommendation (HOLD/ADD/REDUCE/REPLACE/SELL), conviction (HIGH/MEDIUM/LOW), rationale (1-2 sentences), risk_flags list
3. macro_map — 4-6 macro factors relevant to this portfolio: factor name, direction (TAILWIND/HEADWIND/NEUTRAL), magnitude (HIGH/MEDIUM/LOW), portfolio_impact (1 sentence), source (BI rate / IDR/USD / commodity / global risk-off etc.)
4. scenarios — 3 scenarios (BULL/BASE/BEAR): label, probability_pct, key_driver, portfolio_return_est, action_trigger (what event would confirm this scenario), portfolio_adjustments list
5. resilience_test — overall_resilience_score (0-100), 3-5 stress tests: shock_name, shock_magnitude, estimated_drawdown_pct, recovery_months_est, most_exposed_holdings list
6. decision_tree — 3-5 decision nodes: condition (IF ...), true_action (THEN ...), false_action (ELSE ...), priority (HIGH/MEDIUM/LOW), child_nodes (nested, same structure, max 2 levels)
7. recommended_portfolio — rebalance_urgency (IMMEDIATE/WITHIN_30_DAYS/QUARTERLY/NONE), target_allocations list (asset_class, current_pct, target_pct, delta_pct), priority_actions list (action, rationale, timeline), expected_improvement (1-2 sentences)"""

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "diagnostics": {
            "type": "object",
            "properties": {
                "health_score": {"type": "number"},
                "archetype_fit_score": {"type": "number"},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "gaps": {"type": "array", "items": {"type": "string"}},
                "allocation_summary": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "asset_class": {"type": "string"},
                            "current_pct": {"type": "number"},
                            "target_pct": {"type": "number"},
                        },
                        "required": ["asset_class", "current_pct", "target_pct"],
                    },
                },
            },
            "required": ["health_score", "archetype_fit_score", "strengths", "gaps", "allocation_summary"],
        },
        "holdings_evaluation": {
            "type": "object",
            "properties": {
                "holdings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "ticker": {"type": "string"},
                            "asset_class": {"type": "string"},
                            "current_allocation_pct": {"type": "number"},
                            "recommendation": {"type": "string", "enum": ["HOLD", "ADD", "REDUCE", "REPLACE", "SELL"]},
                            "conviction": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                            "rationale": {"type": "string"},
                            "risk_flags": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["name", "asset_class", "recommendation", "conviction", "rationale"],
                    },
                },
            },
            "required": ["holdings"],
        },
        "macro_map": {
            "type": "object",
            "properties": {
                "factors": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "factor": {"type": "string"},
                            "direction": {"type": "string", "enum": ["TAILWIND", "HEADWIND", "NEUTRAL"]},
                            "magnitude": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                            "portfolio_impact": {"type": "string"},
                            "source": {"type": "string"},
                        },
                        "required": ["factor", "direction", "magnitude", "portfolio_impact"],
                    },
                },
            },
            "required": ["factors"],
        },
        "scenarios": {
            "type": "object",
            "properties": {
                "scenarios": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "enum": ["BULL", "BASE", "BEAR"]},
                            "probability_pct": {"type": "number"},
                            "key_driver": {"type": "string"},
                            "portfolio_return_est": {"type": "string"},
                            "action_trigger": {"type": "string"},
                            "portfolio_adjustments": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["label", "probability_pct", "key_driver", "portfolio_return_est"],
                    },
                },
            },
            "required": ["scenarios"],
        },
        "resilience_test": {
            "type": "object",
            "properties": {
                "overall_resilience_score": {"type": "number"},
                "stress_tests": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "shock_name": {"type": "string"},
                            "shock_magnitude": {"type": "string"},
                            "estimated_drawdown_pct": {"type": "number"},
                            "recovery_months_est": {"type": "number"},
                            "most_exposed_holdings": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["shock_name", "shock_magnitude", "estimated_drawdown_pct"],
                    },
                },
            },
            "required": ["overall_resilience_score", "stress_tests"],
        },
        "decision_tree": {
            "type": "object",
            "properties": {
                "nodes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "condition": {"type": "string"},
                            "true_action": {"type": "string"},
                            "false_action": {"type": "string"},
                            "priority": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                        },
                        "required": ["condition", "true_action", "false_action", "priority"],
                    },
                },
            },
            "required": ["nodes"],
        },
        "recommended_portfolio": {
            "type": "object",
            "properties": {
                "rebalance_urgency": {"type": "string", "enum": ["IMMEDIATE", "WITHIN_30_DAYS", "QUARTERLY", "NONE"]},
                "target_allocations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "asset_class": {"type": "string"},
                            "current_pct": {"type": "number"},
                            "target_pct": {"type": "number"},
                            "delta_pct": {"type": "number"},
                        },
                        "required": ["asset_class", "current_pct", "target_pct", "delta_pct"],
                    },
                },
                "priority_actions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "action": {"type": "string"},
                            "rationale": {"type": "string"},
                            "timeline": {"type": "string"},
                        },
                        "required": ["action", "rationale", "timeline"],
                    },
                },
                "expected_improvement": {"type": "string"},
            },
            "required": ["rebalance_urgency", "target_allocations", "priority_actions"],
        },
    },
    "required": [
        "diagnostics", "holdings_evaluation", "macro_map",
        "scenarios", "resilience_test", "decision_tree", "recommended_portfolio",
    ],
}


def _build_user_prompt(req: PortfolioReviewRequest) -> str:
    archetype_json = json.dumps(req.archetype, indent=2)
    holdings_lines = "\n".join(
        f"  - {h.name} ({h.ticker or 'no ticker'}) | {h.asset_class}"
        + (f" | {h.allocation_pct}%" if h.allocation_pct is not None else "")
        + (f" | sector: {h.sector}" if h.sector else "")
        + (f" | qty: {h.quantity}" if h.quantity is not None else "")
        + (f" | avg cost: {h.avg_buy_price}" if h.avg_buy_price is not None else "")
        for h in req.holdings
    )
    total_line = (
        f"Total portfolio value: {req.total_value:,.0f} {req.currency}"
        if req.total_value is not None
        else f"Total value: not provided ({req.currency})"
    )
    return f"""## Portfolio: {req.setup_name}
Snapshot: {req.snapshot_label}
{total_line}

## Investor Archetype
{archetype_json}

## Current Holdings ({len(req.holdings)} positions)
{holdings_lines if req.holdings else "  (no holdings entered)"}

Produce a comprehensive portfolio review across all 7 sections."""


class PortfolioReviewer:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def review(self, req: PortfolioReviewRequest) -> PortfolioReviewResponse:
        user_text = _build_user_prompt(req)
        logger.info(
            "Starting portfolio review | setup=%s | holdings=%d | provider=%s",
            req.setup_name, len(req.holdings), type(self._provider).__name__,
        )

        raw = await self._provider.extract_structured(
            system_prompt=REVIEW_SYSTEM_PROMPT,
            user_text=user_text,
            schema=REVIEW_SCHEMA,
        )

        response = PortfolioReviewResponse.model_validate(raw)
        logger.info("Portfolio review complete | setup=%s", req.setup_name)
        return response
