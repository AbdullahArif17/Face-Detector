from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    clear_auth_cookies,
    create_access_token,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from app.core.config import settings
from app.dependencies import get_current_user
from app.models.branch import Branch
from app.models.company import Company
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse
from app.schemas.user import UserRead
from app.core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])
# A non-account bcrypt hash keeps invalid-user and invalid-password checks on
# the same expensive code path, reducing account-enumeration timing signals.
DUMMY_PASSWORD_HASH = "$2b$12$oLcubG2pLPUuPfrZXJ.2eOtWuOAEmjvxP3iZw54WX4pkK3KWYWdMa"


def build_token_response(user: User) -> TokenResponse:
    token = create_access_token(
        {
            "sub": str(user.id),
            "company_id": user.company_id,
            "role": user.role,
        },
    )
    return TokenResponse(
        access_token=token,
        user=UserRead.model_validate(user),
    )


@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def signup(
    request: Request,
    response: Response,
    payload: SignupRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    if not settings.allow_public_signup:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public organization signup is disabled",
        )
    email = str(payload.email).lower()
    company_name = payload.company_name.strip()
    existing_company_id = await session.scalar(
        select(Company.id).where(
            func.lower(func.trim(Company.name)) == company_name.lower(),
        ),
    )
    if existing_company_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organization with this name already exists",
        )

    try:
        company = Company(
            name=company_name,
            package="starter",
            employee_limit=50,
            status="active",
        )
        session.add(company)
        await session.flush()

        session.add(
            Branch(
                company_id=company.id,
                name="Class 1-A",
                location="Classroom",
            ),
        )

        user = User(
            name=payload.name.strip(),
            email=email,
            password_hash=hash_password(payload.password),
            role="admin",
            company_id=company.id,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This organization or user already exists",
        ) from exc

    token_response = build_token_response(user)
    set_auth_cookies(response, token_response.access_token)
    return token_response


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    credentials: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    email = str(credentials.email).lower()
    organization_name = credentials.organization_name.strip().lower()
    result = await session.execute(
        select(User)
        .join(Company, User.company_id == Company.id)
        .where(
            func.lower(User.email) == email,
            func.lower(func.trim(Company.name)) == organization_name,
            Company.status == "active",
        ),
    )
    user = result.scalar_one_or_none()

    password_matches = verify_password(
        credentials.password,
        user.password_hash if user is not None else DUMMY_PASSWORD_HASH,
    )
    if user is None or not user.is_active or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid organization, email, or password",
        )

    user.last_login = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(user)
    token_response = build_token_response(user)
    set_auth_cookies(response, token_response.access_token)
    return token_response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
) -> Response:
    clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserRead)
async def get_me(
    response: Response,
    current_user: User = Depends(get_current_user),
) -> User:
    response.headers["Cache-Control"] = "no-store"
    return current_user
