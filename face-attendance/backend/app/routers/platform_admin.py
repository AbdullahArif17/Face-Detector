from datetime import datetime, timedelta, timezone
import hmac
import secrets
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.time import local_day_bounds
from app.models.attendance import Attendance
from app.models.attendance_session import AttendanceSession
from app.models.branch import Branch
from app.models.company import Company
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.models.student import Student
from app.models.user import User
from app.schemas.platform_admin import (
    OrgDetailResponse,
    OrgListItem,
    OrgStats,
    OrgStatusUpdate,
    OrgUpdate,
    PlatformClassItem,
    PlatformEmployeeItem,
    PlatformLoginRequest,
    PlatformStatsResponse,
    PlatformStudentItem,
    PlatformUserItem,
)

router = APIRouter(prefix="/platform-admin", tags=["platform-admin"])


def create_platform_token() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "platform_admin",
        "role": "platform_admin",
        "iat": now,
        "nbf": now,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "jti": secrets.token_urlsafe(18),
        "typ": "platform_admin",
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes * 4),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def set_platform_cookie(response: Response, token: str) -> None:
    max_age = settings.access_token_expire_minutes * 4 * 60
    response.set_cookie(
        settings.platform_auth_cookie_name,
        token,
        httponly=True,
        max_age=max_age,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"


def clear_platform_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.platform_auth_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"


async def require_platform_admin(
    authorization: Annotated[str | None, Header()] = None,
    platform_cookie: Annotated[
        str | None,
        Cookie(alias="face_attendance_platform_session"),
    ] = None,
    direct_key: Annotated[str | None, Header(alias="X-Platform-Admin-Key")] = None,
) -> bool:
    expected_key = settings.platform_admin_key
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Platform admin key is not configured on the server",
        )

    # 1. Direct header key check
    if direct_key and hmac.compare_digest(direct_key.strip(), expected_key.strip()):
        return True

    # 2. Token from Authorization header or cookie
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif platform_cookie:
        token = platform_cookie

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
        if (
            payload.get("typ") != "platform_admin"
            or payload.get("role") != "platform_admin"
            or payload.get("sub") != "platform_admin"
        ):
            raise ValueError("Invalid platform token payload")
        return True
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired platform admin token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


@router.post("/login")
@limiter.limit("10/minute")
async def platform_login(
    request: Request,
    response: Response,
    payload: PlatformLoginRequest,
) -> dict[str, str]:
    expected_key = settings.platform_admin_key
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Platform admin key is not configured on the server",
        )

    provided = payload.key.strip()
    if not hmac.compare_digest(provided, expected_key.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid platform admin secret key",
        )

    token = create_platform_token()
    set_platform_cookie(response, token)
    return {"status": "ok", "token": token}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def platform_logout(response: Response) -> Response:
    clear_platform_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me")
async def platform_me(
    authenticated: bool = Depends(require_platform_admin),
) -> dict[str, bool]:
    return {"authenticated": authenticated}


@router.get("/stats", response_model=PlatformStatsResponse)
async def get_platform_stats(
    session: AsyncSession = Depends(get_db),
    _: bool = Depends(require_platform_admin),
) -> PlatformStatsResponse:
    total_orgs = await session.scalar(select(func.count(Company.id))) or 0
    active_orgs = await session.scalar(
        select(func.count(Company.id)).where(Company.status == "active")
    ) or 0
    suspended_orgs = await session.scalar(
        select(func.count(Company.id)).where(Company.status == "suspended")
    ) or 0

    total_users = await session.scalar(select(func.count(User.id))) or 0
    total_students = await session.scalar(select(func.count(Student.id))) or 0
    total_employees = await session.scalar(select(func.count(Employee.id))) or 0
    total_attendance = await session.scalar(select(func.count(Attendance.id))) or 0

    day_start, day_end = local_day_bounds()
    today_attendance = await session.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.timestamp >= day_start,
            Attendance.timestamp < day_end,
        )
    ) or 0

    active_sessions = await session.scalar(
        select(func.count(AttendanceSession.id)).where(
            AttendanceSession.status == "active",
            AttendanceSession.stopped_at.is_(None),
        )
    ) or 0

    return PlatformStatsResponse(
        total_organizations=total_orgs,
        active_organizations=active_orgs,
        suspended_organizations=suspended_orgs,
        total_users=total_users,
        total_students=total_students,
        total_employees=total_employees,
        total_attendance_records=total_attendance,
        today_attendance_records=today_attendance,
        active_sessions_count=active_sessions,
    )


