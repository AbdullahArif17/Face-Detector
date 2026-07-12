from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings


@lru_cache
def school_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.app_timezone)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(
            f"APP_TIMEZONE is invalid: {settings.app_timezone}",
        ) from exc


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return utc_now().astimezone(school_timezone())


def to_local(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(school_timezone())


def local_day_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    selected_day = day or local_now().date()
    local_start = datetime.combine(selected_day, time.min, tzinfo=school_timezone())
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def display_local_time(value: datetime) -> str:
    return to_local(value).strftime("%I:%M %p").lstrip("0")


def display_local_date(value: datetime) -> str:
    return to_local(value).strftime("%d %b %Y")
