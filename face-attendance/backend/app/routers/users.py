from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password
from app.dependencies import normalize_role, require_role
from app.models.company import Company
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

CREATABLE_ROLES = {"admin", "hr", "branch_manager", "viewer"}
SUPER_ADMIN_ASSIGNABLE_ROLES = {"admin", "hr", "branch_manager", "viewer"}


def ensure_can_manage_user(current_user: User, target_user: User) -> None:
    if normalize_role(current_user.role) == "super_admin":
        return
    if target_user.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot modify users outside your company",
        )


async def ensure_company_exists(session: AsyncSession, company_id: int) -> None:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )


async def ensure_unique_email(
    session: AsyncSession,
    email: str,
    company_id: int,
    *,
    exclude_user_id: int | None = None,
) -> None:
    query = select(User.id).where(
        User.company_id == company_id,
        func.lower(User.email) == email.lower(),
    )
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    existing_id = await session.scalar(query)
    if existing_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists in this organization",
        )


async def find_user_by_email(
    session: AsyncSession,
    email: str,
    company_id: int,
) -> User | None:
    return await session.scalar(
        select(User).where(
            User.company_id == company_id,
            func.lower(User.email) == email.lower(),
        ),
    )


@router.get("", response_model=list[UserResponse])
async def list_users(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> list[User]:
    query = select(User).order_by(User.id)
    if normalize_role(current_user.role) != "super_admin":
        query = query.where(User.company_id == current_user.company_id)
    result = await session.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> User:
    role = normalize_role(payload.role)
    current_role = normalize_role(current_user.role)
    if current_role == "super_admin":
        if role not in SUPER_ADMIN_ASSIGNABLE_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This role cannot be assigned",
            )
        if payload.company_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="company_id is required for super administrators",
            )
        company_id = payload.company_id
    else:
        if role not in CREATABLE_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins can only create admin, HR, branch manager, or viewer users",
            )
        company_id = current_user.company_id

    await ensure_company_exists(session, company_id)
    email = str(payload.email).lower()
    existing_user = await find_user_by_email(session, email, company_id)
    if existing_user is not None:
        if existing_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists in this organization",
            )

        # Reactivate the soft-deleted portal account instead of leaving the
        # unique tenant/email row stuck in an unusable state.
        existing_user.name = payload.name.strip()
        existing_user.password_hash = hash_password(payload.password)
        existing_user.role = role
        existing_user.is_active = True
        existing_user.last_login = None
        await session.commit()
        await session.refresh(existing_user)
        return existing_user

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=role,
        company_id=company_id,
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists in this organization",
        ) from exc
    await session.refresh(user)
    return user


@router.delete("/{user_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> Response:
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot permanently remove yourself",
        )

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    ensure_can_manage_user(current_user, user)

    await session.delete(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This user has historical records and cannot be permanently "
                "removed. Deactivate the user instead."
            ),
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    ensure_can_manage_user(current_user, user)

    update_data = payload.model_dump(exclude_unset=True)
    if "role" in update_data and update_data["role"] is not None:
        if user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role",
            )
        allowed_roles = (
            SUPER_ADMIN_ASSIGNABLE_ROLES
            if normalize_role(current_user.role) == "super_admin"
            else CREATABLE_ROLES
        )
        update_data["role"] = normalize_role(update_data["role"])
        if update_data["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This role cannot be assigned",
            )

    if "email" in update_data and update_data["email"] is not None:
        email = str(update_data["email"]).lower()
        await ensure_unique_email(
            session,
            email,
            user.company_id,
            exclude_user_id=user.id,
        )
        update_data["email"] = email

    if "name" in update_data and update_data["name"] is not None:
        update_data["name"] = str(update_data["name"]).strip()

    if "password" in update_data:
        password = update_data.pop("password")
        if password is not None:
            update_data["password_hash"] = hash_password(str(password))

    for field, value in update_data.items():
        setattr(user, field, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists in this organization",
        ) from exc
    await session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> Response:
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate yourself",
        )

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    ensure_can_manage_user(current_user, user)

    user.is_active = False
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    ensure_can_manage_user(current_user, user)

    user.is_active = True
    await session.commit()
    await session.refresh(user)
    return user
