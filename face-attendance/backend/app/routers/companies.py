import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.time import local_day_bounds
from app.dependencies import get_company_by_api_key, require_role
from app.models.attendance_session import AttendanceSession
from app.models.branch import Branch
from app.models.company import Company
from app.models.student import Student
from app.models.user import User
from app.schemas.company import (
    CompanyApiKeyResponse,
    CompanyCreate,
    CompanyKioskInfoResponse,
    CompanyRead,
    SchoolClassResponse,
    SchoolSettingsResponse,
    SchoolSettingsUpdate,
)

router = APIRouter(prefix="/companies", tags=["companies"])


def generate_company_api_key() -> str:
    return secrets.token_urlsafe(32)


def ensure_company_access(current_user: User, company_id: int) -> None:
    if current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )


def build_school_settings_response(company: Company) -> SchoolSettingsResponse:
    return SchoolSettingsResponse(
        company_id=company.id,
        school_phone=company.school_phone,
        school_contact=company.school_contact,
        school_logo=company.school_logo,
        hr_email=company.hr_email,
        attendance_start_time=company.attendance_start_time,
        check_in_end_time=company.check_in_end_time,
        check_out_end_time=company.check_out_end_time,
        late_grace_minutes=company.late_grace_minutes,
    )


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin")),
) -> list[Company]:
    result = await session.execute(
        select(Company)
        .where(Company.id == current_user.company_id)
        .order_by(Company.id),
    )
    return list(result.scalars().all())


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin")),
) -> Company:
    company = Company(**payload.model_dump(), api_key=generate_company_api_key())
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return company


@router.get("/kiosk-info", response_model=CompanyKioskInfoResponse)
async def get_company_kiosk_info(
    class_id: int | None = Query(default=None, gt=0),
    session: AsyncSession = Depends(get_db),
    company: Company = Depends(get_company_by_api_key),
) -> CompanyKioskInfoResponse:

    student_count = int(
        await session.scalar(
            select(func.count(Student.id)).where(
                Student.school_id == company.id,
                Student.status == "active",
            ),
        )
        or 0,
    )
    day_start, day_end = local_day_bounds()
    active_session = await session.scalar(
        select(AttendanceSession).where(
            AttendanceSession.company_id == company.id,
            AttendanceSession.status == "active",
            AttendanceSession.stopped_at.is_(None),
            AttendanceSession.started_at >= day_start,
            AttendanceSession.started_at < day_end,
        ).limit(1)
    )

    attendance_active = active_session is not None
    session_expires_at = None
    if active_session:
        duration_mins = company.default_session_duration_minutes or 60
        expires_dt = active_session.started_at + timedelta(minutes=duration_mins)
        session_expires_at = expires_dt.isoformat()

    return CompanyKioskInfoResponse(
        company_id=company.id,
        name=company.name,
        school_logo=company.school_logo,
        student_count=student_count,
        attendance_active=attendance_active,
        session_expires_at=session_expires_at,
    )


@router.get("/{company_id}/classes", response_model=list[SchoolClassResponse])
async def list_school_classes(
    company_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer"),
    ),
) -> list[SchoolClassResponse]:
    ensure_company_access(current_user, company_id)
    result = await session.execute(
        select(Branch)
        .join(Student, Student.class_id == Branch.id)
        .where(Branch.company_id == company_id)
        .distinct()
        .order_by(Branch.name),
    )
    return [
        SchoolClassResponse(id=school_class.id, name=school_class.name, location=school_class.location)
        for school_class in result.scalars().all()
    ]


@router.get("/{company_id}/settings", response_model=SchoolSettingsResponse)
async def get_school_settings(
    company_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> SchoolSettingsResponse:
    ensure_company_access(current_user, company_id)
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    return build_school_settings_response(company)


@router.put("/{company_id}/settings", response_model=SchoolSettingsResponse)
async def update_school_settings(
    company_id: int,
    payload: SchoolSettingsUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> SchoolSettingsResponse:
    ensure_company_access(current_user, company_id)
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(company, field, value)

    await session.commit()
    await session.refresh(company)
    return build_school_settings_response(company)


@router.get("/{company_id}/api-key", response_model=CompanyApiKeyResponse)
async def get_company_api_key(
    company_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> CompanyApiKeyResponse:
    ensure_company_access(current_user, company_id)
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    return CompanyApiKeyResponse(company_id=company.id, api_key=company.api_key)


@router.post("/{company_id}/regenerate-key", response_model=CompanyApiKeyResponse)
async def regenerate_company_api_key(
    company_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> CompanyApiKeyResponse:
    ensure_company_access(current_user, company_id)
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    company.api_key = generate_company_api_key()
    await session.commit()
    await session.refresh(company)
    return CompanyApiKeyResponse(company_id=company.id, api_key=company.api_key)
