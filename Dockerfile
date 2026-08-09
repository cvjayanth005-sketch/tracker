FROM node:24-alpine AS frontend

ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TRACKER_DB_PATH=/data/tracker.sqlite3
ENV TRACKER_STATIC_DIR=/app/static

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /build/frontend/dist ./static

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
