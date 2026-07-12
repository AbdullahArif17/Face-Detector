import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.time import display_local_time, local_day_bounds, local_now
from app.models.attendance import Attendance
from app.models.company import Company
from app.models.student import Student
from app.models.whatsapp_log import WhatsappInboundMessage, WhatsappLog
from app.services.whatsapp import (
    get_whatsapp_credentials,
    log_whatsapp_message,
    send_text_message,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/whatsapp", response_class=PlainTextResponse)
async def verify_whatsapp_webhook(
    hub_mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    hub_verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    hub_challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> PlainTextResponse:
    if not settings.meta_webhook_verify_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="META_WEBHOOK_VERIFY_TOKEN is not configured",
        )

    if (
        hub_mode == "subscribe"
        and hmac.compare_digest(
            hub_verify_token or "",
            settings.meta_webhook_verify_token,
        )
        and hub_challenge is not None
    ):
        return PlainTextResponse(content=hub_challenge)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Webhook verification failed",
    )


def verify_meta_signature(raw_body: bytes, signature: str | None) -> None:
    app_secret = settings.meta_app_secret
    if not app_secret:
        if settings.app_env.lower() == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="META_APP_SECRET is required for WhatsApp webhooks",
            )
        return

    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    if signature is None or not hmac.compare_digest(signature, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )


def parse_meta_timestamp(value: Any) -> datetime:
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return datetime.now(timezone.utc)


def iter_whatsapp_statuses(payload: dict[str, Any]) -> list[dict[str, Any]]:
    statuses: list[dict[str, Any]] = []
    for entry in payload.get("entry", []):
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes", []):
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue
            raw_statuses = value.get("statuses")
            if isinstance(raw_statuses, list):
                statuses.extend(item for item in raw_statuses if isinstance(item, dict))
    return statuses


def iter_inbound_text_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for entry in payload.get("entry", []):
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes", []):
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue
            metadata = value.get("metadata")
            phone_number_id = (
                metadata.get("phone_number_id") if isinstance(metadata, dict) else None
            )
            if not isinstance(phone_number_id, str):
                continue
            raw_messages = value.get("messages")
            if not isinstance(raw_messages, list):
                continue
            for raw_message in raw_messages:
                if not isinstance(raw_message, dict) or raw_message.get("type") != "text":
                    continue
                text_payload = raw_message.get("text")
                body = text_payload.get("body") if isinstance(text_payload, dict) else None
                message_id = raw_message.get("id")
                sender = raw_message.get("from")
                if all(isinstance(value, str) for value in (message_id, sender, body)):
                    messages.append(
                        {
                            "message_id": message_id,
                            "sender": sender,
                            "body": body.strip(),
                            "phone_number_id": phone_number_id,
                        },
                    )
    return messages


def status_error_message(status_item: dict[str, Any]) -> str | None:
    errors = status_item.get("errors")
    if not isinstance(errors, list) or not errors or not isinstance(errors[0], dict):
        return None
    first_error = errors[0]
    for key in ("message", "title"):
        value = first_error.get(key)
        if isinstance(value, str):
            return value[:1000]
    return None


async def resolve_chatbot_school(
    session: AsyncSession,
    phone_number_id: str,
) -> Company | None:
    return await session.scalar(
        select(Company).where(
            Company.whatsapp_phone_id == phone_number_id,
            Company.status == "active",
        ),
    )


async def find_parent_students(
    session: AsyncSession,
    *,
    sender_phone: str,
    school: Company | None,
) -> list[Student]:
    query = (
        select(Student)
        .join(Company, Company.id == Student.school_id)
        .where(
            Student.status == "active",
            Company.status == "active",
            or_(
                Student.parent_phone == sender_phone,
                Student.parent_phone_2 == sender_phone,
            ),
        )
        .order_by(Student.student_name)
    )
    if school is not None:
        query = query.where(Student.school_id == school.id)
    return list((await session.execute(query)).scalars().all())


