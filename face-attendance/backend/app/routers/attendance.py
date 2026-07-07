import asyncio
from datetime import date, datetime, time, timedelta, timezone
from io import StringIO
from math import ceil
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.dependencies import get_company_by_api_key, require_role
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceSession
from app.models.branch import Branch
from app.models.company import Company
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.schemas.attendance import (
    AttendanceAutoMarkRequest,
    AttendanceAutoMarkResponse,
    AttendanceAutoStudent,
    AttendanceDashboardRecord,
    AttendanceMark,
    AttendanceRead,
    AttendanceSessionRead,
    AttendanceSessionStart,
    AttendanceSessionStatus,
)
from app.services.whatsapp import (
    checkin_message_body,
    checkout_message_body,
    get_whatsapp_credentials,
    log_whatsapp_message,
    send_checkin_message,
    send_checkout_message,
    school_phone_or_default,
)

router = APIRouter(prefix="/attendance", tags=["attendance"])

AI_SERVICE_TIMEOUT_SECONDS = 90.0
COOLDOWN_MINUTES = 5

# TODO: Replace the default shift policy with a real school schedule table.
DEFAULT_SHIFT_START = time(hour=9, minute=0)
DEFAULT_SHIFT_GRACE_MINUTES = 15


def ai_service_headers() -> dict[str, str]:
    api_key = settings.ai_api_key
    if not api_key:
        return {}
    return {"X-API-Key": api_key}


def today_bounds() -> tuple[datetime, datetime]:
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end


def date_bounds(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(end_date, time.min, tzinfo=timezone.utc) + timedelta(days=1)
    return start, end


def display_time(value: datetime) -> str:
    return value.astimezone().strftime("%I:%M %p").lstrip("0")


def display_date(value: datetime) -> str:
    return value.astimezone().strftime("%d %b %Y")


def working_hours(check_in: datetime | None, check_out: datetime | None) -> str:
    if check_in is None or check_out is None:
        return "—"
    total_seconds = max(0, int((check_out - check_in).total_seconds()))
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    return f"{hours}h {minutes}m"


def get_check_in_status(check_in: datetime) -> str:
    shift_deadline = datetime.combine(
        check_in.date(),
        DEFAULT_SHIFT_START,
        tzinfo=timezone.utc,
    ) + timedelta(minutes=DEFAULT_SHIFT_GRACE_MINUTES)
    return "late" if check_in > shift_deadline else "present"


def build_dashboard_record(
    student: Student,
    attendance: Attendance | None,
    attendance_date: date,
) -> AttendanceDashboardRecord:
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
        check_in=attendance.check_in if attendance is not None else None,
        check_out=attendance.check_out if attendance is not None else None,
        status=attendance.status if attendance is not None else "absent",
        confidence_score=attendance.confidence_score if attendance is not None else None,
        notification_sent=attendance.notification_sent if attendance is not None else False,
        notification_status=attendance.notification_status if attendance is not None else None,
        working_hours=working_hours(
            attendance.check_in if attendance is not None else None,
            attendance.check_out if attendance is not None else None,
        ),
        attendance_date=attendance_date,
    )


async def get_today_attendance_for_student(
    session: AsyncSession,
    student_id: int,
) -> Attendance | None:
    start, end = today_bounds()
    return await session.scalar(
        select(Attendance)
        .where(
            Attendance.student_id == student_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.desc()),
    )


async def get_active_attendance_session(
    session: AsyncSession,
    *,
    company_id: int,
    branch_id: int,
) -> AttendanceSession | None:
    return await session.scalar(
        select(AttendanceSession)
        .where(
            AttendanceSession.company_id == company_id,
            AttendanceSession.branch_id == branch_id,
            AttendanceSession.status == "active",
            AttendanceSession.stopped_at.is_(None),
        )
        .order_by(AttendanceSession.started_at.desc()),
    )


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
        branch_name=branch.name if branch is not None else None,
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


async def send_attendance_notification(
    *,
    attendance_id: int,
    message_type: str,
    event_time: datetime,
) -> None:
    async with SessionLocal() as session:
        attendance = await session.get(Attendance, attendance_id)
        if attendance is None:
            return

        student = await session.get(Student, attendance.student_id)
        school = await session.get(Company, attendance.company_id)
        if student is None or school is None:
            return

        access_token, phone_number_id = get_whatsapp_credentials(school)
        if not access_token or not phone_number_id:
            attendance.notification_status = None
            await session.commit()
            return

        check_time = display_time(event_time)
        date_str = display_date(event_time)
        if message_type == "check_out":
            message_body = checkout_message_body(student, school, check_time, date_str)
            result = await send_checkout_message(
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
        else:
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
            message_type=message_type,
            message_body=message_body,
            status=notification_status,
            meta_message_id=result["message_id"] if isinstance(result["message_id"], str) else None,
        )
        await session.commit()


