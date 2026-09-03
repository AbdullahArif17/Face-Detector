import csv
import hmac
from datetime import date, datetime, time, timedelta, timezone
from io import StringIO
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
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
from app.services.notification_service import NotificationService
from app.dependencies import get_company_by_api_key, require_role
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceSession
from app.models.branch import Branch
from app.models.company import Company
from app.models.employee import Employee
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
    AttendanceSessionLaunch,
    AttendanceSessionLaunchResponse,
    AttendanceSessionStatus,
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
    subject: Student | Employee,
    attendance: Attendance | None,
    attendance_date: date,
) -> AttendanceDashboardRecord:
    check_in = attendance.check_in if attendance is not None else None
    check_out = attendance.check_out if attendance is not None else None
    if attendance is not None and attendance.status in {"absent", "excused"}:
        check_in = None
        check_out = None

    is_student = isinstance(subject, Student)
    
    return AttendanceDashboardRecord(
        attendance_id=attendance.id if attendance is not None else None,
        student_id=subject.id if is_student else None,
        student_name=subject.student_name if is_student else None,
        employee_id=subject.id if not is_student else None,
        employee_name=subject.name if not is_student else None,
        designation=f"{subject.grade}-{subject.section}" if is_student else (subject.designation or ""),
        grade=subject.grade if is_student else None,
        section=subject.section if is_student else None,
        branch_id=subject.class_id if is_student else None,
        class_id=subject.class_id if is_student else None,
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


async def get_today_attendance_for_student(
    session: AsyncSession,
    *,
    company_id: int,
    student_id: int,
) -> Attendance | None:
    """Find any attendance record for a student today (across all sessions)."""
    day_start, day_end = today_bounds()
    return await session.scalar(
        select(Attendance)
        .where(
            Attendance.company_id == company_id,
            Attendance.student_id == student_id,
            Attendance.check_in >= day_start,
            Attendance.check_in < day_end,
        )
        .order_by(Attendance.check_in.desc()),
    )


def parse_recognition_subject(raw: str) -> tuple[str, int] | None:
    """Map an AI recognition id to (kind, id): "e5" -> ("employee", 5), "5" -> ("student", 5)."""
    if not raw:
        return None
    if raw.startswith("e"):
        subject_id = raw[1:]
        if subject_id.isdigit():
            return "employee", int(subject_id)
        return None
    if raw.isdigit():
        return "student", int(raw)
    return None


async def get_session_attendance_for_employee(
    session: AsyncSession,
    *,
    company_id: int,
    attendance_session_id: int,
    employee_id: int,
) -> Attendance | None:
    return await session.scalar(
        select(Attendance)
        .where(
            Attendance.company_id == company_id,
            Attendance.session_id == attendance_session_id,
            Attendance.employee_id == employee_id,
        )
        .order_by(Attendance.id.asc()),
    )


async def get_today_attendance_for_employee(
    session: AsyncSession,
    *,
    company_id: int,
    employee_id: int,
) -> Attendance | None:
    """Find any attendance record for an employee today (across all sessions)."""
    day_start, day_end = today_bounds()
    return await session.scalar(
        select(Attendance)
        .where(
            Attendance.company_id == company_id,
            Attendance.employee_id == employee_id,
            Attendance.check_in >= day_start,
            Attendance.check_in < day_end,
        )
        .order_by(Attendance.check_in.desc()),
    )


async def get_active_attendance_session(
    session: AsyncSession,
    *,
    company_id: int,
    session_type: str | None = None,
) -> AttendanceSession | None:
    day_start, day_end = today_bounds()
    # A session is only "active" until its scheduled end time. Once
    # session_end_time has passed it is treated as ended immediately, so the
    # kiosk and dashboard reflect it without waiting for the daily cleanup cron.
    # A NULL session_end_time means the session never auto-ends.
    query = (
        select(AttendanceSession)
        .where(
            AttendanceSession.company_id == company_id,
            AttendanceSession.status == "active",
            AttendanceSession.stopped_at.is_(None),
            AttendanceSession.started_at >= day_start,
            AttendanceSession.started_at < day_end,
            (AttendanceSession.session_end_time.is_(None))
            | (AttendanceSession.session_end_time > func.now()),
        )
    )
    if session_type:
        query = query.where(AttendanceSession.session_type == session_type)

    return await session.scalar(query.order_by(AttendanceSession.started_at.desc()))


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
        session_type=attendance_session.session_type,
        started_by_id=attendance_session.started_by_id,
        stopped_by_id=attendance_session.stopped_by_id,
        started_at=attendance_session.started_at,
        stopped_at=attendance_session.stopped_at,
        session_end_time=attendance_session.session_end_time,
        created_at=attendance_session.created_at,
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
        # Under the global model, there is only one active session of a given type per company
        # We can just return the most recently started active session for the status page.
        active_sessions.sort(key=lambda s: s.started_at, reverse=True)
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
    active_check_in = await get_active_attendance_session(
        session,
        company_id=current_user.company_id,
        session_type="check_in",
    )
    active_check_out = await get_active_attendance_session(
        session,
        company_id=current_user.company_id,
        session_type="check_out",
    )
    # determine "most recent" for backward compatibility of active_session
    sessions = []
    if active_check_in:
        sessions.append(active_check_in)
    if active_check_out:
        sessions.append(active_check_out)
    sessions.sort(key=lambda s: s.started_at, reverse=True)
    active_session = sessions[0] if sessions else None

    return AttendanceSessionStatus(
        branch_id=active_session.branch_id if active_session else None,
        class_id=active_session.branch_id if active_session else None,
        active_session=build_attendance_session_read(active_session, None)
        if active_session is not None
        else None,
        active_check_in_session=build_attendance_session_read(active_check_in, None)
        if active_check_in is not None
        else None,
        active_check_out_session=build_attendance_session_read(active_check_out, None)
        if active_check_out is not None
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
        session_type=payload.session_type,
    )
    if existing_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance {payload.session_type} session is already active",
        )

    session_end_time = payload.session_end_time or resolve_session_end_time(
        payload.session_end_time_local,
    )
    attendance_session = AttendanceSession(
        company_id=current_user.company_id,
        branch_id=None,
        started_by_id=current_user.id,
        status="active",
        session_type=payload.session_type,
        session_end_time=session_end_time,
    )
    session.add(attendance_session)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance {payload.session_type} session is already active",
        ) from exc
    await session.refresh(attendance_session)
    return build_attendance_session_read(attendance_session, None)