async def build_attendance_reply(
    session: AsyncSession,
    students: list[Student],
) -> str:
    if not students:
        return (
            "This WhatsApp number is not linked to an active student record. "
            "Please contact the school office."
        )

    start, end = local_day_bounds()
    attendance_rows = list(
        (
            await session.execute(
                select(Attendance)
                .where(
                    Attendance.student_id.in_([student.id for student in students]),
                    Attendance.check_in >= start,
                    Attendance.check_in < end,
                )
                .order_by(Attendance.check_in.desc()),
            )
        )
        .scalars()
        .all(),
    )
    attendance_by_student: dict[int, Attendance] = {}
    for attendance in attendance_rows:
        attendance_by_student.setdefault(attendance.student_id, attendance)

    lines = [f"Attendance status for {local_now().strftime('%d %b %Y')}:"]
    for student in students:
        attendance = attendance_by_student.get(student.id)
        class_name = f"{student.grade}-{student.section}"
        if attendance is None or attendance.status == "absent":
            status_text = "Not checked in"
        else:
            status_text = (
                f"{attendance.status.title()} at {display_local_time(attendance.check_in)}"
            )
            if attendance.check_out is not None:
                status_text += f", checked out {display_local_time(attendance.check_out)}"
        lines.append(f"- {student.student_name} ({class_name}): {status_text}")
    return "\n".join(lines)


async def build_chatbot_reply(
    session: AsyncSession,
    *,
    message_body: str,
    students: list[Student],
) -> str:
    command = message_body.casefold().strip()
    if command in {"status", "attendance", "present", "حاضری"}:
        return await build_attendance_reply(session, students)
    return (
        "Welcome to the school attendance assistant. "
        "Reply STATUS to check today's attendance for students linked to this number."
    )


async def process_inbound_message(
    session: AsyncSession,
    message: dict[str, str],
) -> bool:
    existing_id = await session.scalar(
        select(WhatsappInboundMessage.id).where(
            WhatsappInboundMessage.meta_message_id == message["message_id"],
        ),
    )
    if existing_id is not None:
        return False

    school = await resolve_chatbot_school(session, message["phone_number_id"])
    students = await find_parent_students(
        session,
        sender_phone=message["sender"],
        school=school,
    )
    if school is None and students:
        school = await session.get(Company, students[0].school_id)

    inbound = WhatsappInboundMessage(
        meta_message_id=message["message_id"],
        school_id=school.id if school is not None else None,
        student_id=students[0].id if students else None,
        phone_number_id=message["phone_number_id"],
        sender_phone=message["sender"],
        message_body=message["body"],
        status="received",
    )
    session.add(inbound)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return False

    reply = await build_chatbot_reply(
        session,
        message_body=message["body"],
        students=students,
    )
    access_token, configured_phone_id = (
        get_whatsapp_credentials(school) if school is not None else (None, None)
    )
    if (
        access_token is None
        and settings.meta_whatsapp_token
        and settings.meta_phone_number_id == message["phone_number_id"]
    ):
        access_token = settings.meta_whatsapp_token
        configured_phone_id = settings.meta_phone_number_id

    if access_token and configured_phone_id:
        send_result = await send_text_message(
            phone_number_id=message["phone_number_id"],
            access_token=access_token,
            parent_phone=message["sender"],
            message=reply,
        )
        inbound.response_body = reply
        inbound.status = "replied" if send_result["success"] else "failed"
        if students and school is not None:
            await log_whatsapp_message(
                session,
                school_id=school.id,
                student_id=students[0].id,
                parent_phone=message["sender"],
                message_type="chatbot",
                message_body=reply,
                status="sent" if send_result["success"] else "failed",
                meta_message_id=send_result["message_id"]
                if isinstance(send_result["message_id"], str)
                else None,
                error_message=send_result["error"]
                if isinstance(send_result["error"], str)
                else None,
            )
    else:
        inbound.status = "configuration_missing"

    inbound.processed_at = datetime.now(timezone.utc)
    await session.commit()
    return True


@router.post("/whatsapp")
async def receive_whatsapp_webhook(
    request: Request,
    x_hub_signature_256: Annotated[
        str | None,
        Header(alias="X-Hub-Signature-256"),
    ] = None,
    session: AsyncSession = Depends(get_db),
) -> dict[str, bool | int]:
    raw_body = await request.body()
    verify_meta_signature(raw_body, x_hub_signature_256)
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook body is not valid JSON",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook body must be a JSON object",
        )

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
        log.error_message = (
            status_error_message(status_item) if message_status == "failed" else None
        )
        if message_status in {"sent", "delivered", "read"} and log.sent_at is None:
            log.sent_at = parse_meta_timestamp(status_item.get("timestamp"))
        statuses_updated += 1

    if statuses_updated:
        await session.commit()

    messages_processed = 0
    for inbound_message in iter_inbound_text_messages(payload):
        if await process_inbound_message(session, inbound_message):
            messages_processed += 1

    return {
        "received": True,
        "statuses_updated": statuses_updated,
        "messages_received": len(iter_inbound_text_messages(payload)),
        "messages_processed": messages_processed,
    }
