import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.dependencies import get_company_by_api_key, normalize_role, require_role
from app.models.company import Company
from app.models.branch import Branch
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
from app.services.whatsapp import is_configured_secret, is_configured_value

router = APIRouter(prefix="/companies", tags=["companies"])


def generate_company_api_key() -> str:
    return secrets.token_urlsafe(32)


def ensure_company_access(current_user: User, company_id: int) -> None:
    if normalize_role(current_user.role) == "super_admin":
        return
    if current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot access another company's API key",
        )


def build_school_settings_response(company: Company) -> SchoolSettingsResponse:
    school_token_configured = is_configured_secret(company.whatsapp_token)
    default_token_configured = is_configured_secret(settings.meta_whatsapp_token)
    school_phone_id_configured = is_configured_value(company.whatsapp_phone_id)
    default_phone_id_configured = is_configured_value(settings.meta_phone_number_id)
    effective_phone_id = (
        company.whatsapp_phone_id
        if school_phone_id_configured
        else settings.meta_phone_number_id
        if default_phone_id_configured
        else None
    )
    uses_default_credentials = (
        not school_token_configured
        and default_token_configured
    ) or (
        not school_phone_id_configured
        and default_phone_id_configured
    )
    credentials_ready = (
        (school_token_configured or default_token_configured)
        and (school_phone_id_configured or default_phone_id_configured)
    )
    webhook_secure = is_configured_secret(settings.meta_app_secret)
    test_recipient_masked = (
        f"{settings.whatsapp_test_recipient[:3]}***{settings.whatsapp_test_recipient[-4:]}"
        if settings.whatsapp_test_recipient
        else None
    )
    return SchoolSettingsResponse(
        company_id=company.id,
        school_phone=company.school_phone,
        school_logo=company.school_logo,
        absent_alert_time=company.absent_alert_time,
        attendance_start_time=company.attendance_start_time,
        late_grace_minutes=company.late_grace_minutes,
        whatsapp_token_configured=school_token_configured or default_token_configured,
        whatsapp_school_token_configured=school_token_configured,
        whatsapp_default_token_configured=default_token_configured,
        whatsapp_uses_default_credentials=uses_default_credentials,
        whatsapp_phone_id=company.whatsapp_phone_id,
        whatsapp_effective_phone_id=effective_phone_id,
        whatsapp_webhook_secure=webhook_secure,
        whatsapp_chatbot_ready=credentials_ready and webhook_secure,
        whatsapp_checkin_template_configured=is_configured_value(
            settings.meta_checkin_template_name,
        ),
        whatsapp_checkout_template_configured=is_configured_value(
            settings.meta_checkout_template_name,
        ),
        whatsapp_absent_template_configured=is_configured_value(
            settings.meta_absent_template_name,
        ),
        whatsapp_test_mode=settings.whatsapp_test_mode,
        whatsapp_test_recipient_masked=test_recipient_masked,
    )


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin")),
) -> list[Company]:
    result = await session.execute(select(Company).order_by(Company.id))
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
    company: Company = Depends(get_company_by_api_key),
) -> CompanyKioskInfoResponse:
    return CompanyKioskInfoResponse(company_id=company.id, name=company.name)


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
        if field == "absent_alert_time" and value is None:
            value = "09:00"
        if field == "attendance_start_time" and value is None:
            value = "09:00"
        if field == "late_grace_minutes" and value is None:
            value = 15
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
