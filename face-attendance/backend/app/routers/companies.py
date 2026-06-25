from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.company import Company
from app.models.user import User
from app.schemas.company import CompanyCreate, CompanyRead

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Company]:
    query = select(Company).order_by(Company.id)
    if current_user.role != "super_admin":
        query = query.where(Company.id == current_user.company_id)
    result = await session.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Company:
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super administrators can create companies",
        )
    company = Company(**payload.model_dump())
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return company
