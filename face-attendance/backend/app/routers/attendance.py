import csv
from datetime import date, datetime, time, timedelta, timezone
from io import StringIO
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.biometrics import BiometricConfigurationError, read_embedding
from app.core.database import get_db
from app.core.images import normalize_base64_image
from app.core.rate_limit import limiter
from app.core.time import (
    display_local_date,
    display_local_time,
    local_day_bounds,
    local_now,
    school_timezone,
    to_local,
)
from app.dependencies import get_company_by_api_key, require_role
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceSession
from app.models.branch import Branch
from app.models.company import Company
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.schemas.attendance import (
    AttendanceClassSessionStatus,
    AttendanceAutoMarkRequest,
    AttendanceAutoMarkResponse,
    AttendanceAutoStudent,
    AttendanceDashboardRecord,
    AttendanceMark,
    AttendanceManualUpdate,
    AttendanceRead,
    AttendanceSessionRead,
    AttendanceSessionStart,
    AttendanceSessionStatus,
)
from app.services.whatsapp import (
    checkin_message_body,
    get_whatsapp_credentials,
    log_whatsapp_message,
    send_checkin_message,
    school_phone_or_default,
)

router = APIRouter(prefix="/attendance", tags=["attendance"])
logger = logging.getLogger("face_attendance_attendance")

AI_SERVICE_TIMEOUT_SECONDS = 90.0
EXPORT_MAX_RECORDS = 50_000
MANUAL_ATTENDANCE_STATUSES = {"present", "absent", "excused"}

def ai_service_headers() -> dict[str, str]:
    api_key = settings.ai_api_key
    if not api_key:
        return {}
    return {"X-API-Key": api_key}


def today_bounds() -> tuple[datetime, datetime]:
    return local_day_bounds()


def date_bounds(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    start, _ = local_day_bounds(start_date)
    _, end = local_day_bounds(end_date)
    return start, end


def display_time(value: datetime) -> str:
    return display_local_time(value)


def display_date(value: datetime) -> str:
    return display_local_date(value)


def parse_local_clock(attendance_date: date, clock_value: str) -> datetime:
    hour, minute = [int(part) for part in clock_value.split(":", 1)]
    return datetime.combine(
        attendance_date,
        time(hour=hour, minute=minute),
        tzinfo=school_timezone(),
    ).astimezone(timezone.utc)


def working_hours(check_in: datetime | None, check_out: datetime | None) -> str:
    if check_in is None or check_out is None:
        return "—"
    total_seconds = max(0, int((check_out - check_in).total_seconds()))
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    return f"{hours}h {minutes}m"


def csv_safe(value: object) -> str:
    rendered = str(value)
    if rendered.startswith(("=", "+", "-", "@")):
        return f"'{rendered}"
    return rendered


def resolve_class_query(
    *,
    class_id: int | None,
    branch_id: int | None,
    required: bool = False,
) -> int | None:
    """Accept public `class_id` while preserving legacy `branch_id` URLs."""
    if class_id is not None and branch_id is not None and class_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="class_id and branch_id must match when both are provided",
        )
    resolved_class_id = class_id if class_id is not None else branch_id
    if required and resolved_class_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="class_id is required",
        )
    return resolved_class_id


def build_dashboard_record(
    student: Student,
    attendance: Attendance | None,
    attendance_date: date,
) -> AttendanceDashboardRecord:
    check_in = attendance.check_in if attendance is not None else None
    check_out = attendance.check_out if attendance is not None else None
    if attendance is not None and attendance.status in {"absent", "excused"}:
        check_in = None
        check_out = None

    return AttendanceDashboardRecord(
        attendance_id=attendance.id if attendance is not None else None,
        student_id=student.id,
        student_name=student.student_name,
        employee_id=student.id,
        employee_name=student.student_name,
        designation=f"{student.grade}-{student.section}",
        grade=student.grade,
        section=student.section,
        branch_id=student.class_id,
        class_id=student.class_id,
        check_in=check_in,
        check_out=check_out,
        status=attendance.status if attendance is not None else "absent",
        confidence_score=attendance.confidence_score if attendance is not None else None,
        notification_sent=attendance.notification_sent if attendance is not None else False,
        notification_status=attendance.notification_status if attendance is not None else None,
        working_hours=working_hours(
            check_in,
            check_out,
        ),
        attendance_date=attendance_date,
    )


