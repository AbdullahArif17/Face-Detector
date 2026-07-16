from contextlib import asynccontextmanager
import hmac
import json
import logging
from time import perf_counter
from urllib.parse import parse_qsl, urlsplit
from uuid import uuid4

import httpx
from cryptography.fernet import Fernet
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.routers import (
    attendance,
    auth,
    companies,
    employees,
    face,
    students,
    users,
    webhooks,
    whatsapp,
)

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.rate_limit import limiter


logger = logging.getLogger("face_attendance_api")
logger.setLevel(logging.INFO)
SAFE_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}
STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT_PATHS = {"/auth/login", "/auth/signup"}


def _is_local_hostname(hostname: str | None) -> bool:
    return hostname in {None, "localhost", "127.0.0.1", "::1"}


def _validate_fernet_key(name: str, key: str | None) -> None:
    if not key:
        raise RuntimeError(f"{name} is required in production")
    try:
        Fernet(key.encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"{name} must be a valid Fernet key") from exc


def apply_security_headers(response: JSONResponse | Response) -> None:
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("Pragma", "no-cache")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
    )
    if settings.app_env.lower() == "production":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )


def validate_runtime_configuration() -> None:
    if settings.algorithm not in SAFE_JWT_ALGORITHMS:
        raise RuntimeError("ALGORITHM must be HS256, HS384, or HS512")
    if not settings.jwt_issuer or not settings.jwt_audience:
        raise RuntimeError("JWT_ISSUER and JWT_AUDIENCE must be configured")
    if not 5 <= settings.access_token_expire_minutes <= 1440:
        raise RuntimeError(
            "ACCESS_TOKEN_EXPIRE_MINUTES must be between 5 and 1440",
        )
    if not settings.auth_cookie_name or not settings.csrf_cookie_name:
        raise RuntimeError("Authentication cookie names cannot be empty")
    if settings.auth_cookie_name == settings.csrf_cookie_name:
        raise RuntimeError("Authentication and CSRF cookie names must differ")

    if settings.app_env.lower() != "production":
        return
    if len(settings.secret_key) < 32 or settings.secret_key == "your-secret-key-here":
        raise RuntimeError("SECRET_KEY must be a strong production secret")
    if "*" in settings.frontend_origins:
        raise RuntimeError("FRONTEND_ORIGINS cannot contain '*' in production")
    if not settings.frontend_origins or any(
        not origin.startswith("https://") for origin in settings.frontend_origins
    ):
        raise RuntimeError("FRONTEND_ORIGINS must contain only HTTPS origins in production")
    if not settings.auth_cookie_secure:
        raise RuntimeError("AUTH_COOKIE_SECURE must be true in production")
    if not settings.ai_api_key:
        raise RuntimeError("AI_API_KEY is required in production")
    _validate_fernet_key(
        "BIOMETRIC_ENCRYPTION_KEY",
        settings.biometric_encryption_key,
    )
    if settings.credential_encryption_key:
        _validate_fernet_key(
            "CREDENTIAL_ENCRYPTION_KEY",
            settings.credential_encryption_key,
        )

    ai_url = urlsplit(settings.ai_service_url)
    if ai_url.scheme != "https" and not _is_local_hostname(ai_url.hostname):
        raise RuntimeError("AI_SERVICE_URL must use HTTPS in production")

    database_url = urlsplit(settings.database_url)
    database_query = dict(parse_qsl(database_url.query, keep_blank_values=True))
    if (
        not _is_local_hostname(database_url.hostname)
        and database_query.get("ssl", "").lower() not in {"require", "verify-ca", "verify-full"}
    ):
        raise RuntimeError("DATABASE_URL must require TLS in production")


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
    docs_url="/docs" if settings.enable_api_docs else None,
    redoc_url="/redoc" if settings.enable_api_docs else None,
    openapi_url="/openapi.json" if settings.enable_api_docs else None,
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
async def secure_and_observe_requests(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", "").strip()
    if not request_id or len(request_id) > 128:
        request_id = uuid4().hex
    started_at = perf_counter()

    session_cookie = request.cookies.get(settings.auth_cookie_name)
    uses_bearer_auth = request.headers.get("Authorization", "").lower().startswith(
        "bearer ",
    )
    if (
        request.method in STATE_CHANGING_METHODS
        and request.url.path not in CSRF_EXEMPT_PATHS
        and session_cookie
        and not uses_bearer_auth
    ):
        csrf_cookie = request.cookies.get(settings.csrf_cookie_name, "")
        csrf_header = request.headers.get("X-CSRF-Token", "")
        if (
            not csrf_cookie
            or not csrf_header
            or not hmac.compare_digest(csrf_cookie, csrf_header)
        ):
            response = JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed"},
            )
            apply_security_headers(response)
            response.headers["X-Request-ID"] = request_id
            return response

    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            json.dumps(
                {
                    "event": "request_failed",
                    "method": request.method,
                    "path": request.url.path,
                    "request_id": request_id,
                },
            ),
        )
        raise

    apply_security_headers(response)
    response.headers.setdefault("X-Request-ID", request_id)

    logger.info(
        json.dumps(
            {
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                "event": "request_completed",
                "method": request.method,
                "path": request.url.path,
                "request_id": request_id,
                "status_code": response.status_code,
            },
        ),
    )
    return response

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(employees.router)
app.include_router(students.router)
app.include_router(attendance.router)
app.include_router(face.router)
app.include_router(users.router)
app.include_router(whatsapp.router)
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
