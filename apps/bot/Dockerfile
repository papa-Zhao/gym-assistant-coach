# Build context: apps/bot (docker build apps/bot)
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev
COPY app app
RUN useradd --system --no-create-home app
USER app
EXPOSE 8080
CMD uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