async def get_session_attendance_for_student(
    session: AsyncSession,
    *,
    company_id: int,
    attendance_session_id: int,
    student_id: int,
) -> Attendance | None:
    return await session.scalar(
        select(Attendance)
        .where(
            Attendance.company_id == company_id,
            Attendance.session_id == attendance_session_id,
            Attendance.student_id == student_id,
        )
        .order_by(Attendance.id.asc()),
    )


async def get_active_attendance_session(
    session: AsyncSession,
    *,
    company_id: int,
) -> AttendanceSession | None:
    day_start, day_end = today_bounds()
    return await session.scalar(
        select(AttendanceSession)
        .where(
            AttendanceSession.company_id == company_id,
            AttendanceSession.status == "active",
            AttendanceSession.stopped_at.is_(None),
            AttendanceSession.started_at >= day_start,
            AttendanceSession.started_at < day_end,
        )
        .order_by(AttendanceSession.started_at.desc()),
    )


async def expire_stale_attendance_sessions(
    session: AsyncSession,
    *,
    company_id: int,
    stopped_by_id: int,
) -> None:
    """Close forgotten sessions from earlier school days before a new start."""
    day_start, _ = today_bounds()
    stale_sessions = list(
        await session.scalars(
            select(AttendanceSession).where(
                AttendanceSession.company_id == company_id,
                AttendanceSession.status == "active",
                AttendanceSession.stopped_at.is_(None),
                AttendanceSession.started_at < day_start,
            ),
        ),
    )
    if not stale_sessions:
        return

    stopped_at = datetime.now(timezone.utc)
    for stale_session in stale_sessions:
        stale_session.status = "expired"
        stale_session.stopped_at = stopped_at
        stale_session.stopped_by_id = stopped_by_id
    await session.flush()


async def get_company_branch(
    session: AsyncSession,
    *,
    company_id: int,
    branch_id: int,
) -> Branch:
    branch = await session.scalar(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.company_id == company_id,
        ),
    )
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found for this organization",
        )
    return branch


def build_attendance_session_read(
    attendance_session: AttendanceSession,
    branch: Branch | None = None,
) -> AttendanceSessionRead:
    return AttendanceSessionRead(
        id=attendance_session.id,
        company_id=attendance_session.company_id,
        branch_id=attendance_session.branch_id,
        class_id=attendance_session.branch_id,
        branch_name=branch.name if branch is not None else None,
        class_name=branch.name if branch is not None else None,
        status=attendance_session.status,
        started_by_id=attendance_session.started_by_id,
        stopped_by_id=attendance_session.stopped_by_id,
        started_at=attendance_session.started_at,
        stopped_at=attendance_session.stopped_at,
        created_at=attendance_session.created_at,
    )


def has_whatsapp_config(school: Company) -> bool:
    access_token, phone_number_id = get_whatsapp_credentials(school)
    return bool(access_token and phone_number_id)


