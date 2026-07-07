import asyncio
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from typing import Any

from app.core.database import SessionLocal
from app.services.absent_scheduler import send_absent_alerts


async def _run_absent_alerts() -> dict[str, Any]:
    async with SessionLocal() as session:
        return await send_absent_alerts(session)


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        cron_secret = os.getenv("CRON_SECRET")
        authorization = self.headers.get("Authorization")
        if cron_secret and authorization != f"Bearer {cron_secret}":
            self._send_json(
                HTTPStatus.UNAUTHORIZED,
                {"success": False, "error": "Unauthorized"},
            )
            return

        try:
            result = asyncio.run(_run_absent_alerts())
        except Exception as exc:
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"success": False, "error": str(exc)},
            )
            return

        self._send_json(
            HTTPStatus.OK,
            {"success": True, "message": "Absent alerts sent", "result": result},
        )
