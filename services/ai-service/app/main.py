import asyncio
import contextvars
import logging
from contextlib import asynccontextmanager
import datetime
import json
import re
import secrets
import uuid

import asyncpg
from fastapi import Depends, FastAPI, Form, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

# In the lifespan context manager or @app.on_event("shutdown"):
from app.observability import langfuse
from app.config import settings
from app.owner import require_owner, require_user_token
from app.models import HealthResponse, ParseImageRequest, ParseRequest, ParseResponse, PdfParseResponse, CategorizeRequest, CategorizeResponse, SuggestCategoriesRequest, SuggestCategoriesResponse, MerchantSuggestion, PortfolioReviewRequest, PortfolioReviewResponse, JourneyAdviseRequest, JourneyAdviseResponse, EmbedTransactionsRequest, EmbedTransactionsResponse, SearchRequest, SearchResponse, AskRequest, AskResponse, CategorizeAgentRequest, CategorizeAgentResponse, FollowUpRequest, FollowUpResponse, AdvisorRequest, AdvisorResponse
from app.services.embedder import EmbeddingService, EmbedItem as EmbedItemInternal
from app.services.retriever import RetrievalService
from app.services.reranker import RerankerService
from app.services.answerer import AnswerService, SYSTEM_PROMPT, NARRATE_PROMPT, _format_context
from app.services.query_planner import QueryPlanner
from app.services.aggregator import AggregationService
from app.services.followup_suggester import FollowUpSuggester
from app.services.guardrails import flag_context_rows, injection_scanner, output_guard, record_flag
from app.services.vocabulary import CategoryVocabulary
from app.providers.factory import ProviderFactory
from app.providers.embedding_factory import create_embedding_provider
from app.services.llm_parser import LlmParser, LlmParseError
from app.services.pdf_extractor import PdfExtractor, PdfExtractionError
from app.services.categorization_factory import create_categorizer
from app.services.merchant_suggester import MerchantSuggester
from app.services.portfolio_reviewer import PortfolioReviewer
from app.services.journey_advisor import JourneyAdvisor
from app.services.advisor import AdvisorService
from app.agents.categorizer_agent import CategorizerAgent, AgentRateLimitedError
from app.agents.owner_context import OwnerContext, bind_owner_context
from app.agents.tools.categories import FALLBACK_CATEGORIES
from app.services.owner_rules import load_owner_rules
from app.mcp_server import (
    mcp as mcp_server,
    set_pool as mcp_set_pool,
    set_retriever as mcp_set_retriever,
    set_owner as mcp_set_owner,
)

from opentelemetry import trace, metrics
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor


_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)