@router.get("/organizations", response_model=list[OrgListItem])
async def list_organizations(
    session: AsyncSession = Depends(get_db),
    _: bool = Depends(require_platform_admin),
) -> list[OrgListItem]:
    companies = (
        await session.scalars(select(Company).order_by(Company.id.desc()))
    ).all()

    if not companies:
        return []

    company_ids = [c.id for c in companies]
    day_start, day_end = local_day_bounds()

    # Aggregate counts per company
    users_counts = dict(
        (
            await session.execute(
                select(User.company_id, func.count(User.id))
                .where(User.company_id.in_(company_ids))
                .group_by(User.company_id)
            )
        ).all()
    )

    students_counts = dict(
        (
            await session.execute(
                select(Student.school_id, func.count(Student.id))
                .where(Student.school_id.in_(company_ids))
                .group_by(Student.school_id)
            )
        ).all()
    )

    employees_counts = dict(
        (
            await session.execute(
                select(Employee.company_id, func.count(Employee.id))
                .where(Employee.company_id.in_(company_ids))
                .group_by(Employee.company_id)
            )
        ).all()
    )

    classes_counts = dict(
        (
            await session.execute(
                select(Branch.company_id, func.count(Branch.id))
                .where(Branch.company_id.in_(company_ids))
                .group_by(Branch.company_id)
            )
        ).all()
    )

    today_att_counts = dict(
        (
            await session.execute(
                select(Attendance.company_id, func.count(Attendance.id))
                .where(
                    Attendance.company_id.in_(company_ids),
                    Attendance.timestamp >= day_start,
                    Attendance.timestamp < day_end,
                )
                .group_by(Attendance.company_id)
            )
        ).all()
    )

    items: list[OrgListItem] = []
    for c in companies:
        items.append(
            OrgListItem(
                id=c.id,
                name=c.name,
                package=c.package,
                employee_limit=c.employee_limit,
                status=c.status,
                school_phone=c.school_phone,
                school_contact=c.school_contact,
                hr_email=c.hr_email,
                created_at=c.created_at,
                updated_at=c.updated_at,
                users_count=users_counts.get(c.id, 0),
                students_count=students_counts.get(c.id, 0),
                employees_count=employees_counts.get(c.id, 0),
                classes_count=classes_counts.get(c.id, 0),
                today_attendance_count=today_att_counts.get(c.id, 0),
            )
        )

    return items