def schedule_attendance_notification(
    *,
    attendance_id: int,
    message_type: str,
    event_time: datetime,
) -> None:
    asyncio.create_task(
        send_attendance_notification(
            attendance_id=attendance_id,
            message_type=message_type,
            event_time=event_time,
        ),
    )


@router.get("/sessions", response_model=list[AttendanceSessionRead])
async def list_attendance_sessions(
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
        .join(Branch, Branch.id == AttendanceSession.branch_id)
        .where(AttendanceSession.company_id == current_user.company_id)
        .order_by(AttendanceSession.started_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    if branch_id is not None:
        query = query.where(AttendanceSession.branch_id == branch_id)
    if status_filter:
        query = query.where(AttendanceSession.status == status_filter)

    result = await session.execute(query)
    return [
        build_attendance_session_read(attendance_session, branch)
        for attendance_session, branch in result.all()
    ]


@router.get("/sessions/active", response_model=AttendanceSessionStatus)
async def get_active_session_status(
    branch_id: int = Query(gt=0),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> AttendanceSessionStatus:
    branch = await get_company_branch(
        session,
        company_id=current_user.company_id,
        branch_id=branch_id,
    )
    active_session = await get_active_attendance_session(
        session,
        company_id=current_user.company_id,
        branch_id=branch_id,
    )
    return AttendanceSessionStatus(
        branch_id=branch_id,
        active_session=build_attendance_session_read(active_session, branch)
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
    branch = await get_company_branch(
        session,
        company_id=current_user.company_id,
        branch_id=payload.branch_id,
    )
    existing_session = await get_active_attendance_session(
        session,
        company_id=current_user.company_id,
        branch_id=payload.branch_id,
    )
    if existing_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance is already active for this class",
        )

    attendance_session = AttendanceSession(
        company_id=current_user.company_id,
        branch_id=payload.branch_id,
        started_by_id=current_user.id,
        status="active",
    )
    session.add(attendance_session)
    await session.commit()
    await session.refresh(attendance_session)
    return build_attendance_session_read(attendance_session, branch)


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
async def auto_mark_attendance(
    request: Request,
    payload: AttendanceAutoMarkRequest,
    session: AsyncSession = Depends(get_db),
    company: Company = Depends(get_company_by_api_key),
) -> AttendanceAutoMarkResponse:
    await get_company_branch(
        session,
        company_id=company.id,
        branch_id=payload.branch_id,
    )
    active_session = await get_active_attendance_session(
        session,
        company_id=company.id,
        branch_id=payload.branch_id,
    )
    if active_session is None:
        return AttendanceAutoMarkResponse(
            matched=False,
            action="session_closed",
            message="Attendance session is not active for this class",
        )

    candidates_result = await session.execute(
        select(Student, FaceEmbedding)
        .join(FaceEmbedding, FaceEmbedding.student_id == Student.id)
        .where(
            Student.school_id == company.id,
            Student.class_id == payload.branch_id,
            Student.status == "active",
        ),
    )
    candidates = candidates_result.all()
    if not candidates:
        return AttendanceAutoMarkResponse(
            matched=False,
            message="No enrolled students found for this class",
        )

    embeddings = [
        {
            "employee_id": str(student.id),
            "vector": face_embedding.embedding_vector,
        }
        for student, face_embedding in candidates
    ]

    try:
        client: httpx.AsyncClient = request.app.state.http_client
        response = await client.post(
            f"{settings.ai_service_url}/recognize",
            json={"image": payload.image, "embeddings": embeddings},
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
        return AttendanceAutoMarkResponse(
            matched=False,
            message="Face not recognized",
        )

    try:
        student_id = int(recognition.get("employee_id"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid student match",
        ) from exc

    students_by_id = {student.id: student for student, _ in candidates}
    student = students_by_id.get(student_id)
    if student is None:
        return AttendanceAutoMarkResponse(
            matched=False,
            message="Face not recognized for this class",
        )

    confidence_score = recognition.get("confidence")
    confidence = float(confidence_score) if confidence_score is not None else None
    now = datetime.now(timezone.utc)
    existing_attendance = await get_today_attendance_for_student(session, student.id)
    response_student = AttendanceAutoStudent(
        id=student.id,
        name=student.student_name,
        grade=student.grade,
        section=student.section,
    )
    should_notify = has_whatsapp_config(company)
    pending_status = "pending" if should_notify else None

    if existing_attendance is None or existing_attendance.status == "absent":
        attendance = existing_attendance or Attendance(
            student_id=student.id,
            company_id=company.id,
            check_in=now,
        )
        attendance.check_in = now
        attendance.check_out = None
        attendance.session_id = active_session.id
        attendance.status = get_check_in_status(now)
        attendance.confidence_score = confidence
        attendance.notification_sent = False
        attendance.notification_status = pending_status
        if existing_attendance is None:
            session.add(attendance)
        await session.commit()
        await session.refresh(attendance)
        if should_notify:
            schedule_attendance_notification(
                attendance_id=attendance.id,
                message_type="check_in",
                event_time=now,
            )
        return AttendanceAutoMarkResponse(
            matched=True,
            student=response_student,
            employee=response_student,
            action="check_in",
            time=display_time(now),
            confidence_score=confidence,
            notification_status=pending_status,
            message=f"Welcome {student.student_name}! Check-in recorded.",
        )

    if existing_attendance.check_out is None:
        elapsed = now - existing_attendance.check_in
        if elapsed < timedelta(minutes=COOLDOWN_MINUTES):
            wait_minutes = max(
                1,
                ceil((timedelta(minutes=COOLDOWN_MINUTES) - elapsed).total_seconds() / 60),
            )
            return AttendanceAutoMarkResponse(
                matched=True,
                student=response_student,
                employee=response_student,
                action="too_soon",
                time=display_time(now),
                confidence_score=confidence,
                notification_status=existing_attendance.notification_status,
                message=f"Too soon, wait {wait_minutes} minute{'s' if wait_minutes != 1 else ''}",
            )

        existing_attendance.check_out = now
        if existing_attendance.session_id is None:
            existing_attendance.session_id = active_session.id
        existing_attendance.notification_sent = False
        existing_attendance.notification_status = pending_status
        if confidence is not None:
            existing_attendance.confidence_score = confidence
        await session.commit()
        if should_notify:
            schedule_attendance_notification(
                attendance_id=existing_attendance.id,
                message_type="check_out",
                event_time=now,
            )
        return AttendanceAutoMarkResponse(
            matched=True,
            student=response_student,
            employee=response_student,
            action="check_out",
            time=display_time(now),
            confidence_score=confidence,
            notification_status=pending_status,
            message=f"Goodbye {student.student_name}! Check-out recorded.",
        )

    return AttendanceAutoMarkResponse(
        matched=True,
        student=response_student,
        employee=response_student,
        action="already_done",
        time=display_time(now),
        confidence_score=confidence,
        notification_status=existing_attendance.notification_status,
        message="Already completed for today",
    )


@router.get("/today", response_model=list[AttendanceDashboardRecord])
async def get_today_attendance(
    branch_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[AttendanceDashboardRecord]:
    start, end = today_bounds()
    today = start.date()
    students_query = (
        select(Student)
        .where(
            Student.school_id == current_user.company_id,
            Student.status == "active",
        )
        .order_by(Student.student_name)
    )
    if branch_id is not None:
        students_query = students_query.where(Student.class_id == branch_id)

    students = list((await session.execute(students_query)).scalars().all())
    attendance_result = await session.execute(
        select(Attendance).where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        ),
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
    branch_id: int | None = Query(default=None, gt=0),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[AttendanceDashboardRecord]:
    end_date = end_date or datetime.now(timezone.utc).date()
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
    if branch_id is not None:
        query = query.where(Student.class_id == branch_id)

    result = await session.execute(query)
    return [
        build_dashboard_record(student, attendance, attendance.check_in.date())
        for attendance, student in result.all()
    ]


@router.get("/export")
async def export_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    student_id: int | None = Query(default=None, gt=0),
    branch_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> StreamingResponse:
    records = await get_attendance_history(
        start_date=start_date,
        end_date=end_date,
        student_id=student_id,
        branch_id=branch_id,
        page=1,
        per_page=100,
        session=session,
        current_user=current_user,
    )

    output = StringIO()
    output.write("Student,Class,Date,Check In,Check Out,Status,WhatsApp,Working Hours\n")
    for record in records:
        output.write(
            ",".join(
                [
                    record.student_name,
                    f"{record.grade}-{record.section}",
                    record.attendance_date.isoformat(),
                    display_time(record.check_in) if record.check_in else "",
                    display_time(record.check_out) if record.check_out else "",
                    record.status,
                    record.notification_status or "",
                    record.working_hours,
                ],
            )
            + "\n",
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
    attendance = Attendance(
        **payload.model_dump(exclude={"check_in", "company_id"}),
        company_id=current_user.company_id,
        check_in=payload.check_in or datetime.now(timezone.utc),
    )
    session.add(attendance)
    await session.commit()
    await session.refresh(attendance)
    return attendance
