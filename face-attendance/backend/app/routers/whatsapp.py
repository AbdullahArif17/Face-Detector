from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.phones import normalize_pakistan_phone
from app.core.time import (
    display_local_date,
    display_local_time,
    local_day_bounds,
    local_now,
)
from app.dependencies import require_role
from app.models.company import Company
from app.models.student import Student
from app.models.user import User
from app.models.whatsapp_log import WhatsappLog
from app.schemas.whatsapp import (
    WhatsappLogResponse,
    WhatsappRetryResponse,
    WhatsappStatsResponse,
    WhatsappTestRequest,
    WhatsappTestResponse,
)
from app.services.whatsapp import (
    get_whatsapp_credentials,
    is_configured_value,
    school_phone_or_default,
    send_absent_message,
    send_checkin_message,
    send_checkout_message,
    send_template_message,
    send_text_message,
)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
SUCCESSFUL_WHATSAPP_STATUSES = ("sent", "delivered", "read")


def day_bounds(day: date) -> tuple[datetime, datetime]:
    return local_day_bounds(day)


def month_bounds(day: date) -> tuple[datetime, datetime]:
    first_day = date(day.year, day.month, 1)
    if day.month == 12:
        next_month = date(day.year + 1, 1, 1)
    else:
        next_month = date(day.year, day.month + 1, 1)
    start, _ = local_day_bounds(first_day)
    end, _ = local_day_bounds(next_month)
    return start, end


async def build_log_response(
    session: AsyncSession,
    log: WhatsappLog,
) -> WhatsappLogResponse:
    student_name = await session.scalar(
        select(Student.student_name).where(Student.id == log.student_id),
    )
    return WhatsappLogResponse(
        id=log.id,
        school_id=log.school_id,
        student_id=log.student_id,
        student_name=student_name,
        parent_phone=log.parent_phone,
        message_type=log.message_type,
        message_body=log.message_body,
        status=log.status,
        meta_message_id=log.meta_message_id,
        error_message=log.error_message,
        sent_at=log.sent_at,
        created_at=log.created_at,
    )


@router.get("/logs", response_model=list[WhatsappLogResponse])
async def get_whatsapp_logs(
    log_date: date | None = Query(default=None, alias="date"),
    status_filter: str | None = Query(default=None, alias="status"),
    message_type: str | None = None,
    student_id: int | None = Query(default=None, gt=0),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[WhatsappLogResponse]:
    query = select(WhatsappLog).where(WhatsappLog.school_id == current_user.company_id)
    if log_date is not None:
        start, end = day_bounds(log_date)
        query = query.where(WhatsappLog.created_at >= start, WhatsappLog.created_at < end)
    if status_filter:
        query = query.where(WhatsappLog.status == status_filter)
    if message_type:
        query = query.where(WhatsappLog.message_type == message_type)
    if student_id is not None:
        query = query.where(WhatsappLog.student_id == student_id)

    result = await session.execute(
        query.order_by(WhatsappLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page),
    )
    logs = list(result.scalars().all())
    return [await build_log_response(session, log) for log in logs]


@router.get("/stats", response_model=WhatsappStatsResponse)
async def get_whatsapp_stats(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> WhatsappStatsResponse:
    today = local_now().date()
    today_start, today_end = day_bounds(today)
    month_start, month_end = month_bounds(today)

    sent_today = await session.scalar(
        select(func.count()).select_from(WhatsappLog).where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.status.in_(SUCCESSFUL_WHATSAPP_STATUSES),
            WhatsappLog.created_at >= today_start,
            WhatsappLog.created_at < today_end,
        ),
    )
    failed_today = await session.scalar(
        select(func.count()).select_from(WhatsappLog).where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.status == "failed",
            WhatsappLog.created_at >= today_start,
            WhatsappLog.created_at < today_end,
        ),
    )
    total_this_month = await session.scalar(
        select(func.count()).select_from(WhatsappLog).where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.created_at >= month_start,
            WhatsappLog.created_at < month_end,
        ),
    )
    total_today = (sent_today or 0) + (failed_today or 0)
    success_rate = round(((sent_today or 0) / total_today) * 100, 2) if total_today else 0.0
    return WhatsappStatsResponse(
        sent_today=sent_today or 0,
        failed_today=failed_today or 0,
        total_this_month=total_this_month or 0,
        success_rate=success_rate,
    )


