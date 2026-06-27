from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user
from app.models.branch import Branch
from app.models.company import Company
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse
from app.schemas.user import UserRead
from app.core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


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
    payload: SignupRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    email = str(payload.email).lower()
    existing_user = await session.scalar(
        select(User).where(func.lower(User.email) == email),
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    try:
        company = Company(
            name=payload.company_name.strip(),
            package="starter",
            employee_limit=50,
            status="active",
        )
        session.add(company)
        await session.flush()

        # TODO: Replace this default branch bootstrap with a full branch setup flow.
        session.add(
            Branch(
                company_id=company.id,
                name="Main Branch",
                location=None,
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
            detail="An account with this email already exists",
        ) from exc

    return build_token_response(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    credentials: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    email = str(credentials.email).lower()
    result = await session.execute(
        select(User).where(func.lower(User.email) == email),
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(
        credentials.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return build_token_response(user)


@router.get("/me", response_model=UserRead)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user
