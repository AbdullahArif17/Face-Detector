from datetime import datetime, timezone
from typing import Any, Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.whatsapp_log import WhatsappLog

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/whatsapp", response_class=PlainTextResponse)
async def verify_whatsapp_webhook(
    hub_mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    hub_verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    hub_challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> PlainTextResponse:
    """
    Meta WhatsApp webhook verification endpoint.

    Meta calls this URL during "Verify and save". If the verify token matches,
    the API must return the raw challenge string as text/plain.
    """
    if not settings.meta_webhook_verify_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="META_WEBHOOK_VERIFY_TOKEN is not configured",
        )

    if (
        hub_mode == "subscribe"
        and hub_verify_token == settings.meta_webhook_verify_token
        and hub_challenge is not None
    ):
        return PlainTextResponse(content=hub_challenge)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Webhook verification failed",
    )


def parse_meta_timestamp(value: Any) -> datetime:
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return datetime.now(timezone.utc)


def iter_whatsapp_statuses(payload: dict[str, Any]) -> list[dict[str, Any]]:
    statuses: list[dict[str, Any]] = []
    entries = payload.get("entry")
    if not isinstance(entries, list):
        return statuses

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        changes = entry.get("changes")
        if not isinstance(changes, list):
            continue
        for change in changes:
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue
            raw_statuses = value.get("statuses")
            if isinstance(raw_statuses, list):
                statuses.extend(
                    status_item
                    for status_item in raw_statuses
                    if isinstance(status_item, dict)
                )
    return statuses


def count_inbound_messages(payload: dict[str, Any]) -> int:
    total = 0
    entries = payload.get("entry")
    if not isinstance(entries, list):
        return total

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        changes = entry.get("changes")
        if not isinstance(changes, list):
            continue
        for change in changes:
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue
            messages = value.get("messages")
            if isinstance(messages, list):
                total += len(messages)
    return total


@router.post("/whatsapp")
async def receive_whatsapp_webhook(
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_db),
) -> dict[str, bool | int]:
    """
    Receive WhatsApp message/status callbacks.

    Persists outbound message delivery states when Meta sends a status callback.
    TODO: Persist inbound parent messages in a dedicated table.
    """
    statuses_updated = 0
    for status_item in iter_whatsapp_statuses(payload):
        message_id = status_item.get("id")
        message_status = status_item.get("status")
        if not isinstance(message_id, str) or not isinstance(message_status, str):
            continue
        if message_status not in {"sent", "delivered", "read", "failed"}:
            continue

        log = await session.scalar(
            select(WhatsappLog)
            .where(WhatsappLog.meta_message_id == message_id)
            .order_by(WhatsappLog.created_at.desc())
            .limit(1),
        )
        if log is None:
            continue

        log.status = message_status
        if message_status in {"sent", "delivered", "read"} and log.sent_at is None:
            log.sent_at = parse_meta_timestamp(status_item.get("timestamp"))
        statuses_updated += 1

    if statuses_updated:
        await session.commit()

    return {
        "received": True,
        "statuses_updated": statuses_updated,
        "messages_received": count_inbound_messages(payload),
    }
