from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company import Company
from app.models.student import Student
from app.models.whatsapp_log import WhatsappLog

WHATSAPP_API_URL = "https://graph.facebook.com/v19.0"
WHATSAPP_TIMEOUT_SECONDS = 20.0


def is_configured_secret(value: str | None) -> bool:
    return bool(value and value.strip() and not value.startswith("your_"))


def get_whatsapp_credentials(school: Company) -> tuple[str | None, str | None]:
    access_token = (
        school.whatsapp_token
        if is_configured_secret(school.whatsapp_token)
        else settings.meta_whatsapp_token
    )
    phone_number_id = (
        school.whatsapp_phone_id
        if is_configured_secret(school.whatsapp_phone_id)
        else settings.meta_phone_number_id
    )
    if not is_configured_secret(access_token) or not is_configured_secret(phone_number_id):
        return None, None
    return access_token, phone_number_id


async def send_text_message(
    *,
    phone_number_id: str,
    access_token: str,
    parent_phone: str,
    message: str,
) -> dict[str, str | bool | None]:
    try:
        async with httpx.AsyncClient(timeout=WHATSAPP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{WHATSAPP_API_URL}/{phone_number_id}/messages",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": parent_phone,
                    "type": "text",
                    "text": {"body": message},
                },
            )
    except httpx.RequestError as exc:
        return {"success": False, "message_id": None, "error": str(exc)}

    try:
        payload: dict[str, Any] = response.json()
    except ValueError:
        payload = {}

    if response.status_code >= 400:
        error = payload.get("error")
        error_message = (
            error.get("message")
            if isinstance(error, dict) and isinstance(error.get("message"), str)
            else response.text
        )
        return {"success": False, "message_id": None, "error": error_message}

    messages = payload.get("messages")
    message_id = None
    if isinstance(messages, list) and messages and isinstance(messages[0], dict):
        raw_message_id = messages[0].get("id")
        message_id = raw_message_id if isinstance(raw_message_id, str) else None

    return {"success": True, "message_id": message_id, "error": None}


def build_checkin_message(
    *,
    parent_name: str,
    student_name: str,
    school_name: str,
    school_phone: str,
    check_time: str,
    date_str: str,
    grade: str,
    section: str,
) -> str:
    return f"""✅ Attendance Alert | حاضری کی اطلاع

Assalam o Alaikum {parent_name}! 🌟

{student_name} has arrived at school safely.
{student_name} اسکول پہنچ گیا/گئی ہے۔

🕐 Time | وقت: {check_time}
📅 Date | تاریخ: {date_str}
🏫 Class | جماعت: {grade}-{section}
🏫 School: {school_name}

JazakAllah Khair 🤲
📞 {school_phone}"""


def build_checkout_message(
    *,
    parent_name: str,
    student_name: str,
    school_name: str,
    checkout_time: str,
    date_str: str,
    grade: str,
    section: str,
) -> str:
    return f"""🏠 Departure Alert | روانگی کی اطلاع

{parent_name}!

{student_name} has left school.
{student_name} اسکول سے روانہ ہو گیا/گئی۔

🕐 Time | وقت: {checkout_time}
📅 Date | تاریخ: {date_str}
🏫 Class | جماعت: {grade}-{section}

Have a safe journey home! 🤲
گھر سلامت پہنچیں۔

{school_name}"""


def build_absent_message(
    *,
    parent_name: str,
    student_name: str,
    school_name: str,
    school_phone: str,
    date_str: str,
) -> str:
    return f"""⚠️ Absence Alert | غیر حاضری کی اطلاع

Assalam o Alaikum {parent_name}!

{student_name} has not arrived at school today.
{student_name} آج اسکول نہیں آیا/آئی۔

📅 Date | تاریخ: {date_str}

If this is unexpected, please contact:
اگر یہ غیر متوقع ہے تو رابطہ کریں:
📞 {school_phone}

{school_name}"""


async def send_checkin_message(
    phone_number_id: str,
    access_token: str,
    parent_phone: str,
    parent_name: str,
    student_name: str,
    school_name: str,
    school_phone: str,
    check_time: str,
    date_str: str,
    grade: str,
    section: str,
) -> dict[str, str | bool | None]:
    message = build_checkin_message(
        parent_name=parent_name,
        student_name=student_name,
        school_name=school_name,
        school_phone=school_phone,
        check_time=check_time,
        date_str=date_str,
        grade=grade,
        section=section,
    )
    return await send_text_message(
        phone_number_id=phone_number_id,
        access_token=access_token,
        parent_phone=parent_phone,
        message=message,
    )


async def send_checkout_message(
    phone_number_id: str,
    access_token: str,
    parent_phone: str,
    parent_name: str,
    student_name: str,
    school_name: str,
    school_phone: str,
    checkout_time: str,
    date_str: str,
    grade: str,
    section: str,
) -> dict[str, str | bool | None]:
    message = build_checkout_message(
        parent_name=parent_name,
        student_name=student_name,
        school_name=school_name,
        checkout_time=checkout_time,
        date_str=date_str,
        grade=grade,
        section=section,
    )
    return await send_text_message(
        phone_number_id=phone_number_id,
        access_token=access_token,
        parent_phone=parent_phone,
        message=message,
    )


async def send_absent_message(
    phone_number_id: str,
    access_token: str,
    parent_phone: str,
    parent_name: str,
    school_name: str,
    school_phone: str,
    student_name: str,
    date_str: str,
) -> dict[str, str | bool | None]:
    message = build_absent_message(
        parent_name=parent_name,
        student_name=student_name,
        school_name=school_name,
        school_phone=school_phone,
        date_str=date_str,
    )
    return await send_text_message(
        phone_number_id=phone_number_id,
        access_token=access_token,
        parent_phone=parent_phone,
        message=message,
    )


async def log_whatsapp_message(
    session: AsyncSession,
    *,
    school_id: int,
    student_id: int,
    parent_phone: str,
    message_type: str,
    message_body: str,
    status: str,
    meta_message_id: str | None,
) -> WhatsappLog:
    log = WhatsappLog(
        school_id=school_id,
        student_id=student_id,
        parent_phone=parent_phone,
        message_type=message_type,
        message_body=message_body,
        status=status,
        meta_message_id=meta_message_id,
        sent_at=datetime.now(timezone.utc) if status == "sent" else None,
    )
    session.add(log)
    return log


def school_phone_or_default(school: Company) -> str:
    return school.school_phone or "School office"


def checkin_message_body(student: Student, school: Company, check_time: str, date_str: str) -> str:
    return build_checkin_message(
        parent_name=student.parent_name,
        student_name=student.student_name,
        school_name=school.name,
        school_phone=school_phone_or_default(school),
        check_time=check_time,
        date_str=date_str,
        grade=student.grade,
        section=student.section,
    )


def checkout_message_body(student: Student, school: Company, checkout_time: str, date_str: str) -> str:
    return build_checkout_message(
        parent_name=student.parent_name,
        student_name=student.student_name,
        school_name=school.name,
        checkout_time=checkout_time,
        date_str=date_str,
        grade=student.grade,
        section=student.section,
    )


def absent_message_body(student: Student, school: Company, date_str: str) -> str:
    return build_absent_message(
        parent_name=student.parent_name,
        student_name=student.student_name,
        school_name=school.name,
        school_phone=school_phone_or_default(school),
        date_str=date_str,
    )