def resolve_session_end_time(end_time_str: str | None) -> datetime:
    """Build a UTC session end time from a local ``HH:MM`` setting string.

    If no end time is configured, defaults to 1 hour from now.
    """
    if not end_time_str:
        # Default: session ends 1 hour after start
        return local_now() + timedelta(hours=1)
    try:
        hours, minutes = end_time_str.split(":")
        local_dt = datetime.combine(
            local_now().date(),
            time(int(hours), int(minutes)),
            tzinfo=school_timezone(),
        )
    except (ValueError, TypeError):
        return local_now() + timedelta(hours=1)
    return local_dt.astimezone(timezone.utc)


@router.post(
    "/sessions/launch",
    response_model=AttendanceSessionLaunchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def launch_kiosk_session(
    payload: AttendanceSessionLaunch,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager"),
    ),
) -> AttendanceSessionLaunchResponse:
    """One-call kiosk launch: start the session and return the company api key.

    The session auto-ends at the check-in/check-out end time configured in school
    settings (local time, converted to UTC). If no end time is configured, the
    session defaults to 1 hour duration. The returned ``api_key`` lets the
    dashboard open the kiosk link in a single user action.
    """
    company = await session.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    end_time_str = (
        company.check_in_end_time
        if payload.session_type == "check_in"
        else company.check_out_end_time
    )
    session_end_time = resolve_session_end_time(end_time_str)

    await expire_stale_attendance_sessions(
        session,
        company_id=company.id,
        stopped_by_id=current_user.id,
    )
    existing_session = await get_active_attendance_session(
        session,
        company_id=company.id,
        session_type=payload.session_type,
    )
    if existing_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance {payload.session_type} session is already active",
        )

    attendance_session = AttendanceSession(
        company_id=company.id,
        branch_id=None,
        started_by_id=current_user.id,
        status="active",
        session_type=payload.session_type,
        session_end_time=session_end_time,
    )
    session.add(attendance_session)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance {payload.session_type} session is already active",
        ) from exc
    await session.refresh(attendance_session)
    return AttendanceSessionLaunchResponse(
        session=build_attendance_session_read(attendance_session, None),
        api_key=company.api_key,
    )


