import logging
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
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

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

    # Notify the platform admin about the new organization signup.
    admin_email = settings.platform_admin_email
    if admin_email:
        try:
            await NotificationService.send_email(
                company_id=company.id,
                recipient_email=admin_email,
                subject=f"New Organization Signup: {company_name}",
                body_text=(
                    f"A new organization has just signed up on Face Attendance.\n\n"
                    f"Organization: {company_name}\n"
                    f"Admin Name: {user.name}\n"
                    f"Admin Email: {user.email}\n"
                    f"Organization ID: {company.id}\n"
                    f"Package: {company.package}\n"
                    f"Registered At: {user.created_at}\n\n"
                    f"Log in to the Platform Admin Panel to review this organization."
                ),
                body_html=(
                    f'<div style="font-family:sans-serif;max-width:600px;margin:0 auto">'
                    f'<h2 style="color:#7c3aed">New Organization Signup</h2>'
                    f'<p>A new organization has just registered on <strong>Face Attendance</strong>.</p>'
                    f'<table style="width:100%;border-collapse:collapse;margin:16px 0">'
                    f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">Organization</td>'
                    f'<td style="padding:8px 12px;border:1px solid #e2e8f0">{company_name}</td></tr>'
                    f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">Admin Name</td>'
                    f'<td style="padding:8px 12px;border:1px solid #e2e8f0">{user.name}</td></tr>'
                    f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">Admin Email</td>'
                    f'<td style="padding:8px 12px;border:1px solid #e2e8f0">{user.email}</td></tr>'
                    f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">Organization ID</td>'
                    f'<td style="padding:8px 12px;border:1px solid #e2e8f0">#{company.id}</td></tr>'
                    f'<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">Package</td>'
                    f'<td style="padding:8px 12px;border:1px solid #e2e8f0">{company.package}</td></tr>'
                    f'</table>'
                    f'<p style="color:#64748b;font-size:13px">'
                    f'Log in to the <a href="#" style="color:#7c3aed">Platform Admin Panel</a> to review and manage this organization.</p>'
                    f'</div>'
                ),
                event_type="new_org_signup",
            )
        except Exception:
            logger.warning(
                "Failed to send new-org notification email to %s for org %s",
                admin_email,
                company.id,
                exc_info=True,
            )

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

    # Look up user + company WITHOUT filtering by status so we can
    # distinguish "suspended org" from "wrong credentials".
    result = await session.execute(
        select(User, Company.status)
        .join(Company, User.company_id == Company.id)
        .where(
            func.lower(User.email) == email,
            func.lower(func.trim(Company.name)) == organization_name,
        ),
    )
    row = result.one_or_none()
    user = row[0] if row is not None else None
    company_status = row[1] if row is not None else None

    password_matches = verify_password(
        credentials.password,
        user.password_hash if user is not None else DUMMY_PASSWORD_HASH,
    )
    if user is None or not user.is_active or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid organization, email, or password",
        )

    # Valid credentials but the organization has been suspended by the
    # platform administrator — surface a clear, actionable message.
    if company_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your organization has been disabled by the platform"
                " administrator. Please contact support for assistance."
            ),
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
