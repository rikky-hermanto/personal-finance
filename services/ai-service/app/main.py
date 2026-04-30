import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import HealthResponse, ParseRequest, ParseResponse
from app.providers.factory import ProviderFactory
from app.services.llm_parser import LlmParser, LlmParseError

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    app.state.parser = LlmParser(provider=provider)
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