@router.post("/sessions/{session_id}/stop", response_model=AttendanceSessionRead)
async def stop_attendance_session(
    session_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin", "hr", "branch_manager")),
) -> AttendanceSessionRead:
    result = await session.execute(
        select(AttendanceSession, Branch)
        .outerjoin(Branch, Branch.id == AttendanceSession.branch_id)
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
    
    if attendance_session.session_type == "check_in":
        company = await session.get(Company, current_user.company_id)
        if company:
            absent_students_result = await session.execute(
                select(Student).where(
                    Student.school_id == current_user.company_id,
                    Student.status == "active",
                    ~select(Attendance.id).where(
                        Attendance.student_id == Student.id,
                        Attendance.session_id == attendance_session.id
                    ).exists()
                )
            )
            absent_students = absent_students_result.scalars().all()
            
            for student in absent_students:
                attendance = Attendance(
                    student_id=student.id,
                    company_id=current_user.company_id,
                    session_id=attendance_session.id,
                    check_in=datetime.now(timezone.utc),
                    status="absent",
                    notification_sent=False,
                    notification_status="pending",
                )
                session.add(attendance)
                await session.flush()
                
            # Now mark absent employees
            absent_employees_result = await session.execute(
                select(Employee).where(
                    Employee.company_id == current_user.company_id,
                    Employee.status == "active",
                    ~select(Attendance.id).where(
                        Attendance.employee_id == Employee.id,
                        Attendance.session_id == attendance_session.id
                    ).exists()
                )
            )
            absent_employees = absent_employees_result.scalars().all()
            
            for employee in absent_employees:
                attendance = Attendance(
                    employee_id=employee.id,
                    company_id=current_user.company_id,
                    session_id=attendance_session.id,
                    check_in=datetime.now(timezone.utc),
                    status="absent",
                    notification_sent=False,
                    notification_status="pending",
                )
                session.add(attendance)
                await session.flush()
                


    await session.commit()
    await session.refresh(attendance_session)
    return build_attendance_session_read(attendance_session, branch)


@router.post("/auto-mark", response_model=AttendanceAutoMarkResponse)
@limiter.limit("60/minute")
async def auto_mark_attendance(
    request: Request,
    payload: AttendanceAutoMarkRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    company: Company = Depends(get_company_by_api_key),
) -> AttendanceAutoMarkResponse:
    normalized_image = normalize_base64_image(payload.image)
    active_session = await get_active_attendance_session(
        session,
        company_id=company.id,
        session_type=payload.action_type,
    )
    if active_session is None:
        return AttendanceAutoMarkResponse(
            matched=False,
            action="session_closed",
            message="Attendance session is not active",
        )

    action_type = active_session.session_type

    candidates_result = await session.execute(
        select(Student, FaceEmbedding)
        .join(FaceEmbedding, FaceEmbedding.student_id == Student.id)
        .where(
            Student.school_id == company.id,
            Student.status == "active",
            func.lower(FaceEmbedding.model_name) == settings.ai_model_name.lower(),
        ),
    )
    employee_candidates_result = await session.execute(
        select(Employee, FaceEmbedding)
        .join(FaceEmbedding, FaceEmbedding.employee_id == Employee.id)
        .where(
            Employee.company_id == company.id,
            Employee.status == "active",
            func.lower(FaceEmbedding.model_name) == settings.ai_model_name.lower(),
        ),
    )
    candidates = candidates_result.all()
    employee_candidates = employee_candidates_result.all()
    if not candidates and not employee_candidates:
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

    # Employees use a prefixed AI id ("e5") so they never collide with students ("5").
    usable_employees: list[tuple[Employee, FaceEmbedding]] = []
    for employee, face_embedding in employee_candidates:
        try:
            vector = read_embedding(
                ciphertext=face_embedding.embedding_ciphertext,
                legacy_vector=face_embedding.embedding_vector,
            )
        except (BiometricConfigurationError, TypeError, ValueError):
            continue
        embeddings.append({"employee_id": f"e{employee.id}", "vector": vector})
        usable_employees.append((employee, face_embedding))

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

    parsed_subject = parse_recognition_subject(recognition.get("employee_id") or "")
    if parsed_subject is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an invalid subject match",
        )
    kind, subject_id = parsed_subject
    if kind == "employee":
        return await _auto_mark_employee(
            session=session,
            background_tasks=background_tasks,
            company=company,
            active_session=active_session,
            recognition=recognition,
            usable_employees=usable_employees,
            subject_id=subject_id,
        )

    students_by_id = {student.id: student for student, _ in usable_candidates}
    student = students_by_id.get(subject_id)
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
    should_notify = False

    if action_type == "check_out":
        today_attendance = await get_today_attendance_for_student(
            session,
            company_id=company.id,
            student_id=student.id,
        )
        if today_attendance is None:
            return AttendanceAutoMarkResponse(
                matched=True,
                student=response_student,
                employee=response_student,
                action="already_done",
                message=f"{student.student_name} hasn\u2019t checked in yet.",
            )
        
        if today_attendance.check_out is not None:
            return AttendanceAutoMarkResponse(
                matched=True,
                student=response_student,
                employee=response_student,
                action="already_done",
                time=display_time(today_attendance.check_out),
                message=f"{student.student_name} has already checked out.",
            )
            
        today_attendance.check_out = now
        await session.commit()
        
        background_tasks.add_task(
            NotificationService.send_company_fcm,
            company.id,
            "Student Checked Out",
            f"{student.student_name} has checked out.",
            "student_checkout",
            {"student_id": str(student.id)}
        )
        if student.parent_email:
            background_tasks.add_task(
                NotificationService.send_email,
                company_id=company.id,
                recipient_email=student.parent_email or "",
                subject="Student Check-Out Notification",
                body_text=f"Hello,\n\n{student.student_name} has checked out at {display_time(now)}.",
                body_html=f"<p>Hello,</p><p><b>{student.student_name}</b> has checked out at {display_time(now)}.</p>",
                event_type="student_checkout",
            )

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
        notification_status=None,
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

    background_tasks.add_task(
        NotificationService.send_company_fcm,
        company.id,
        "Student Checked In",
        f"{student.student_name} has checked in.",
        "student_checkin",
        {"student_id": str(student.id)}
    )
    if student.parent_email:
        background_tasks.add_task(
            NotificationService.send_email,
            company_id=company.id,
            recipient_email=student.parent_email or "",
            subject="Student Check-In Notification",
            body_text=f"Hello,\n\n{student.student_name} has checked in at {display_time(now)}.",
            body_html=f"<p>Hello,</p><p><b>{student.student_name}</b> has checked in at {display_time(now)}.</p>",
            event_type="student_checkin",
        )

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