# PF-AI009 — the MCP server mounted at /mcp over SSE. Built once at import so its
# session-manager lifespan can be driven from the main FastAPI lifespan below.
_mcp_app = mcp_server.http_app(path="/", transport="sse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    app.state.parser = LlmParser(provider=provider)
    app.state.pdf_extractor = PdfExtractor()
    app.state.categorizer, jev_client = create_categorizer(settings, provider)
    app.state.suggester = MerchantSuggester(provider=provider)
    app.state.portfolio_reviewer = PortfolioReviewer(provider=provider)
    app.state.journey_advisor = JourneyAdvisor(provider=provider)
    embed_provider = create_embedding_provider(settings)
    app.state.embedder = EmbeddingService(provider=embed_provider, db_url=settings.database_url)
    app.state.retriever = RetrievalService(provider=embed_provider, db_url=settings.database_url)
    app.state.reranker = RerankerService()
    # Query router: one temperature-0 planner call classifies intent + extracts filters;
    # aggregate questions go to deterministic SQL, lookups keep the retrieve→rerank funnel.
    app.state.planner = QueryPlanner(provider=provider)
    app.state.followup_suggester = FollowUpSuggester(provider=provider)
    app.state.aggregator = AggregationService(db_url=settings.database_url)
    # PF-S15: the planner's category menu is loaded per owner, per request. There is
    # no global cross-user vocabulary any more.
    app.state.vocabulary = CategoryVocabulary(db_url=settings.database_url)
    app.state.answerer = AnswerService(
        retriever=app.state.retriever,
        reranker=app.state.reranker,
        provider=provider,
        planner=app.state.planner,
        aggregator=app.state.aggregator,
    )
    app.state.provider = provider

    # Chapter 7 — Transaction Categorizer Agent (smolagents ToolCallingAgent).
    # PF-S15: its rules, categories and similarity search are bound per request
    # (see /categorize-agent), so nothing user-specific is loaded at startup.
    app.state.categorizer_agent = CategorizerAgent()
    logger.info(
        "AI service starting up | provider=%s | model=%s | categorization_backend=%s | "
        "categorization_model=%s | embedding_provider=%s | embedding_model=%s",
        settings.ai_provider, settings.ai_model,
        settings.categorization_backend,
        settings.jev_model if settings.categorization_backend == "jev" else settings.ai_model,
        settings.embedding_provider, embed_provider.model,
    )

    # PF-AI009 — wire the MCP tools. RetrievalService opens per-request owner
    # connections, so there is no single pool to borrow; the MCP tools get a
    # dedicated asyncpg pool. Resolve the one local owner for semantic search
    # (PF-S15 made the retriever owner-scoped).
    mcp_pool = await asyncpg.create_pool(settings.database_url)
    app.state.mcp_pool = mcp_pool
    mcp_set_pool(mcp_pool)
    mcp_set_retriever(app.state.retriever)
    async with mcp_pool.acquire() as conn:
        owner_row = await conn.fetchrow(
            "SELECT user_id FROM transactions WHERE user_id IS NOT NULL LIMIT 1"
        )
    if owner_row is not None:
        mcp_set_owner(owner_row["user_id"])
    else:
        logger.warning(
            "MCP: no owner found in transactions — search_transactions_semantic "
            "will error until transaction data exists"
        )

    try:
        # Drive the MCP SSE sub-app's lifespan so its session manager starts.
        async with _mcp_app.lifespan(app):
            yield
    finally:
        logger.info("AI service shutting down")
        await mcp_pool.close()
        if jev_client is not None:
            await jev_client.aclose()
        langfuse.flush()   # drain buffered traces before process exits


# OpenTelemetry Initialization
resource = Resource(attributes={
    SERVICE_NAME: settings.otel_service_name
})

# Tracing
provider = TracerProvider(resource=resource)
# Note: insecure=True is required since we're talking to Alloy over local network without TLS
span_exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint, insecure=True)
processor = BatchSpanProcessor(span_exporter)
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

# Metrics
metric_exporter = OTLPMetricExporter(endpoint=settings.otel_exporter_otlp_endpoint, insecure=True)
reader = PeriodicExportingMetricReader(metric_exporter)
meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
metrics.set_meter_provider(meter_provider)

# Logging
LoggingInstrumentor().instrument(set_logging_format=True)


app = FastAPI(
    title="Personal Finance AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

# Internal routes the .NET API calls with scoped input. /journey/advise and
# /portfolio-review only see the caller's data sent in the request body; they
# never query the database.
_PILOT_INTERNAL_ROUTES = {
    "/parse", "/parse-pdf", "/parse-image", "/categorize", "/suggest-categories",
    "/journey/advise", "/portfolio-review",
}

# PF-S15: routes that read or write transactions. They reopen only behind
# AI_CHAT_ENABLED, and each handler takes its owner from require_owner (internal key
# plus a server-signed owner token), so a request without either gets 401.
_OWNER_CHAT_ROUTES = {"/ask", "/ask/stream", "/ask/followups", "/search", "/embed-transactions"}

# PF-S15 Phase 2: the agents, behind AI_AGENTS_ENABLED. Same owner dependency; the
# advisor also needs the caller's own Supabase token to read data through the API.
_OWNER_AGENT_ROUTES = {"/advisor", "/categorize-agent"}


@app.middleware("http")
async def pilot_access_gate(request: Request, call_next):
    if request.url.path == "/health" or request.url.path.startswith("/mcp"):
        # PF-AI009: the MCP SSE sub-app mounted at /mcp inherits the service's
        # no-auth local posture (a bearer guard is deferred to PF-S08).
        return await call_next(request)
    if request.url.path in _OWNER_CHAT_ROUTES:
        if not settings.ai_chat_enabled:
            return JSONResponse({"detail": "Unavailable during the Cashflow pilot"}, status_code=404)
        return await call_next(request)
    if request.url.path in _OWNER_AGENT_ROUTES:
        if not settings.ai_agents_enabled:
            return JSONResponse({"detail": "Unavailable during the Cashflow pilot"}, status_code=404)
        return await call_next(request)
    if not settings.cashflow_pilot_enabled or request.url.path not in _PILOT_INTERNAL_ROUTES:
        return JSONResponse({"detail": "Unavailable during the Cashflow pilot"}, status_code=404)
    supplied = request.headers.get("x-internal-api-key", "")
    if not settings.internal_api_key or not secrets.compare_digest(supplied, settings.internal_api_key):
        return JSONResponse({"detail": "Internal authentication required"}, status_code=401)
    return await call_next(request)

# Instrument FastAPI
FastAPIInstrumentor.instrument_app(app)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PF-AI009 — mount the MCP SSE sub-app. Its lifespan is driven from the main
# lifespan above (async with _mcp_app.lifespan(app)).
app.mount("/mcp", _mcp_app)

# Chapter 8 — advisor_graph (app/agents/financial_advisor.py) is a module-level
# singleton compiled at import time; no lifespan wiring needed.
_advisor = AdvisorService()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="healthy", version="0.1.0")


