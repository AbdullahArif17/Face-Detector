from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.routers import (
    attendance,
    auth,
    companies,
    cron,
    employees,
    face,
    students,
    users,
    webhooks,
    whatsapp,
)

from contextlib import asynccontextmanager
import httpx
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.rate_limit import limiter


def validate_runtime_configuration() -> None:
    if settings.app_env.lower() != "production":
        return
    if len(settings.secret_key) < 32 or settings.secret_key == "your-secret-key-here":
        raise RuntimeError("SECRET_KEY must be a strong production secret")
    if "*" in settings.frontend_origins:
        raise RuntimeError("FRONTEND_ORIGINS cannot contain '*' in production")

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_configuration()
    app.state.http_client = httpx.AsyncClient(timeout=30.0)
    yield
    await app.state.http_client.aclose()

app = FastAPI(
    title="Face Attendance API",
    version="0.1.0",
    description="Core API for the AI Face Recognition Attendance SaaS.",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(employees.router)
app.include_router(students.router)
app.include_router(attendance.router)
app.include_router(face.router)
app.include_router(users.router)
app.include_router(whatsapp.router)
app.include_router(cron.router)
app.include_router(webhooks.router)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def readiness_check() -> JSONResponse:
    database_ready = False
    ai_service_ready = False

    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        database_ready = True
    except Exception:
        database_ready = False

    try:
        response = await app.state.http_client.get(
            f"{settings.ai_service_url}/health",
            timeout=10.0,
        )
        if response.status_code == 200:
            health_payload = response.json()
            model_matches = (
                str(health_payload.get("model", "")).casefold()
                == settings.ai_model_name.casefold()
            )
            key_configuration_matches = not health_payload.get(
                "api_key_required",
                False,
            ) or bool(settings.ai_api_key)
            ai_service_ready = model_matches and key_configuration_matches
    except (httpx.RequestError, ValueError):
        ai_service_ready = False

    biometric_storage_ready = bool(settings.biometric_encryption_key) or (
        settings.app_env.lower() != "production"
    )
    ready = database_ready and ai_service_ready and biometric_storage_ready
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "not_ready",
            "components": {
                "database": database_ready,
                "ai_service": ai_service_ready,
                "biometric_encryption": biometric_storage_ready,
            },
        },
    )
