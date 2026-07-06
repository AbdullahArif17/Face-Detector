import os
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    ai_service_url: str
    ai_api_key: str
    frontend_origins: list[str]
    meta_whatsapp_token: str | None
    meta_phone_number_id: str | None


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


@lru_cache
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL")
    secret_key = os.getenv("SECRET_KEY")
    ai_api_key = os.getenv("AI_API_KEY")

    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    if not secret_key:
        raise RuntimeError("SECRET_KEY is not configured")
    if not ai_api_key:
        raise RuntimeError("AI_API_KEY is not configured")

    return Settings(
        database_url=normalize_database_url(database_url),
        secret_key=secret_key,
        algorithm=os.getenv("ALGORITHM", "HS256"),
        access_token_expire_minutes=int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"),
        ),
        ai_service_url=os.getenv("AI_SERVICE_URL", "http://localhost:8001").rstrip("/"),
        ai_api_key=ai_api_key,
        frontend_origins=parse_csv_env(
            os.getenv(
                "FRONTEND_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            ),
        ),
        meta_whatsapp_token=os.getenv("META_WHATSAPP_TOKEN"),
        meta_phone_number_id=os.getenv("META_PHONE_NUMBER_ID"),
    )


settings = get_settings()