@app.post("/parse", response_model=ParseResponse)
async def parse_transactions(request: ParseRequest) -> ParseResponse:
    try:
        return await app.state.parser.parse(request)
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/parse-pdf", response_model=PdfParseResponse)
async def parse_pdf(
    file: UploadFile = File(...),
    bank_hint: str | None = Form(default=None),
    password: str | None = Form(default=None),
) -> PdfParseResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=422,
            detail=f"Expected application/pdf, got {file.content_type}",
        )

    pdf_bytes = await file.read()
    logger.info("PDF upload received | filename=%s | size=%d bytes", file.filename, len(pdf_bytes))

    try:
        text, page_count = app.state.pdf_extractor.extract(pdf_bytes, password=password)
    except PdfExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        parse_result = await app.state.parser.parse(
            ParseRequest(text=text, bank_hint=bank_hint)
        )
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return PdfParseResponse(**parse_result.model_dump(), pages_processed=page_count)


@app.post("/parse-image", response_model=ParseResponse)
async def parse_image(
    file: UploadFile = File(...),
    bank_hint: str | None = Form(default=None),
) -> ParseResponse:
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported image type '{file.content_type}'. Accepted: {sorted(_ALLOWED_IMAGE_TYPES)}",
        )

    img_bytes = await file.read()
    if len(img_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds 10 MB limit ({len(img_bytes)} bytes received)",
        )

    logger.info(
        "Image upload received | filename=%s | content_type=%s | size=%d bytes",
        file.filename, file.content_type, len(img_bytes),
    )

    try:
        return await app.state.parser.parse_image(
            image_bytes=img_bytes,
            media_type=file.content_type,
            request=ParseImageRequest(bank_hint=bank_hint),
        )
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.post("/categorize", response_model=CategorizeResponse)
async def categorize_transaction(request: CategorizeRequest) -> CategorizeResponse:
    if not request.available_categories:
        raise HTTPException(status_code=422, detail="available_categories must not be empty")
    return await app.state.categorizer.categorize(request)


