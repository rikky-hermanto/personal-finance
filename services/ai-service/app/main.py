import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import HealthResponse, ParseRequest, ParseResponse, PdfParseResponse
from app.providers.factory import ProviderFactory
from app.services.llm_parser import LlmParser, LlmParseError
from app.services.pdf_extractor import PdfExtractor, PdfExtractionError

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
    logger.info("AI service starting up | provider=%s | model=%s", settings.ai_provider, settings.ai_model)
    yield
    logger.info("AI service shutting down")


app = FastAPI(
    title="Personal Finance AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

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
    bank_hint: str | None = None,
) -> PdfParseResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=422,
            detail=f"Expected application/pdf, got {file.content_type}",
        )

    pdf_bytes = await file.read()
    logger.info("PDF upload received | filename=%s | size=%d bytes", file.filename, len(pdf_bytes))

    try:
        text, page_count = app.state.pdf_extractor.extract(pdf_bytes)
    except PdfExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        parse_result = await app.state.parser.parse(
            ParseRequest(text=text, bank_hint=bank_hint)
        )
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return PdfParseResponse(**parse_result.model_dump(), pages_processed=page_count)