async def send_checkin_notification(
    *,
    session: AsyncSession,
    attendance: Attendance,
    student: Student,
    school: Company,
    event_time: datetime,
) -> None:
    access_token, phone_number_id = get_whatsapp_credentials(school)
    if not access_token or not phone_number_id:
        attendance.notification_sent = False
        attendance.notification_status = None
        return

    check_time = display_time(event_time)
    date_str = display_date(event_time)
    message_body = checkin_message_body(student, school, check_time, date_str)
    result = await send_checkin_message(
        phone_number_id,
        access_token,
        student.parent_phone,
        student.parent_name,
        student.student_name,
        school.name,
        school_phone_or_default(school),
        check_time,
        date_str,
        student.grade,
        student.section,
    )

    notification_status = "sent" if result["success"] else "failed"
    attendance.notification_sent = result["success"] is True
    attendance.notification_status = notification_status
    await log_whatsapp_message(
        session,
        school_id=school.id,
        student_id=student.id,
        parent_phone=student.parent_phone,
        message_type="check_in",
        message_body=message_body,
        status=notification_status,
        meta_message_id=result["message_id"] if isinstance(result["message_id"], str) else None,
        error_message=result["error"] if isinstance(result["error"], str) else None,
    )


@router.get("/sessions", response_model=list[AttendanceSessionRead])
async def list_attendance_sessions(
    class_id: int | None = Query(default=None, gt=0),
    branch_id: int | None = Query(default=None, gt=0),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[AttendanceSessionRead]:
    offset = (page - 1) * per_page
    query = (
        select(AttendanceSession, Branch)
        .outerjoin(Branch, Branch.id == AttendanceSession.branch_id)
        .where(AttendanceSession.company_id == current_user.company_id)
        .order_by(AttendanceSession.started_at.desc())
        .offset(offset)
        .limit(per_page)
    )

    if status_filter:
        query = query.where(AttendanceSession.status == status_filter)
        if status_filter.lower() == "active":
            day_start, day_end = today_bounds()
            query = query.where(
                AttendanceSession.started_at >= day_start,
                AttendanceSession.started_at < day_end,
            )

    result = await session.execute(query)
    return [
        build_attendance_session_read(attendance_session, branch)
        for attendance_session, branch in result.all()
    ]


@router.get("/sessions/classes", response_model=list[AttendanceClassSessionStatus])
async def get_class_session_statuses(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[AttendanceClassSessionStatus]:
    branches = list(
        await session.scalars(
            select(Branch)
            .where(Branch.company_id == current_user.company_id)
            .order_by(Branch.name.asc()),
        ),
    )
    if not branches:
        return []

    student_counts_result = await session.execute(
        select(Student.class_id, func.count(Student.id))
        .where(
            Student.school_id == current_user.company_id,
            Student.status == "active",
        )
        .group_by(Student.class_id),
    )
    student_counts = {
        class_id: int(student_count)
        for class_id, student_count in student_counts_result.all()
    }

    day_start, day_end = today_bounds()
    active_sessions = list(
        await session.scalars(
            select(AttendanceSession).where(
                AttendanceSession.company_id == current_user.company_id,
                AttendanceSession.status == "active",
                AttendanceSession.stopped_at.is_(None),
                AttendanceSession.started_at >= day_start,
                AttendanceSession.started_at < day_end,
            ),
        ),
    )
    active_session = None
    if active_sessions:
        # Under the global model, there is only one active session per company
        active_session = active_sessions[0]

    return [
        AttendanceClassSessionStatus(
            class_id=branch.id,
            class_name=branch.name,
            student_count=student_counts.get(branch.id, 0),
            active_session=build_attendance_session_read(
                active_session,
                branch,
            )
            if active_session is not None
            else None,
        )
        for branch in branches
    ]


@router.get("/sessions/active", response_model=AttendanceSessionStatus)
async def get_active_session_status(
    class_id: int | None = Query(default=None, gt=0),
    branch_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> AttendanceSessionStatus:
    active_session = await get_active_attendance_session(
        session,
        company_id=current_user.company_id,
    )
    return AttendanceSessionStatus(
        branch_id=active_session.branch_id if active_session else None,
        class_id=active_session.branch_id if active_session else None,
        active_session=build_attendance_session_read(active_session, None)
        if active_session is not None
        else None,
    )


@router.post(
    "/sessions/start",
    response_model=AttendanceSessionRead,
    status_code=status.HTTP_201_CREATED,
)
async def start_attendance_session(
    payload: AttendanceSessionStart,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr", "branch_manager")),
) -> AttendanceSessionRead:
    await expire_stale_attendance_sessions(
        session,
        company_id=current_user.company_id,
        stopped_by_id=current_user.id,
    )
    existing_session = await get_active_attendance_session(
        session,
        company_id=current_user.company_id,
    )
    if existing_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance session is already active",
        )

    attendance_session = AttendanceSession(
        company_id=current_user.company_id,
        branch_id=None,
        started_by_id=current_user.id,
        status="active",
    )
    session.add(attendance_session)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance session is already active",
        ) from exc
    await session.refresh(attendance_session)
    return build_attendance_session_read(attendance_session, None)


@router.post("/sessions/{session_id}/stop", response_model=AttendanceSessionRead)
async def stop_attendance_session(
    session_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr", "branch_manager")),
) -> AttendanceSessionRead:
    result = await session.execute(
        select(AttendanceSession, Branch)
        .join(Branch, Branch.id == AttendanceSession.branch_id)
        .where(
            AttendanceSession.id == session_id,
            AttendanceSession.company_id == current_user.company_id,
        ),
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance session not found",
        )

    attendance_session, branch = row
    if attendance_session.status != "active" or attendance_session.stopped_at is not None:
        return build_attendance_session_read(attendance_session, branch)

    attendance_session.status = "stopped"
    attendance_session.stopped_at = datetime.now(timezone.utc)
    attendance_session.stopped_by_id = current_user.id
    await session.commit()
    await session.refresh(attendance_session)
    return build_attendance_session_read(attendance_session, branch)


@router.post("/auto-mark", response_model=AttendanceAutoMarkResponse)
@limiter.limit("60/minute")
async def auto_mark_attendance(
    request: Request,
    payload: AttendanceAutoMarkRequest,
    session: AsyncSession = Depends(get_db),
    company: Company = Depends(get_company_by_api_key),
) -> AttendanceAutoMarkResponse:
    normalized_image = normalize_base64_image(payload.image)
    active_session = await get_active_attendance_session(
        session,
        company_id=company.id,
    )
    if active_session is None:
        return AttendanceAutoMarkResponse(
            matched=False,
            action="session_closed",
            message="Attendance session is not active",
        )

    candidates_result = await session.execute(
        select(Student, FaceEmbedding)
        .join(FaceEmbedding, FaceEmbedding.student_id == Student.id)
        .where(
            Student.school_id == company.id,
            Student.status == "active",
            func.lower(FaceEmbedding.model_name) == settings.ai_model_name.lower(),
        ),
    )
    candidates = candidates_result.all()
    if not candidates:
        return AttendanceAutoMarkResponse(
            matched=False,
            message=(
                f"No {settings.ai_model_name} face enrollments found. "
                "Re-enroll student faces before scanning."
            ),
        )

    embeddings: list[dict[str, object]] = []
    usable_candidates: list[tuple[Student, FaceEmbedding]] = []
    for student, face_embedding in candidates:
        try:
            vector = read_embedding(
                ciphertext=face_embedding.embedding_ciphertext,
                legacy_vector=face_embedding.embedding_vector,
            )
        except (BiometricConfigurationError, TypeError, ValueError):
            continue
        embeddings.append({"student_id": student.id, "vector": vector})
        usable_candidates.append((student, face_embedding))

    if not embeddings:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face embeddings are unavailable; check biometric encryption configuration",
        )

    try:
        client: httpx.AsyncClient = request.app.state.http_client
        response = await client.post(
            f"{settings.ai_service_url}/recognize",
            json={"image": normalized_image, "embeddings": embeddings},
            headers=ai_service_headers(),
            timeout=AI_SERVICE_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is unavailable",
        ) from exc

    if response.status_code >= 400:
        try:
            detail: Any = response.json().get("detail")
        except ValueError:
            detail = "AI service failed to recognize the face"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail if isinstance(detail, str) else "AI service rejected the image",
        )

    recognition = response.json()
    if not recognition.get("matched"):
        reason = recognition.get("reason")
        message = {
            "ambiguous_match": "Face match is ambiguous; ask the student to face the camera directly",
            "below_threshold": "Face not recognized",
            "no_candidates": "No enrolled students found for this class",
        }.get(reason, "Face not recognized")
        return AttendanceAutoMarkResponse(
            matched=False,
            message=message,
        )

    try:
        student_id = int(recognition.get("employee_id"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid student match",
        ) from exc

    students_by_id = {student.id: student for student, _ in usable_candidates}
    student = students_by_id.get(student_id)
    if student is None:
        return AttendanceAutoMarkResponse(
            matched=False,
            message="Face not recognized for this class",
        )

    confidence_score = recognition.get("confidence")
    confidence = float(confidence_score) if confidence_score is not None else None
    now = datetime.now(timezone.utc)
    existing_attendance = await get_session_attendance_for_student(
        session,
        company_id=company.id,
        attendance_session_id=active_session.id,
        student_id=student.id,
    )
    response_student = AttendanceAutoStudent(
        id=student.id,
        name=student.student_name,
        grade=student.grade,
        section=student.section,
    )
    should_notify = has_whatsapp_config(company)

    if payload.action_type == "check_out":
        if existing_attendance is None:
            return AttendanceAutoMarkResponse(
                matched=True,
                student=response_student,
                employee=response_student,
                action="already_done",
                message=f"{student.student_name} hasn't checked in yet.",
            )
        
        if existing_attendance.check_out is not None:
            return AttendanceAutoMarkResponse(
                matched=True,
                student=response_student,
                employee=response_student,
                action="already_done",
                time=display_time(existing_attendance.check_out),
                message=f"{student.student_name} has already checked out.",
            )
            
        existing_attendance.check_out = now
        await session.commit()
        return AttendanceAutoMarkResponse(
            matched=True,
            student=response_student,
            employee=response_student,
            action="check_out",
            time=display_time(now),
            confidence_score=confidence,
            message=f"Goodbye {student.student_name}! Check-out recorded.",
        )

    if existing_attendance is not None:
        return AttendanceAutoMarkResponse(
            matched=True,
            student=response_student,
            employee=response_student,
            action="already_done",
            time=display_time(existing_attendance.check_in),
            confidence_score=confidence,
            notification_status=existing_attendance.notification_status,
            message=f"{student.student_name} is already marked for this session.",
        )

    attendance = Attendance(
        student_id=student.id,
        company_id=company.id,
        session_id=active_session.id,
        check_in=now,
        check_out=None,
        status="present",
        confidence_score=confidence,
        notification_sent=False,
        notification_status="pending" if should_notify else None,
    )
    session.add(attendance)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        existing_attendance = await get_session_attendance_for_student(
            session,
            company_id=company.id,
            attendance_session_id=active_session.id,
            student_id=student.id,
        )
        if existing_attendance is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Attendance could not be recorded",
            ) from exc
        return AttendanceAutoMarkResponse(
            matched=True,
            student=response_student,
            employee=response_student,
            action="already_done",
            time=display_time(existing_attendance.check_in),
            confidence_score=confidence,
            notification_status=existing_attendance.notification_status,
            message=f"{student.student_name} is already marked for this session.",
        )

    await session.refresh(attendance)
    if should_notify:
        attendance_id = attendance.id
        try:
            await send_checkin_notification(
                session=session,
                attendance=attendance,
                student=student,
                school=company,
                event_time=now,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception(
                "Check-in notification failed for attendance_id=%s",
                attendance_id,
            )
            persisted_attendance = await session.get(Attendance, attendance_id)
            if persisted_attendance is not None:
                persisted_attendance.notification_sent = False
                persisted_attendance.notification_status = "failed"
                await session.commit()
                attendance = persisted_attendance
    return AttendanceAutoMarkResponse(
        matched=True,
        student=response_student,
        employee=response_student,
        action="check_in",
        time=display_time(now),
        confidence_score=confidence,
        notification_status=attendance.notification_status,
        message=f"Welcome {student.student_name}! Attendance recorded.",
    )


@router.put("/manual", response_model=AttendanceDashboardRecord)
async def upsert_manual_attendance(
    payload: AttendanceManualUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr", "branch_manager")),
) -> AttendanceDashboardRecord:
    status_value = payload.status.strip().lower()
    if status_value not in MANUAL_ATTENDANCE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status must be present, absent, or excused",
        )

    student = await session.get(Student, payload.student_id)
    if student is None or student.school_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

    day_start, day_end = local_day_bounds(payload.attendance_date)
    attendance: Attendance | None = None
    if payload.attendance_id is not None:
        attendance = await session.get(Attendance, payload.attendance_id)
        if (
            attendance is None
            or attendance.company_id != current_user.company_id
            or attendance.student_id != student.id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attendance record not found",
            )
        if not (day_start <= attendance.check_in < day_end):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attendance record does not belong to the selected date",
            )
    else:
        attendance = await session.scalar(
            select(Attendance)
            .where(
                Attendance.company_id == current_user.company_id,
                Attendance.student_id == student.id,
                Attendance.check_in >= day_start,
                Attendance.check_in < day_end,
            )
            .order_by(Attendance.check_in.desc()),
        )

    if status_value == "present":
        if payload.check_in_time is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Check-in time is required for present attendance",
            )
        check_in = parse_local_clock(payload.attendance_date, payload.check_in_time)
        check_out = (
            parse_local_clock(payload.attendance_date, payload.check_out_time)
            if payload.check_out_time
            else None
        )
        if check_out is not None and check_out <= check_in:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Check-out time must be after check-in time",
            )
    else:
        check_in = day_start
        check_out = None

    if attendance is None:
        attendance = Attendance(
            student_id=student.id,
            company_id=current_user.company_id,
            check_in=check_in,
        )
        session.add(attendance)

    attendance.check_in = check_in
    attendance.check_out = check_out
    attendance.status = status_value
    attendance.confidence_score = None
    attendance.notification_sent = False
    attendance.notification_status = "manual"
    await session.commit()
    await session.refresh(attendance)

    return build_dashboard_record(student, attendance, payload.attendance_date)