@app.post("/categorize-agent", response_model=CategorizeAgentResponse)
async def categorize_with_agent(
    request: CategorizeAgentRequest, owner_id: uuid.UUID = Depends(require_owner)
) -> CategorizeAgentResponse:
    """Categorize a transaction using the ReAct agent with visible reasoning trace.

    Slower than /categorize (1-3 LLM calls vs 0-1) but shows its work — use for
    debugging edge cases, demos, or when the fast path returns 'Other'.

    PF-S15: internal-only (no UI or .NET caller yet). Every tool sees only this
    caller's private rules plus the shared presets, their categories, and an
    owner-scoped similarity search.
    """
    owner_context = OwnerContext(
        owner_id=owner_id,
        rules=await load_owner_rules(settings.database_url, owner_id),
        categories=await app.state.vocabulary.for_owner(owner_id) or list(FALLBACK_CATEGORIES),
        retriever=app.state.retriever,
    )
    try:
        with bind_owner_context(owner_context):
            # The agent runs in a worker thread; hand it a copy of this request's context.
            result = await asyncio.to_thread(
                contextvars.copy_context().run,
                app.state.categorizer_agent.categorize,
                request.description,
                request.wallet,
                request.amount_idr,
            )
        return CategorizeAgentResponse(
            category=result.category,
            confidence=result.confidence,
            reasoning=result.reasoning,
            tool_calls_count=result.tool_calls_count,
        )
    except AgentRateLimitedError as exc:
        # Distinct from llm_parse_error: the provider's own quota is exhausted,
        # not a malformed/unparseable response — a caller should back off and
        # retry later (or switch provider), not treat this as a code bug.
        logger.warning("categorize-agent rate-limited: %s", exc)
        raise HTTPException(status_code=502, detail="llm_rate_limited") from exc
    except Exception as exc:
        logger.exception("agent categorization failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc


@app.post("/advisor", response_model=AdvisorResponse)
async def advisor(
    request: AdvisorRequest,
    owner_id: uuid.UUID = Depends(require_owner),
    user_token: str = Depends(require_user_token),
) -> AdvisorResponse:
    """Stateful financial advisor — multi-step, tool-grounded, session-persistent."""
    try:
        return await _advisor.ask(request, owner_id=owner_id, user_token=user_token)
    except Exception as exc:
        logger.exception("advisor failed")
        raise HTTPException(status_code=502, detail="advisor_error") from exc


@app.post("/portfolio-review", response_model=PortfolioReviewResponse)
async def portfolio_review(req: PortfolioReviewRequest) -> PortfolioReviewResponse:
    try:
        return await app.state.portfolio_reviewer.review(req)
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail={"code": "llm_parse_error", "message": str(e)})
    except Exception as e:
        logger.exception("Unexpected error in portfolio_review")
        raise HTTPException(status_code=502, detail={"code": "provider_unavailable", "message": str(e)})


@app.post("/journey/advise", response_model=JourneyAdviseResponse)
async def journey_advise_endpoint(req: JourneyAdviseRequest) -> JourneyAdviseResponse:
    try:
        return await app.state.journey_advisor.advise(req)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail={"code": "llm_parse_error", "message": str(e)})
    except Exception as e:
        logger.exception("Unexpected error in journey_advise")
        raise HTTPException(status_code=502, detail={"code": "provider_unavailable", "message": str(e)})


@app.post("/suggest-categories", response_model=SuggestCategoriesResponse)
async def suggest_categories(request: SuggestCategoriesRequest) -> SuggestCategoriesResponse:
    suggestions_raw = await app.state.suggester.suggest_batch(
        request.merchant_patterns,
        request.available_categories,
    )
    suggestions = [MerchantSuggestion(**s) for s in suggestions_raw if s.get("confidence", 0) > 0]
    return SuggestCategoriesResponse(suggestions=suggestions)


@app.post("/embed-transactions", response_model=EmbedTransactionsResponse)
async def embed_transactions(
    request: EmbedTransactionsRequest, owner_id: uuid.UUID = Depends(require_owner)
) -> EmbedTransactionsResponse:
    """Embed a batch of transactions and store vectors to transaction_embeddings."""
    items = [
        EmbedItemInternal(
            transaction_id=i.transaction_id,
            description=i.description,
            remarks=i.remarks,
            category=i.category,
            wallet=i.wallet,
        )
        for i in request.items
    ]
    embedded, skipped = await app.state.embedder.embed_and_store(items, owner_id)
    return EmbedTransactionsResponse(
        embedded=embedded,
        skipped=skipped,
        model=settings.embedding_model,
    )


