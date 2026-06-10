import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

# In the lifespan context manager or @app.on_event("shutdown"):
from app.observability import langfuse
from app.config import settings
from app.models import HealthResponse, ParseImageRequest, ParseRequest, ParseResponse, PdfParseResponse, CategorizeRequest, CategorizeResponse, SuggestCategoriesRequest, SuggestCategoriesResponse, MerchantSuggestion, PortfolioReviewRequest, PortfolioReviewResponse, JourneyAdviseRequest, JourneyAdviseResponse, EmbedTransactionsRequest, EmbedTransactionsResponse, SearchRequest, SearchResponse
from app.services.embedder import EmbeddingService, EmbedItem as EmbedItemInternal
from app.services.retriever import RetrievalService
from app.providers.factory import ProviderFactory
from app.services.llm_parser import LlmParser, LlmParseError
from app.services.pdf_extractor import PdfExtractor, PdfExtractionError
from app.services.categorizer import Categorizer
from app.services.merchant_suggester import MerchantSuggester
from app.services.portfolio_reviewer import PortfolioReviewer
from app.services.journey_advisor import advise as journey_advise

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    app.state.parser = LlmParser(provider=provider)
    app.state.pdf_extractor = PdfExtractor()
    app.state.categorizer = Categorizer(provider=provider)
    app.state.suggester = MerchantSuggester(provider=provider)
    app.state.portfolio_reviewer = PortfolioReviewer(provider=provider)
    app.state.embedder = EmbeddingService()
    app.state.retriever = RetrievalService()
    logger.info("AI service starting up | provider=%s | model=%s", settings.ai_provider, settings.ai_model)
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
        return await journey_advise(req)
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
    results = await app.state.retriever.search(
        query=request.query,
        top_k=request.top_k,
        min_similarity=request.min_similarity,
    )
    return SearchResponse(
        results=results,
        query=request.query,
        total_found=len(results),
    )