@router.post("/test", response_model=WhatsappTestResponse)
async def send_test_whatsapp(
    payload: WhatsappTestRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> WhatsappTestResponse:
    school = await session.get(Company, current_user.company_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    access_token, phone_number_id = get_whatsapp_credentials(school)
    if not access_token or not phone_number_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp token and phone number ID are not configured",
        )

    try:
        parent_phone = normalize_pakistan_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone must be Pakistan format, for example 923001234567 or 03001234567",
        ) from exc
    if is_configured_value(settings.meta_test_template_name):
        result = await send_template_message(
            phone_number_id=phone_number_id,
            access_token=access_token,
            parent_phone=parent_phone,
            template_name=settings.meta_test_template_name.strip(),
            body_parameters=[],
            language_code=settings.meta_test_template_language,
        )
    else:
        result = await send_text_message(
            phone_number_id=phone_number_id,
            access_token=access_token,
            parent_phone=parent_phone,
            message=payload.message,
        )
    return WhatsappTestResponse(
        success=result["success"] is True,
        message_id=result["message_id"] if isinstance(result["message_id"], str) else None,
        error=result["error"] if isinstance(result["error"], str) else None,
    )


@router.post("/retry-failed", response_model=WhatsappRetryResponse)
async def retry_failed_whatsapp(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> WhatsappRetryResponse:
    school = await session.get(Company, current_user.company_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    access_token, phone_number_id = get_whatsapp_credentials(school)
    if not access_token or not phone_number_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp token and phone number ID are not configured",
        )

    start, end = day_bounds(local_now().date())
    result = await session.execute(
        select(WhatsappLog).where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.status == "failed",
            WhatsappLog.created_at >= start,
            WhatsappLog.created_at < end,
        ),
    )
    failed_logs = list(result.scalars().all())
    student_ids = {log.student_id for log in failed_logs}
    students = {
        student.id: student
        for student in (
            await session.execute(select(Student).where(Student.id.in_(student_ids)))
        )
        .scalars()
        .all()
    }
    success_count = 0
    still_failed = 0

    for log in failed_logs:
        student = students.get(log.student_id)
        event_time = log.sent_at or log.created_at
        time_str = display_local_time(event_time)
        date_str = display_local_date(event_time)
        if student is not None and log.message_type == "check_in":
            send_result = await send_checkin_message(
                phone_number_id,
                access_token,
                log.parent_phone,
                student.parent_name,
                student.student_name,
                school.name,
                school_phone_or_default(school),
                time_str,
                date_str,
                student.grade,
                student.section,
            )
        elif student is not None and log.message_type == "check_out":
            send_result = await send_checkout_message(
                phone_number_id,
                access_token,
                log.parent_phone,
                student.parent_name,
                student.student_name,
                school.name,
                school_phone_or_default(school),
                time_str,
                date_str,
                student.grade,
                student.section,
            )
        elif student is not None and log.message_type == "absent":
            send_result = await send_absent_message(
                phone_number_id,
                access_token,
                log.parent_phone,
                student.parent_name,
                school.name,
                school_phone_or_default(school),
                student.student_name,
                date_str,
            )
        else:
            send_result = await send_text_message(
                phone_number_id=phone_number_id,
                access_token=access_token,
                parent_phone=log.parent_phone,
                message=log.message_body,
            )
        if send_result["success"]:
            log.status = "sent"
            log.meta_message_id = (
                send_result["message_id"] if isinstance(send_result["message_id"], str) else None
            )
            log.sent_at = datetime.now(timezone.utc)
            log.error_message = None
            success_count += 1
        else:
            log.error_message = (
                send_result["error"] if isinstance(send_result["error"], str) else None
            )
            still_failed += 1

    await session.commit()
    return WhatsappRetryResponse(
        retried=len(failed_logs),
        success=success_count,
        still_failed=still_failed,
    )