@router.get("/organizations/{company_id}", response_model=OrgDetailResponse)
async def get_organization_detail(
    company_id: int,
    session: AsyncSession = Depends(get_db),
    _: bool = Depends(require_platform_admin),
) -> OrgDetailResponse:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    # Fetch users
    users = (
        await session.scalars(
            select(User).where(User.company_id == company_id).order_by(User.id)
        )
    ).all()

    # Fetch branches/classes
    classes = (
        await session.scalars(
            select(Branch).where(Branch.company_id == company_id).order_by(Branch.name)
        )
    ).all()
    class_map = {b.id: b.name for b in classes}

    # Fetch enrolled student face embeddings
    enrolled_student_ids = set(
        (
            await session.scalars(
                select(FaceEmbedding.student_id).where(
                    FaceEmbedding.company_id == company_id,
                    FaceEmbedding.student_id.is_not(None),
                )
            )
        ).all()
    )

    # Fetch students
    students = (
        await session.scalars(
            select(Student).where(Student.school_id == company_id).order_by(Student.id)
        )
    ).all()

    # Fetch enrolled employee face embeddings
    enrolled_employee_ids = set(
        (
            await session.scalars(
                select(FaceEmbedding.employee_id).where(
                    FaceEmbedding.company_id == company_id,
                    FaceEmbedding.employee_id.is_not(None),
                )
            )
        ).all()
    )

    # Fetch employees
    employees = (
        await session.scalars(
            select(Employee).where(Employee.company_id == company_id).order_by(Employee.id)
        )
    ).all()

    # Stats
    day_start, day_end = local_day_bounds()
    total_att = (
        await session.scalar(
            select(func.count(Attendance.id)).where(
                Attendance.company_id == company_id
            )
        )
        or 0
    )
    today_att = (
        await session.scalar(
            select(func.count(Attendance.id)).where(
                Attendance.company_id == company_id,
                Attendance.timestamp >= day_start,
                Attendance.timestamp < day_end,
            )
        )
        or 0
    )

    stats = OrgStats(
        users_count=len(users),
        students_count=len(students),
        employees_count=len(employees),
        classes_count=len(classes),
        total_attendance_records=total_att,
        today_attendance_records=today_att,
    )

    user_items = [
        PlatformUserItem(
            id=u.id,
            name=u.name,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            last_login=u.last_login,
            created_at=u.created_at,
        )
        for u in users
    ]

    student_items = [
        PlatformStudentItem(
            id=s.id,
            student_name=s.student_name,
            student_code=s.student_code,
            grade=s.grade,
            section=s.section,
            class_id=s.class_id,
            class_name=class_map.get(s.class_id),
            parent_name=s.parent_name,
            parent_phone=s.parent_phone,
            parent_email=s.parent_email,
            status=s.status,
            has_face_enrolled=s.id in enrolled_student_ids,
            created_at=s.created_at,
        )
        for s in students
    ]

    employee_items = [
        PlatformEmployeeItem(
            id=e.id,
            name=e.name,
            email=e.email,
            phone=e.phone,
            designation=e.designation,
            department=e.department,
            branch_id=e.branch_id,
            branch_name=class_map.get(e.branch_id),
            status=e.status,
            expected_arrival_time=e.expected_arrival_time.isoformat()
            if e.expected_arrival_time
            else None,
            expected_departure_time=e.expected_departure_time.isoformat()
            if e.expected_departure_time
            else None,
            has_face_enrolled=e.id in enrolled_employee_ids,
            created_at=e.created_at,
        )
        for e in employees
    ]

    class_items = [
        PlatformClassItem(
            id=b.id,
            name=b.name,
            location=b.location,
            created_at=b.created_at,
        )
        for b in classes
    ]

    return OrgDetailResponse(
        id=company.id,
        name=company.name,
        package=company.package,
        employee_limit=company.employee_limit,
        status=company.status,
        school_phone=company.school_phone,
        school_contact=company.school_contact,
        school_logo=company.school_logo,
        hr_email=company.hr_email,
        attendance_start_time=company.attendance_start_time,
        check_in_end_time=company.check_in_end_time,
        check_out_end_time=company.check_out_end_time,
        api_key=company.api_key,
        created_at=company.created_at,
        updated_at=company.updated_at,
        stats=stats,
        users=user_items,
        students=student_items,
        employees=employee_items,
        classes=class_items,
    )


@router.patch("/organizations/{company_id}/status")
async def update_organization_status(
    company_id: int,
    payload: OrgStatusUpdate,
    session: AsyncSession = Depends(get_db),
    _: bool = Depends(require_platform_admin),
) -> dict[str, str]:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    company.status = payload.status
    await session.commit()
    await session.refresh(company)
    return {"status": "ok", "organization_status": company.status}


@router.patch("/organizations/{company_id}")
async def update_organization_info(
    company_id: int,
    payload: OrgUpdate,
    session: AsyncSession = Depends(get_db),
    _: bool = Depends(require_platform_admin),
) -> dict[str, str]:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            if isinstance(value, str):
                value = value.strip()
            setattr(company, field, value)

    await session.commit()
    return {"status": "ok"}
