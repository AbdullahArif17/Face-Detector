from typing import Annotated
from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.company import Company
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

ROLE_ALIASES = {
    "company_admin": "admin",
    "organization_admin": "admin",
    "owner": "admin",
}


def normalize_role(role: str | None) -> str:
    normalized = (role or "").strip().lower().replace("-", "_").replace(" ", "_")
    return ROLE_ALIASES.get(normalized, normalized)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", ""))
        token_company_id = int(payload.get("company_id", ""))
    except (TypeError, ValueError):
        raise credentials_error

    user = await session.get(User, user_id)
    if user is None or not user.is_active or user.company_id != token_company_id:
        raise credentials_error
    company = await session.get(Company, user.company_id)
    if company is None or company.status != "active":
        raise credentials_error
    return user


def require_role(*roles: str) -> Callable[..., object]:
    allowed_roles = {normalize_role(role) for role in roles}

    async def role_dependency(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if normalize_role(current_user.role) not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return role_dependency


async def require_same_company(
    target_company_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if normalize_role(current_user.role) == "super_admin":
        return current_user
    if current_user.company_id != target_company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot access another company's data",
        )
    return current_user


async def get_company_by_api_key(
    api_key: Annotated[str, Header(alias="X-API-Key")],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Company:
    company = await session.scalar(
        select(Company).where(
            Company.api_key == api_key,
            Company.status == "active",
        ),
    )
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid company API key",
        )
    return company
