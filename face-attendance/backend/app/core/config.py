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


@lru_cache
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL")
    secret_key = os.getenv("SECRET_KEY")

    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    if not secret_key:
        raise RuntimeError("SECRET_KEY is not configured")

    return Settings(
        database_url=normalize_database_url(database_url),
        secret_key=secret_key,
        algorithm=os.getenv("ALGORITHM", "HS256"),
        access_token_expire_minutes=int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"),
        ),
    )


settings = get_settings()