@router.get("/today", response_model=list[AttendanceDashboardRecord])
async def get_today_attendance(
    class_id: int | None = Query(default=None, gt=0),
    branch_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[AttendanceDashboardRecord]:
    selected_class_id = resolve_class_query(class_id=class_id, branch_id=branch_id)
    start, end = today_bounds()
    today = local_now().date()
    students_query = (
        select(Student)
        .where(
            Student.school_id == current_user.company_id,
            Student.status == "active",
        )
        .order_by(Student.student_name)
    )
    if selected_class_id is not None:
        students_query = students_query.where(Student.class_id == selected_class_id)

    students = list((await session.execute(students_query)).scalars().all())
    attendance_result = await session.execute(
        select(Attendance)
        .where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.asc()),
    )
    attendance_by_student = {
        attendance.student_id: attendance
        for attendance in attendance_result.scalars().all()
    }

    return [
        build_dashboard_record(
            student,
            attendance_by_student.get(student.id),
            today,
        )
        for student in students
    ]


@router.get("/history", response_model=list[AttendanceDashboardRecord])
async def get_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    student_id: int | None = Query(default=None, gt=0),
    class_id: int | None = Query(default=None, gt=0),
    branch_id: int | None = Query(default=None, gt=0),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[AttendanceDashboardRecord]:
    selected_class_id = resolve_class_query(class_id=class_id, branch_id=branch_id)
    end_date = end_date or local_now().date()
    start_date = start_date or (end_date - timedelta(days=30))
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )
    start, end = date_bounds(start_date, end_date)
    offset = (page - 1) * per_page

    query = (
        select(Attendance, Student)
        .join(Student, Student.id == Attendance.student_id)
        .where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.desc())
        .offset(offset)
        .limit(per_page)
    )
    if student_id is not None:
        query = query.where(Attendance.student_id == student_id)
    if selected_class_id is not None:
        query = query.where(Student.class_id == selected_class_id)

    result = await session.execute(query)
    return [
        build_dashboard_record(student, attendance, to_local(attendance.check_in).date())
        for attendance, student in result.all()
    ]


