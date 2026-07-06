from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import require_role
from app.models.company import Company
from app.models.student import Student
from app.models.user import User
from app.models.whatsapp_log import WhatsappLog
from app.schemas.student import validate_pakistan_phone
from app.schemas.whatsapp import (
    WhatsappLogResponse,
    WhatsappRetryResponse,
    WhatsappStatsResponse,
    WhatsappTestRequest,
    WhatsappTestResponse,
)
from app.services.whatsapp import get_whatsapp_credentials, send_text_message

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


def day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def month_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, 1, tzinfo=timezone.utc)
    if day.month == 12:
        end = datetime(day.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(day.year, day.month + 1, 1, tzinfo=timezone.utc)
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
    today = datetime.now(timezone.utc).date()
    today_start, today_end = day_bounds(today)
    month_start, month_end = month_bounds(today)

    sent_today = await session.scalar(
        select(func.count()).select_from(WhatsappLog).where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.status == "sent",
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
        parent_phone = validate_pakistan_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone must be 12 digits starting with 92",
        ) from exc
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

    start, end = day_bounds(datetime.now(timezone.utc).date())
    result = await session.execute(
        select(WhatsappLog).where(
            WhatsappLog.school_id == current_user.company_id,
            WhatsappLog.status == "failed",
            WhatsappLog.created_at >= start,
            WhatsappLog.created_at < end,
        ),
    )
    failed_logs = list(result.scalars().all())
    success_count = 0
    still_failed = 0

    for log in failed_logs:
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
            success_count += 1
        else:
            still_failed += 1

    await session.commit()
    return WhatsappRetryResponse(
        retried=len(failed_logs),
        success=success_count,
        still_failed=still_failed,
    )
