from __future__ import annotations

from collections.abc import Callable
from typing import Any

from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy

from app.config import Settings
from app.providers.base import LlmProvider
from app.services.categorizer import Categorizer
from app.services.jev_categorizer import JevCategorizer


def create_categorizer(
    config: Settings,
    legacy_provider: LlmProvider,
    *,
    client_factory: Callable[..., Any] = AsyncTypeSafeClient,
) -> tuple[Categorizer | JevCategorizer, AsyncTypeSafeClient | None]:
    if config.categorization_backend == "llm":
        return Categorizer(provider=legacy_provider), None

    config.validate_categorization_backend()
    assert config.jev_acceptance_threshold is not None
    client = client_factory(
        api_key=config.typesafe_api_key,
        model=config.jev_model,
        retry=RetryPolicy(max_retries=0),
        timeout=config.jev_timeout_seconds,
    )
    return (
        JevCategorizer(
            client,
            model=config.jev_model,
            acceptance_threshold=config.jev_acceptance_threshold,
            deadline_seconds=config.jev_timeout_seconds,
        ),
        client,
    )
