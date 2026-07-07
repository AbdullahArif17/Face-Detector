from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.absent_scheduler import send_absent_alerts

router = APIRouter(prefix="/api/cron", tags=["cron"])


@router.get("/absent-alerts")
async def absent_alerts_cron(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """
    Called by Vercel Cron every day at 4 AM UTC.

    If `CRON_SECRET` is configured, Vercel must send:
    `Authorization: Bearer <CRON_SECRET>`.
    """
    if settings.cron_secret and authorization != f"Bearer {settings.cron_secret}":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )

    result = await send_absent_alerts(session)
    return {"success": True, "result": result}
