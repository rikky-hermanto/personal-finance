FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

# PF-156: Cloud Run's /tmp lives in RAM and is wiped on every cold start; ship the reranker model in the image.
ENV FLASHRANK_CACHE_DIR=/opt/flashrank
RUN python -c "from flashrank import Ranker; Ranker(model_name='ms-marco-MiniLM-L-12-v2', cache_dir='/opt/flashrank')"

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
