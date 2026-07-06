import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_company_by_api_key, normalize_role, require_role
from app.models.company import Company
from app.models.user import User
from app.schemas.company import (
    CompanyApiKeyResponse,
    CompanyCreate,
    CompanyKioskInfoResponse,
    CompanyRead,
    SchoolSettingsResponse,
    SchoolSettingsUpdate,
)

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
    return SchoolSettingsResponse(
        company_id=company.id,
        school_phone=company.school_phone,
        school_logo=company.school_logo,
        absent_alert_time=company.absent_alert_time,
        whatsapp_token_configured=bool(company.whatsapp_token),
        whatsapp_phone_id=company.whatsapp_phone_id,
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
