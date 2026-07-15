from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


async def send_absent_alerts(session: AsyncSession) -> dict[str, Any]:
    """
    No-op placeholder for the Vercel cron endpoint.

    Attendance is now session-driven only: the system records attendance when a
    student is recognized by the kiosk during an active class session. The old
    9 AM absent scheduler is intentionally disabled so cron cannot create
    attendance rows outside a real-time class session.
    """
    _ = session
    return {
        "processed": 0,
        "sent": 0,
        "failed": 0,
        "skipped": 0,
        "disabled": True,
        "message": "Absent cron is disabled; attendance is marked only during active class sessions.",
        "schools": [],
    }
