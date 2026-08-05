import asyncio
import logging
from contextlib import asynccontextmanager
import datetime
import json
import re

import asyncpg
from fastapi import FastAPI, Form, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

# In the lifespan context manager or @app.on_event("shutdown"):
from app.observability import langfuse
from app.config import settings
from app.models import HealthResponse, ParseImageRequest, ParseRequest, ParseResponse, PdfParseResponse, CategorizeRequest, CategorizeResponse, SuggestCategoriesRequest, SuggestCategoriesResponse, MerchantSuggestion, PortfolioReviewRequest, PortfolioReviewResponse, JourneyAdviseRequest, JourneyAdviseResponse, EmbedTransactionsRequest, EmbedTransactionsResponse, SearchRequest, SearchResponse, AskRequest, AskResponse, CategorizeAgentRequest, CategorizeAgentResponse
from app.services.embedder import EmbeddingService, EmbedItem as EmbedItemInternal
from app.services.retriever import RetrievalService
from app.services.reranker import RerankerService
from app.services.answerer import AnswerService, SYSTEM_PROMPT, NARRATE_PROMPT, _format_context
from app.services.query_planner import QueryPlanner
from app.services.aggregator import AggregationService
from app.providers.factory import ProviderFactory
from app.providers.embedding_factory import create_embedding_provider
from app.services.llm_parser import LlmParser, LlmParseError
from app.services.pdf_extractor import PdfExtractor, PdfExtractionError
from app.services.categorizer import Categorizer
from app.services.merchant_suggester import MerchantSuggester
from app.services.portfolio_reviewer import PortfolioReviewer
from app.services.journey_advisor import JourneyAdvisor
from app.agents.categorizer_agent import CategorizerAgent, AgentRateLimitedError
from app.agents.tools.category_rules import load_rules
from app.agents.tools.categories import load_categories as load_agent_categories
from app.agents.tools.similarity import configure as configure_similarity_tool

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


async def _load_categories(db_url: str) -> list[str]:
    """Load the closed category vocabulary the planner selects from.

    Values are set by the 106-rule categorizer — a finite, known set. Failing to
    reach the DB at startup must not crash the service; the planner just sees an
    empty menu and extracts no categories until the next restart.
    """
    try:
        conn = await asyncpg.connect(db_url)
        try:
            rows = await conn.fetch(
                "SELECT DISTINCT category FROM transactions WHERE category <> '' ORDER BY category"
            )
        finally:
            await conn.close()
        return [r["category"] for r in rows]
    except Exception:
        logger.exception("failed to load category vocabulary — planner will see an empty list")
        return []


