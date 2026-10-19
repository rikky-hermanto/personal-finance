"""Per-request owner context for the categorizer agent's smolagents tools (PF-S15).

The tools are module-level objects shared by every request, so they read the caller's
rules, categories and retriever from a ContextVar instead of startup globals. The route
binds it per request and runs the agent with a copy of that context, so the worker
thread (and smolagents' parallel tool threads, which copy the context too) see only
this caller's values. With nothing bound, every tool fails closed.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class OwnerContext:
    owner_id: uuid.UUID
    # Lower-cased keyword -> category: the caller's private rules, then the shared presets.
    rules: dict[str, str] = field(default_factory=dict)
    categories: list[str] = field(default_factory=list)
    retriever: Any = None


_CURRENT: ContextVar[OwnerContext | None] = ContextVar("agent_owner_context", default=None)


def current_owner_context() -> OwnerContext | None:
    return _CURRENT.get()


@contextmanager
def bind_owner_context(context: OwnerContext):
    reset = _CURRENT.set(context)
    try:
        yield context
    finally:
        _CURRENT.reset(reset)