@app.post("/search", response_model=SearchResponse)
async def search_transactions(
    request: SearchRequest, owner_id: uuid.UUID = Depends(require_owner)
) -> SearchResponse:
    """Semantic search over transactions using pgvector cosine similarity."""
    # Rerank needs a wider candidate pool to select from — re-ordering the
    # same top_k barely moves rankings (see eval_retrieval.py --rerank).
    fetch_k = max(request.top_k, 10) if request.rerank else request.top_k
    results = await app.state.retriever.search(
        query=request.query,
        top_k=fetch_k,
        min_similarity=request.min_similarity,
        category=request.category,
        account=request.account,
        date_from=request.date_from,
        date_to=request.date_to,
        search_mode=request.search_mode,
        owner_id=owner_id,
    )
    if request.rerank:
        results = await app.state.reranker.rerank(request.query, results, top_k=request.top_k)
    return SearchResponse(
        results=results,
        query=request.query,
        total_found=len(results),
    )


def _reject_flagged_query(query: str) -> None:
    """PF-AI011 input guard: scan the raw query before any LLM call (the planner is one).

    Runs on the raw text so the scanner sees the attack before masking can mangle it, and
    outside the handlers' broad `except Exception` so the 400 is not turned into a 502.
    """
    scan = injection_scanner.scan(query)
    if scan.flagged:
        record_flag("input_guard", "security.flagged", scan.matched_rules)
        logger.warning("chat query rejected by the input guard rules=%s", scan.matched_rules)
        raise HTTPException(status_code=400, detail="input_flagged")


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest, owner_id: uuid.UUID = Depends(require_owner)) -> AskResponse:
    """Grounded Q&A over the user's transactions (retrieve → rerank → synthesize)."""
    _reject_flagged_query(request.query)
    try:
        categories = await app.state.vocabulary.for_owner(owner_id)
        return await app.state.answerer.ask(request, owner_id=owner_id, categories=categories)
    except Exception as exc:
        logger.exception("ask failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc


@app.post("/ask/followups", response_model=FollowUpResponse)
async def ask_followups(
    request: FollowUpRequest, owner_id: uuid.UUID = Depends(require_owner)
) -> FollowUpResponse:
    """Suggest 3 self-contained follow-up questions for the answer just streamed.

    Deliberately never raises. Suggestions are decorative — a provider failure
    returns an empty list and the client falls back to its static chips, rather
    than painting an error beside an answer that succeeded.
    """
    categories = await app.state.vocabulary.for_owner(owner_id)
    questions = await app.state.followup_suggester.suggest(request, categories)
    return FollowUpResponse(questions=questions)


def _context_payload(rows) -> list[dict]:
    return [
        {
            "transaction_id": r.transaction_id,
            "date": r.date,
            "description": r.description,
            "amount_idr": r.amount_idr,
            "flow": r.flow,
            "wallet": r.wallet,
        }
        for r in rows
    ]


@app.post("/ask/stream")
async def ask_stream(
    request: AskRequest, req: Request, owner_id: uuid.UUID = Depends(require_owner)
) -> EventSourceResponse:
    """Stream the routed RAG answer token-by-token over SSE.

    A temperature-0 planner classifies intent first, then the stream splits:
      aggregate → SQL total computed FIRST, sent in `metadata` + `done` as `total_idr`;
                  the LLM only narrates the number, so the prose can never define it.
      lookup    → retrieve→rerank→cite funnel; tokens are buffered WHILE forwarded
                  (zero TTFT cost), then `[n]` markers are validated post-stream.

    Event protocol:
      metadata  → JSON: {contexts:[...], intent, total_idr?, count?}
      token     → string: one text chunk from the LLM
      done      → JSON: {confident, verified, intent, total_idr?}
      error     → JSON: {detail}; `output_flagged` means the finished answer leaked the prompt
                  scaffold and the client must drop the tokens it already received.
    """
    _reject_flagged_query(request.query)

    async def event_generator():
        today = datetime.date.today()
        try:
            categories = await app.state.vocabulary.for_owner(owner_id)
            plan = await app.state.planner.plan(request.query, today, categories)
        except Exception:
            logger.exception("planner failed")
            yield {"event": "error", "data": json.dumps({"detail": "planner_failed"})}
            return

        # ── aggregate: the number is computed before the model is ever called ──
        if plan.intent == "aggregate":
            agg = await app.state.aggregator.aggregate(plan, owner_id=owner_id)

            if agg.count == 0:
                yield {"event": "metadata", "data": json.dumps(
                    {"contexts": [], "intent": "aggregate", "total_idr": 0.0, "count": 0})}
                yield {"event": "done", "data": json.dumps(
                    {"confident": False, "verified": True, "intent": "aggregate", "total_idr": 0.0})}
                return

            total_idr = float(agg.total_idr)
            yield {"event": "metadata", "data": json.dumps(
                {"contexts": _context_payload(agg.rows), "intent": "aggregate",
                 "total_idr": total_idr, "count": agg.count})}

            flag_context_rows(agg.rows)
            user_prompt = (
                f"VERIFIED TOTAL: Rp {agg.total_idr:,.0f} from {agg.count} transactions\n"
                f"Filters: categories={plan.categories} {plan.date_from}..{plan.date_to} flow={plan.flow}\n"
                f"Largest rows:\n{_format_context(agg.rows)}\n\nQuestion: {request.query}"
            )
            narration: list[str] = []
            try:
                async for token in app.state.provider.stream_generate(NARRATE_PROMPT, user_prompt):
                    if await req.is_disconnected():
                        break
                    narration.append(token)
                    yield {"event": "token", "data": token}
            except Exception:
                logger.exception("stream_generate failed (aggregate)")
                yield {"event": "error", "data": json.dumps({"detail": "generation_failed"})}
                return

            if output_guard.check("".join(narration)).flagged:
                logger.warning("aggregate stream leaked the prompt scaffold: ending with output_flagged")
                yield {"event": "error", "data": json.dumps({"detail": "output_flagged"})}
                return

            # verified=True by construction: total_idr came from SQL, not the prose.
            yield {"event": "done", "data": json.dumps(
                {"confident": True, "verified": True, "intent": "aggregate", "total_idr": total_idr})}
            return

        # ── lookup: PART 1 funnel + planner-extracted filters ─────────────────
        category = request.category or (plan.categories[0] if plan.categories else None)
        date_from = request.date_from or plan.date_from
        date_to = request.date_to or plan.date_to

        candidates = await app.state.retriever.search(
            query=request.query, top_k=10,
            category=category, account=request.account,
            date_from=date_from, date_to=date_to,
            # search_mode intentionally omitted — the Ch6 eval measured "vector"
            # (the default) beating "hybrid" on this corpus; see advanced-rag-notes.md
            owner_id=owner_id,
        )
        contexts = await app.state.reranker.rerank(
            request.query, candidates, top_k=request.top_k or 3
        )

        if not contexts:
            yield {"event": "done", "data": json.dumps(
                {"confident": False, "verified": False, "intent": "lookup", "contexts": []})}
            return

        # Send contexts BEFORE generation — client renders citations immediately.
        yield {"event": "metadata", "data": json.dumps(
            {"contexts": _context_payload(contexts), "intent": "lookup"})}

        flag_context_rows(contexts)
        user_prompt = (
            f"Context transactions:\n{_format_context(contexts)}\n\n"
            f"Question: {request.query}"
        )

        # Buffer WHILE forwarding — the guard costs zero time-to-first-token.
        buffer: list[str] = []
        try:
            async for token in app.state.provider.stream_generate(SYSTEM_PROMPT, user_prompt):
                if await req.is_disconnected():
                    break
                buffer.append(token)
                yield {"event": "token", "data": token}
        except Exception:
            logger.exception("stream_generate failed (lookup)")
            yield {"event": "error", "data": json.dumps({"detail": "generation_failed"})}
            return

        # Post-stream guard: every [n] marker must map to a context we sent. An
        # answer that cites nothing is unverifiable by definition (verified=False).
        text = "".join(buffer)
        if output_guard.check(text).flagged:
            # Tokens already reached the client; the error event tells it to discard them.
            logger.warning("lookup stream leaked the prompt scaffold: ending with output_flagged")
            yield {"event": "error", "data": json.dumps({"detail": "output_flagged"})}
            return
        markers = {int(m) for m in re.findall(r"\[(\d+)\]", text)}
        valid = set(range(1, len(contexts) + 1))
        verified = bool(markers) and markers <= valid
        if markers - valid:
            logger.warning("stream cited unknown markers %s — flagged unverified", markers - valid)

        yield {"event": "done", "data": json.dumps(
            {"confident": True, "verified": verified, "intent": "lookup"})}

    return EventSourceResponse(event_generator())