async def _load_rules(db_url: str) -> dict[str, str]:
    """Snapshot the 106 category rules for the agent's search_category_rules tool.

    Columns are (id, keyword, type, category, keyword_length) — see
    supabase/migrations/20260101000000_initial_schema.sql. Mirrors
    _load_categories(): failure degrades the tool, never blocks the service.
    """
    try:
        conn = await asyncpg.connect(db_url)
        try:
            rows = await conn.fetch("SELECT keyword, category FROM category_rules")
        finally:
            await conn.close()
        return {r["keyword"]: r["category"] for r in rows}
    except Exception:
        logger.exception("failed to load category rules — agent rule tool will return no matches")
        return {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    app.state.parser = LlmParser(provider=provider)
    app.state.pdf_extractor = PdfExtractor()
    app.state.categorizer = Categorizer(provider=provider)
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
    app.state.aggregator = AggregationService(db_url=settings.database_url)
    app.state.categories = await _load_categories(settings.database_url)
    app.state.answerer = AnswerService(
        retriever=app.state.retriever,
        reranker=app.state.reranker,
        provider=provider,
        planner=app.state.planner,
        aggregator=app.state.aggregator,
        categories=app.state.categories,
    )
    app.state.provider = provider

    # Chapter 7 — Transaction Categorizer Agent (smolagents ToolCallingAgent).
    # Tool 1 — rules snapshot straight from the DB.
    rules = await _load_rules(settings.database_url)
    load_rules(rules)
    # Tool 2 — hand the tool the SAME retriever instance /search and /ask use.
    configure_similarity_tool(app.state.retriever)
    # Tool 3 — reuse the vocabulary already loaded above for the query planner.
    load_agent_categories(app.state.categories)
    app.state.categorizer_agent = CategorizerAgent()
    logger.info(
        "Categorizer agent ready — %d rules, %d categories", len(rules), len(app.state.categories),
    )

    logger.info(
        "Loaded %d category vocabulary entries for the planner", len(app.state.categories),
    )
    logger.info(
        "AI service starting up | provider=%s | model=%s | embedding_provider=%s | embedding_model=%s",
        settings.ai_provider, settings.ai_model,
        settings.embedding_provider, embed_provider.model,
    )
    yield
    logger.info("AI service shutting down")
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

# Instrument FastAPI
FastAPIInstrumentor.instrument_app(app)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
async def categorize_with_agent(request: CategorizeAgentRequest) -> CategorizeAgentResponse:
    """Categorize a transaction using the ReAct agent with visible reasoning trace.

    Slower than /categorize (1-3 LLM calls vs 0-1) but shows its work — use for
    debugging edge cases, demos, or when the fast path returns 'Other'.
    """
    try:
        result = await asyncio.to_thread(
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
async def embed_transactions(request: EmbedTransactionsRequest) -> EmbedTransactionsResponse:
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
    embedded, skipped = await app.state.embedder.embed_and_store(items)
    return EmbedTransactionsResponse(
        embedded=embedded,
        skipped=skipped,
        model=settings.embedding_model,
    )


@app.post("/search", response_model=SearchResponse)
async def search_transactions(request: SearchRequest) -> SearchResponse:
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
    )
    if request.rerank:
        results = await app.state.reranker.rerank(request.query, results, top_k=request.top_k)
    return SearchResponse(
        results=results,
        query=request.query,
        total_found=len(results),
    )


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    """Grounded Q&A over the user's transactions (retrieve → rerank → synthesize)."""
    try:
        return await app.state.answerer.ask(request)
    except Exception as exc:
        logger.exception("ask failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc


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
async def ask_stream(request: AskRequest, req: Request) -> EventSourceResponse:
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
    """
    async def event_generator():
        today = datetime.date.today()
        try:
            plan = await app.state.planner.plan(request.query, today, app.state.categories)
        except Exception:
            logger.exception("planner failed")
            yield {"event": "error", "data": json.dumps({"detail": "planner_failed"})}
            return

        # ── aggregate: the number is computed before the model is ever called ──
        if plan.intent == "aggregate":
            agg = await app.state.aggregator.aggregate(plan)

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

            user_prompt = (
                f"VERIFIED TOTAL: Rp {agg.total_idr:,.0f} from {agg.count} transactions\n"
                f"Filters: categories={plan.categories} {plan.date_from}..{plan.date_to} flow={plan.flow}\n"
                f"Largest rows:\n{_format_context(agg.rows)}\n\nQuestion: {request.query}"
            )
            try:
                async for token in app.state.provider.stream_generate(NARRATE_PROMPT, user_prompt):
                    if await req.is_disconnected():
                        break
                    yield {"event": "token", "data": token}
            except Exception:
                logger.exception("stream_generate failed (aggregate)")
                yield {"event": "error", "data": json.dumps({"detail": "generation_failed"})}
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
        markers = {int(m) for m in re.findall(r"\[(\d+)\]", text)}
        valid = set(range(1, len(contexts) + 1))
        verified = bool(markers) and markers <= valid
        if markers - valid:
            logger.warning("stream cited unknown markers %s — flagged unverified", markers - valid)

        yield {"event": "done", "data": json.dumps(
            {"confident": True, "verified": verified, "intent": "lookup"})}

    return EventSourceResponse(event_generator())