@router.get("/export")
async def export_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    student_id: int | None = Query(default=None, gt=0),
    class_id: int | None = Query(default=None, gt=0),
    branch_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> StreamingResponse:
    selected_class_id = resolve_class_query(class_id=class_id, branch_id=branch_id)
    end_date = end_date or local_now().date()
    start_date = start_date or (end_date - timedelta(days=30))
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )
    start, end = date_bounds(start_date, end_date)
    query = (
        select(Attendance, Student)
        .join(Student, Student.id == Attendance.student_id)
        .where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.desc())
        .limit(EXPORT_MAX_RECORDS + 1)
    )
    if student_id is not None:
        query = query.where(Attendance.student_id == student_id)
    if selected_class_id is not None:
        query = query.where(Student.class_id == selected_class_id)

    rows = (await session.execute(query)).all()
    if len(rows) > EXPORT_MAX_RECORDS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Export exceeds {EXPORT_MAX_RECORDS} records; narrow the date or class filters"
            ),
        )
    records = [
        build_dashboard_record(student, attendance, to_local(attendance.check_in).date())
        for attendance, student in rows
    ]

    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        ["Student", "Class", "Date", "Check In", "Check Out", "Status", "WhatsApp", "Working Hours"],
    )
    for record in records:
        writer.writerow(
            [
                csv_safe(record.student_name),
                csv_safe(f"{record.grade}-{record.section}"),
                record.attendance_date.isoformat(),
                display_time(record.check_in) if record.check_in else "",
                display_time(record.check_out) if record.check_out else "",
                csv_safe(record.status),
                csv_safe(record.notification_status or ""),
                csv_safe(record.working_hours),
            ],
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=student-attendance.csv"},
    )