async def _auto_mark_employee(
    *,
    session: AsyncSession,
    background_tasks: BackgroundTasks,
    company: Company,
    active_session: AttendanceSession,
    recognition: dict[str, Any],
    usable_employees: list[tuple[Employee, FaceEmbedding]],
    subject_id: int,
) -> AttendanceAutoMarkResponse:
    employees_by_id = {employee.id: employee for employee, _ in usable_employees}
    employee = employees_by_id.get(subject_id)
    if employee is None:
        return AttendanceAutoMarkResponse(
            matched=False,
            message="Face not recognized for this class",
        )

    confidence_score = recognition.get("confidence")
    confidence = float(confidence_score) if confidence_score is not None else None
    now = datetime.now(timezone.utc)
    existing_attendance = await get_session_attendance_for_employee(
        session,
        company_id=company.id,
        attendance_session_id=active_session.id,
        employee_id=employee.id,
    )
    response_employee = AttendanceAutoStudent(
        id=employee.id,
        name=employee.name,
        designation=employee.designation or "",
    )
    should_notify = False

    if active_session.session_type == "check_out":
        today_attendance = await get_today_attendance_for_employee(
            session,
            company_id=company.id,
            employee_id=employee.id,
        )
        if today_attendance is None:
            return AttendanceAutoMarkResponse(
                matched=True,
                employee=response_employee,
                action="already_done",
                message=f"{employee.name} hasn’t checked in yet.",
            )

        if today_attendance.check_out is not None:
            return AttendanceAutoMarkResponse(
                matched=True,
                employee=response_employee,
                action="already_done",
                time=display_time(today_attendance.check_out),
                message=f"{employee.name} has already checked out.",
            )

        today_attendance.check_out = now
        await session.commit()

        background_tasks.add_task(
            NotificationService.send_company_fcm,
            company.id,
            "Employee Checked Out",
            f"{employee.name} has checked out.",
            "employee_checkout",
            {"employee_id": str(employee.id)}
        )

        if company.hr_email:
            background_tasks.add_task(
                NotificationService.send_email,
                company_id=company.id,
                recipient_email=company.hr_email,
                subject="Staff Check-Out Notification",
                body_text=f"Hello HR,\n\n{employee.name} has checked out at {display_time(now)}.",
                event_type="employee_checkout",
            )

        return AttendanceAutoMarkResponse(
            matched=True,
            employee=response_employee,
            action="check_out",
            time=display_time(now),
            confidence_score=confidence,
            message=f"Goodbye {employee.name}! Check-out recorded.",
        )

    if existing_attendance is not None:
        return AttendanceAutoMarkResponse(
            matched=True,
            employee=response_employee,
            action="already_done",
            time=display_time(existing_attendance.check_in),
            confidence_score=confidence,
            notification_status=existing_attendance.notification_status,
            message=f"{employee.name} is already marked for this session.",
        )

    attendance = Attendance(
        employee_id=employee.id,
        company_id=company.id,
        session_id=active_session.id,
        check_in=now,
        check_out=None,
        status="present",
        confidence_score=confidence,
        notification_sent=False,
        notification_status=None,
    )
    session.add(attendance)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        existing_attendance = await get_session_attendance_for_employee(
            session,
            company_id=company.id,
            attendance_session_id=active_session.id,
            employee_id=employee.id,
        )
        if existing_attendance is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Attendance could not be recorded",
            ) from exc
        return AttendanceAutoMarkResponse(
            matched=True,
            employee=response_employee,
            action="already_done",
            time=display_time(existing_attendance.check_in),
            confidence_score=confidence,
            notification_status=existing_attendance.notification_status,
            message=f"{employee.name} is already marked for this session.",
        )

    await session.refresh(attendance)

    status_msg = ""
    if company.attendance_start_time:
        start_time_today = datetime.combine(now.date(), time.fromisoformat(company.attendance_start_time)).replace(tzinfo=now.tzinfo)
        if company.late_grace_minutes:
            start_time_today += timedelta(minutes=company.late_grace_minutes)
        if now > start_time_today:
            late_by = int((now - start_time_today).total_seconds() / 60)
            status_msg = f" (Late by {late_by} mins)"
        else:
            status_msg = " (On time)"

    background_tasks.add_task(
        NotificationService.send_company_fcm,
        company.id,
        "Employee Checked In",
        f"{employee.name} has checked in{status_msg}.",
        "employee_checkin",
        {"employee_id": str(employee.id)}
    )

    if company.hr_email:
        background_tasks.add_task(
            NotificationService.send_email,
            company_id=company.id,
            recipient_email=company.hr_email,
            subject="Staff Check-In Notification",
            body_text=f"Hello HR,\n\n{employee.name} has checked in at {display_time(now)}{status_msg}.",
            event_type="employee_checkin",
        )

    return AttendanceAutoMarkResponse(
        matched=True,
        employee=response_employee,
        action="check_in",
        time=display_time(now),
        confidence_score=confidence,
        notification_status=attendance.notification_status,
        message=f"Welcome {employee.name}! Attendance recorded.",
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

    # Resolve subject: either a student or an employee
    subject: Student | Employee
    subject_student_id: int | None = None
    subject_employee_id: int | None = None
    
    if payload.student_id is not None:
        student = await session.get(Student, payload.student_id)
        if student is None or student.school_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found",
            )
        subject = student
        subject_student_id = student.id
    else:
        employee = await session.get(Employee, payload.employee_id)
        if employee is None or employee.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found",
            )
        subject = employee
        subject_employee_id = employee.id

    day_start, day_end = local_day_bounds(payload.attendance_date)
    attendance: Attendance | None = None
    if payload.attendance_id is not None:
        attendance = await session.get(Attendance, payload.attendance_id)
        if attendance is None or attendance.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attendance record not found",
            )
        # Verify it belongs to the correct subject
        if subject_student_id and attendance.student_id != subject_student_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attendance record not found",
            )
        if subject_employee_id and attendance.employee_id != subject_employee_id:
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
        # Find existing attendance record for today
        lookup_filter = [
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= day_start,
            Attendance.check_in < day_end,
        ]
        if subject_student_id:
            lookup_filter.append(Attendance.student_id == subject_student_id)
        else:
            lookup_filter.append(Attendance.employee_id == subject_employee_id)
            
        attendance = await session.scalar(
            select(Attendance)
            .where(*lookup_filter)
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
            student_id=subject_student_id,
            employee_id=subject_employee_id,
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

    return build_dashboard_record(subject, attendance, payload.attendance_date)


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
    
    employees = []
    if selected_class_id is None:
        employees_query = (
            select(Employee)
            .where(
                Employee.company_id == current_user.company_id,
                Employee.status == "active",
            )
            .order_by(Employee.name)
        )
        employees = list((await session.execute(employees_query)).scalars().all())

    attendance_result = await session.execute(
        select(Attendance)
        .where(
            Attendance.company_id == current_user.company_id,
            Attendance.check_in >= start,
            Attendance.check_in < end,
        )
        .order_by(Attendance.check_in.asc()),
    )
    all_attendance = attendance_result.scalars().all()
    
    attendance_by_student = {
        att.student_id: att
        for att in all_attendance if att.student_id is not None
    }
    attendance_by_employee = {
        att.employee_id: att
        for att in all_attendance if att.employee_id is not None
    }

    records = []
    for student in students:
        records.append(
            build_dashboard_record(
                student,
                attendance_by_student.get(student.id),
                today,
            )
        )
        
    for employee in employees:
        records.append(
            build_dashboard_record(
                employee,
                attendance_by_employee.get(employee.id),
                today,
            )
        )
        
    return records


@router.get("/history", response_model=list[AttendanceDashboardRecord])
async def get_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    student_id: int | None = Query(default=None, gt=0),
    employee_id: int | None = Query(default=None, gt=0),
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
        select(Attendance, Student, Employee)
        .outerjoin(Student, Student.id == Attendance.student_id)
        .outerjoin(Employee, Employee.id == Attendance.employee_id)
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
    if employee_id is not None:
        query = query.where(Attendance.employee_id == employee_id)
    if selected_class_id is not None:
        query = query.where(Student.class_id == selected_class_id)

    result = await session.execute(query)
    
    records = []
    for attendance, student, employee in result.all():
        subject = student if student is not None else employee
        if subject is not None:
            records.append(
                build_dashboard_record(subject, attendance, to_local(attendance.check_in).date())
            )
            
    return records


@router.get("/export")
async def export_attendance_history(
    start_date: date | None = None,
    end_date: date | None = None,
    student_id: int | None = Query(default=None, gt=0),
    employee_id: int | None = Query(default=None, gt=0),
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
        select(Attendance, Student, Employee)
        .outerjoin(Student, Student.id == Attendance.student_id)
        .outerjoin(Employee, Employee.id == Attendance.employee_id)
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
    if employee_id is not None:
        query = query.where(Attendance.employee_id == employee_id)
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
        
    records = []
    for attendance, student, employee in rows:
        subject = student if student is not None else employee
        if subject is not None:
            records.append(
                build_dashboard_record(subject, attendance, to_local(attendance.check_in).date())
            )

    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        ["Name", "Designation", "Date", "Check In", "Check Out", "Status", "Working Hours"],
    )
    for record in records:
        writer.writerow(
            [
                csv_safe(record.student_name or record.employee_name or ""),
                csv_safe(record.designation or f"{record.grade}-{record.section}"),
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


async def send_absent_notification(
    session: AsyncSession,
    attendance: Attendance,
    student: Student,
    school: Company,
    event_time: datetime,
):
    if not student.parent_email:
        attendance.notification_status = "failed"
        attendance.notification_sent = False
        return
        
    
    frontend_url = settings.frontend_origins[0] if settings.frontend_origins else "http://localhost:3000"
    logo_url = f"{frontend_url.rstrip('/')}/images/face-attendance-logo.png"
    contact_html = f"<br><p>If you have any questions, please contact us at <b>{school.school_contact}</b>.</p>" if school.school_contact else ""
    
    subject = f"Absence Notice: {student.student_name}"
    body_text = f"Dear Parent,\n\nPlease be informed that {student.student_name} was marked absent on {event_time.strftime('%Y-%m-%d')}.\n\nSchool Administration"
    body_html = (
        f"<div style='font-family:sans-serif;color:#333;'>"
        f"<div style='text-align:center;margin-bottom:20px;'>"
        f"  <img src='{logo_url}' alt='Face Detector Logo' style='max-width:150px;height:auto;'>"
        f"</div>"
        f"<h2>Absence Notice</h2>"
        f"<p>Dear Parent,</p>"
        f"<p>Please be informed that <b>{student.student_name}</b> was marked absent on {event_time.strftime('%Y-%m-%d')}.</p>"
        f"{contact_html}"
        f"<br><p>Best regards,<br>School Administration</p>"
        f"</div>"
    )
    
    try:
        import os
        logo_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "public", "images", "face-attendance-logo.png")
        inline_images = []
        if os.path.exists(logo_path):
            with open(logo_path, 'rb') as img:
                inline_images.append(("facelogo", img.read(), "png"))
            body_html = body_html.replace(logo_url, "cid:facelogo")
    except Exception as e:
        logger.error(f"Error attaching logo: {e}")
        inline_images = None

    success = await NotificationService.send_email(
        company_id=school.id,
        recipient_email=student.parent_email or "",
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        event_type="absence_notice",
        inline_images=inline_images
    )
    
    if success:
        attendance.notification_sent = True
        attendance.notification_status = "sent"
    else:
        attendance.notification_sent = False
        attendance.notification_status = "failed"


@router.post("/cron/end-sessions", status_code=status.HTTP_200_OK)
async def cron_end_sessions(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Cron job to end attendance sessions that have passed their end time.

    Protected by CRON_SECRET header. Queries all sessions where status='active'
    AND session_end_time <= NOW(), marks them as 'ended', and triggers
    absent-alert logic for students not checked in.
    """
    # Verify CRON_SECRET
    cron_secret = settings.cron_secret
    if cron_secret:
        provided_secret = request.headers.get("X-Cron-Secret") or request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not hmac.compare_digest(provided_secret or "", cron_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cron secret")

    now = datetime.now(timezone.utc)
    sessions_to_end_result = await session.execute(
        select(AttendanceSession).where(
            AttendanceSession.status == "active",
            AttendanceSession.session_end_time.is_not(None),
            AttendanceSession.session_end_time <= now,
        )
    )
    sessions_to_end = sessions_to_end_result.scalars().all()

    ended_count = 0
    absent_notifications_sent = 0

    for attendance_session in sessions_to_end:
        attendance_session.status = "ended"
        attendance_session.stopped_at = now
        # stopped_by_id remains None for cron-ended sessions
        ended_count += 1

        # Trigger absent-alert logic for check_in sessions (reuse existing function)
        if attendance_session.session_type == "check_in":
            company = await session.get(Company, attendance_session.company_id)
            if company:
                # Get students who haven't checked in for this session
                absent_students_result = await session.execute(
                    select(Student).where(
                        Student.school_id == attendance_session.company_id,
                        Student.status == "active",
                        ~select(Attendance.id).where(
                            Attendance.student_id == Student.id,
                            Attendance.session_id == attendance_session.id
                        ).exists()
                    )
                )
                absent_students = absent_students_result.scalars().all()

                for student in absent_students:
                    attendance = Attendance(
                        student_id=student.id,
                        company_id=attendance_session.company_id,
                        session_id=attendance_session.id,
                        check_in=now,
                        status="absent",
                        notification_sent=False,
                        notification_status="pending",
                    )
                    session.add(attendance)
                    await session.flush()

                # Mark absent employees
                absent_employees_result = await session.execute(
                    select(Employee).where(
                        Employee.company_id == attendance_session.company_id,
                        Employee.status == "active",
                        ~select(Attendance.id).where(
                            Attendance.employee_id == Employee.id,
                            Attendance.session_id == attendance_session.id
                        ).exists()
                    )
                )
                absent_employees = absent_employees_result.scalars().all()

                for employee in absent_employees:
                    attendance = Attendance(
                        employee_id=employee.id,
                        company_id=attendance_session.company_id,
                        session_id=attendance_session.id,
                        check_in=now,
                        status="absent",
                        notification_sent=False,
                        notification_status="pending",
                    )
                    session.add(attendance)
                    await session.flush()

                    try:
                        await send_absent_notification(
                            session=session,
                            attendance=attendance,
                            student=student,
                            school=company,
                            event_time=attendance_session.started_at,
                        )
                        if attendance.notification_sent:
                            absent_notifications_sent += 1
                    except Exception:
                        logger.exception("Failed to send absent notification during cron end-session")
                        attendance.notification_status = "failed"
                        attendance.notification_sent = False

    await session.commit()
    return {
        "ended_sessions": ended_count,
        "absent_notifications_sent": absent_notifications_sent,
        "timestamp": now.isoformat(),
    }

@router.post("/cron/weekly-parent-reports", status_code=status.HTTP_200_OK)
async def cron_weekly_parent_reports(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Cron job to send weekly attendance reports to parents.
    
    Protected by CRON_SECRET header. Runs once weekly and sends the past 7 days 
    of attendance to the parent_email.
    """
    cron_secret = settings.cron_secret
    if cron_secret:
        provided_secret = request.headers.get("X-Cron-Secret") or request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not hmac.compare_digest(provided_secret or "", cron_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cron secret")

    now_utc = datetime.now(timezone.utc)
    end_date = to_local(now_utc).date()
    start_date = end_date - timedelta(days=7)
    
    start_time, end_time = date_bounds(start_date, end_date)
    
    students_result = await session.execute(
        select(Student).where(
            Student.status == "active",
            Student.parent_email.is_not(None),
            Student.parent_email != ""
        )
    )
    students = students_result.scalars().all()
    
    companies_result = await session.execute(select(Company))
    company_by_id = {c.id: c for c in companies_result.scalars().all()}
    
    attendance_result = await session.execute(
        select(Attendance, Student).join(Student).where(
            Attendance.check_in >= start_time,
            Attendance.check_in < end_time,
            Student.status == "active",
            Student.parent_email.is_not(None),
            Student.parent_email != ""
        ).order_by(Attendance.check_in.asc())
    )
    
    rows = attendance_result.all()
    attendance_by_student = {}
    for att, stu in rows:
        if stu.id not in attendance_by_student:
            attendance_by_student[stu.id] = []
        attendance_by_student[stu.id].append(att)
        
    emails_queued = 0
    
    for student in students:
        records = attendance_by_student.get(student.id, [])
        if not records:
            continue
            
        table_rows = []
        for rec in records:
            local_ci = to_local(rec.check_in)
            date_str = local_ci.strftime("%a, %b %d")
            time_str = local_ci.strftime("%I:%M %p")
            out_str = to_local(rec.check_out).strftime("%I:%M %p") if rec.check_out else "-"
            status_cap = rec.status.capitalize()
            table_rows.append(
                f"<tr>"
                f"<td style='padding:8px;border:1px solid #ccc;'>{date_str}</td>"
                f"<td style='padding:8px;border:1px solid #ccc;'>{status_cap}</td>"
                f"<td style='padding:8px;border:1px solid #ccc;'>{time_str}</td>"
                f"<td style='padding:8px;border:1px solid #ccc;'>{out_str}</td>"
                f"</tr>"
            )
            
        table_html = (
            "<table style='border-collapse:collapse;width:100%;max-width:600px;'>"
            "<thead><tr style='background-color:#f3f4f6;'>"
            "<th style='padding:8px;border:1px solid #ccc;text-align:left;'>Day</th>"
            "<th style='padding:8px;border:1px solid #ccc;text-align:left;'>Status</th>"
            "<th style='padding:8px;border:1px solid #ccc;text-align:left;'>Arrival</th>"
            "<th style='padding:8px;border:1px solid #ccc;text-align:left;'>Departure</th>"
            "</tr></thead><tbody>"
            + "".join(table_rows) +
            "</tbody></table>"
        )
        
        frontend_url = settings.frontend_origins[0] if settings.frontend_origins else "http://localhost:3000"
        logo_url = f"{frontend_url.rstrip('/')}/images/face-attendance-logo.png"

        company = company_by_id.get(student.school_id)
        contact_html = ""
        if company and company.school_contact:
            contact_html = f"<br><p>If you have any questions, please contact us at <b>{company.school_contact}</b>.</p>"

        html_body = (
            f"<div style='font-family:sans-serif;color:#333;'>"
            f"<div style='text-align:center;margin-bottom:20px;'>"
            f"  <img src='{logo_url}' alt='Face Detector Logo' style='max-width:150px;height:auto;'>"
            f"</div>"
            f"<h2>Weekly Attendance Report</h2>"
            f"<p>Hello,</p>"
            f"<p>Here is the attendance report for <b>{student.student_name}</b> for the week of {start_date.strftime('%b %d')} - {(end_date - timedelta(days=1)).strftime('%b %d')}.</p>"
            f"{table_html}"
            f"{contact_html}"
            f"<br><p>Best regards,<br>School Administration</p>"
            f"</div>"
        )
        
        try:
            import os
            logo_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "public", "images", "face-attendance-logo.png")
            inline_images = []
            if os.path.exists(logo_path):
                with open(logo_path, 'rb') as img:
                    inline_images.append(("facelogo", img.read(), "png"))
                html_body = html_body.replace(logo_url, "cid:facelogo")
        except Exception as e:
            logger.error(f"Error attaching logo: {e}")
            inline_images = None

        background_tasks.add_task(
            NotificationService.send_email,
            company_id=student.school_id,
            recipient_email=student.parent_email or "",
            subject=f"Weekly Attendance Report: {student.student_name}",
            body_text=f"Weekly Attendance Report for {student.student_name}. Please view this email in an HTML-compatible client.",
            body_html=html_body,
            event_type="weekly_report",
            inline_images=inline_images
        )
        emails_queued += 1
        
    return {
        "reports_queued": emails_queued,
        "timestamp": now_utc.isoformat(),
        "date_range": f"{start_date} to {end_date}"
    }
