from typing import Any, Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import PlainTextResponse

from app.core.config import settings

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


@router.post("/whatsapp")
async def receive_whatsapp_webhook(payload: dict[str, Any]) -> dict[str, bool]:
    """
    Receive WhatsApp message/status callbacks.

    TODO: Persist delivery/read/failed statuses and inbound parent messages.
    """
    return {"received": True}