@router.get("", response_model=list[AttendanceRead])
async def list_attendance(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[Attendance]:
    offset = (page - 1) * per_page
    result = await session.execute(
        select(Attendance)
        .where(Attendance.company_id == current_user.company_id)
        .order_by(Attendance.created_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    return list(result.scalars().all())


@router.post(
    "/mark",
    response_model=AttendanceRead,
    status_code=status.HTTP_201_CREATED,
)
async def mark_attendance(
    payload: AttendanceMark,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr")),
) -> Attendance:
    student = await session.get(Student, payload.student_id)
    if student is None or student.school_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )
    check_in = payload.check_in or datetime.now(timezone.utc)
    attendance_date = to_local(check_in).date()
    day_start, day_end = local_day_bounds(attendance_date)
    existing_attendance_id = await session.scalar(
        select(Attendance.id).where(
            Attendance.company_id == current_user.company_id,
            Attendance.student_id == student.id,
            Attendance.check_in >= day_start,
            Attendance.check_in < day_end,
        ),
    )
    if existing_attendance_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance already exists for this student on the selected date",
        )

    attendance = Attendance(
        **payload.model_dump(exclude={"check_in", "company_id"}),
        company_id=current_user.company_id,
        check_in=check_in,
    )
    session.add(attendance)
    await session.commit()
    await session.refresh(attendance)
    return attendance
