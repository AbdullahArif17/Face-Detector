import os
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

from app.core.phones import normalize_pakistan_phone

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    ai_service_url: str
    ai_api_key: str | None
    ai_model_name: str
    biometric_encryption_key: str | None
    app_timezone: str
    frontend_origins: list[str]
    meta_whatsapp_token: str | None
    meta_phone_number_id: str | None
    meta_webhook_verify_token: str | None
    meta_app_secret: str | None
    meta_graph_api_version: str
    meta_template_language: str
    meta_test_template_language: str
    meta_checkin_template_name: str | None
    meta_checkout_template_name: str | None
    meta_absent_template_name: str | None
    meta_test_template_name: str | None
    whatsapp_test_mode: bool
    whatsapp_test_recipient: str | None
    cron_secret: str | None
    app_env: str


def normalize_database_url(database_url: str) -> str:
    """Convert a standard PostgreSQL URL into SQLAlchemy's asyncpg format."""
    if database_url.startswith(("postgresql://", "postgres://")):
        database_url = database_url.replace(
            database_url.split("://", 1)[0] + "://",
            "postgresql+asyncpg://",
            1,
        )

    parsed = urlsplit(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))

    # asyncpg uses `ssl`, while Neon displays `sslmode` in copied URLs.
    ssl_mode = query.pop("sslmode", None)
    if ssl_mode:
        query["ssl"] = ssl_mode

    if parsed.hostname and parsed.hostname.endswith("supabase.co"):
        query.setdefault("ssl", "require")

    query.pop("channel_binding", None)

    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(query),
            parsed.fragment,
        ),
    )


def parse_csv_env(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_bool_env(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be true or false")


@lru_cache
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL")
    secret_key = os.getenv("SECRET_KEY")

    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    if not secret_key:
        raise RuntimeError("SECRET_KEY is not configured")

    whatsapp_test_mode = parse_bool_env("WHATSAPP_TEST_MODE")
    raw_test_recipient = os.getenv("WHATSAPP_TEST_RECIPIENT", "").strip()
    try:
        whatsapp_test_recipient = (
            normalize_pakistan_phone(raw_test_recipient) if raw_test_recipient else None
        )
    except ValueError as exc:
        raise RuntimeError("WHATSAPP_TEST_RECIPIENT is not a valid Pakistan phone") from exc
    if whatsapp_test_mode and whatsapp_test_recipient is None:
        raise RuntimeError(
            "WHATSAPP_TEST_RECIPIENT is required when WHATSAPP_TEST_MODE=true",
        )

    return Settings(
        database_url=normalize_database_url(database_url),
        secret_key=secret_key,
        algorithm=os.getenv("ALGORITHM", "HS256"),
        access_token_expire_minutes=int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"),
        ),
        ai_service_url=os.getenv("AI_SERVICE_URL", "http://localhost:8001").rstrip("/"),
        ai_api_key=os.getenv("AI_API_KEY"),
        ai_model_name=os.getenv("AI_MODEL_NAME", "ArcFace").strip(),
        biometric_encryption_key=os.getenv("BIOMETRIC_ENCRYPTION_KEY"),
        app_timezone=os.getenv("APP_TIMEZONE", "Asia/Karachi").strip(),
        frontend_origins=parse_csv_env(
            os.getenv(
                "FRONTEND_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            ),
        ),
        meta_whatsapp_token=os.getenv("META_WHATSAPP_TOKEN"),
        meta_phone_number_id=os.getenv("META_PHONE_NUMBER_ID"),
        meta_webhook_verify_token=os.getenv("META_WEBHOOK_VERIFY_TOKEN"),
        meta_app_secret=os.getenv("META_APP_SECRET"),
        meta_graph_api_version=os.getenv("META_GRAPH_API_VERSION", "v25.0").strip(),
        meta_template_language=os.getenv("META_TEMPLATE_LANGUAGE", "en"),
        meta_test_template_language=os.getenv("META_TEST_TEMPLATE_LANGUAGE", "en_US"),
        meta_checkin_template_name=os.getenv("META_CHECKIN_TEMPLATE_NAME"),
        meta_checkout_template_name=os.getenv("META_CHECKOUT_TEMPLATE_NAME"),
        meta_absent_template_name=os.getenv("META_ABSENT_TEMPLATE_NAME"),
        meta_test_template_name=os.getenv("META_TEST_TEMPLATE_NAME"),
        whatsapp_test_mode=whatsapp_test_mode,
        whatsapp_test_recipient=whatsapp_test_recipient,
        cron_secret=os.getenv("CRON_SECRET"),
        app_env=os.getenv("APP_ENV", "development"),
    )


settings = get_settings()
