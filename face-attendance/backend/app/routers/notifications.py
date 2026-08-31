from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List

from app.core.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.notification_log import NotificationLog
from app.models.user_device_token import UserDeviceToken
from app.schemas.notification import NotificationLogResponse, UserDeviceTokenCreate

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post("/device-tokens", status_code=status.HTTP_201_CREATED)
async def register_device_token(
    payload: UserDeviceTokenCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new FCM device token for the current user.
    """
    # Check if the token already exists
    result = await db.execute(
        select(UserDeviceToken).where(UserDeviceToken.fcm_token == payload.fcm_token)
    )
    existing_token = result.scalar_one_or_none()

    if existing_token:
        # Update if it belongs to a different user, or update device name
        existing_token.user_id = current_user.id
        existing_token.device_name = payload.device_name
    else:
        new_token = UserDeviceToken(
            user_id=current_user.id,
            fcm_token=payload.fcm_token,
            device_name=payload.device_name,
        )
        db.add(new_token)

    await db.commit()
    return {"message": "Device token registered successfully"}


@router.delete("/device-tokens/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_device_token(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove an FCM device token.
    """
    result = await db.execute(
        select(UserDeviceToken).where(
            UserDeviceToken.fcm_token == token,
            UserDeviceToken.user_id == current_user.id,
        )
    )
    device_token = result.scalar_one_or_none()
    
    if not device_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Device token not found"
        )
        
    await db.delete(device_token)
    await db.commit()
    return None


@router.get("/logs", response_model=List[NotificationLogResponse])
async def get_notification_logs(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get notification logs for the company.
    """
    result = await db.execute(
        select(NotificationLog)
        .where(NotificationLog.company_id == current_user.company_id)
        .order_by(desc(NotificationLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()
