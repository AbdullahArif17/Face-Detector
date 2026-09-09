from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List

from app.core.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.notification_log import NotificationLog
from app.models.user_device_token import UserDeviceToken
from app.schemas.notification import NotificationLogResponse, UserDeviceTokenCreate
from app.services.notification_service import NotificationService

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
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(
        require_role("super_admin", "admin", "hr", "branch_manager", "viewer")
    ),
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


@router.get("/device-status")
async def get_device_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get registered device count for the current user.
    """
    result = await db.execute(
        select(UserDeviceToken.fcm_token)
        .where(UserDeviceToken.user_id == current_user.id)
    )
    tokens = result.scalars().all()
    return {
        "user_id": current_user.id,
        "device_count": len(tokens),
        "is_registered": len(tokens) > 0,
    }


@router.post("/test", status_code=status.HTTP_200_OK)
async def send_test_notification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a test FCM push notification to the current user's registered devices.
    """
    if current_user.role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers do not receive staff attendance notifications.",
        )

    result = await db.execute(
        select(UserDeviceToken.fcm_token)
        .where(UserDeviceToken.user_id == current_user.id)
    )
    if not NotificationService.is_initialized():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase Admin is not configured on the backend server. Please verify that FIREBASE_CREDENTIALS_JSON is set in the backend environment variables on Vercel.",
        )

    tokens = result.scalars().all()
    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered devices found for your account. Please allow and register notifications on this device first.",
        )

    success_count = 0
    for token in tokens:
        sent = await NotificationService.send_fcm_push(
            company_id=current_user.company_id,
            token=token,
            title="Test Notification",
            body=f"Push notifications are active for {current_user.name} ({current_user.role.replace('_', ' ').title()}).",
            event_type="test_notification",
            data={"user_id": str(current_user.id)},
            db=db,
        )
        if sent:
            success_count += 1

    if success_count > 0:
        msg = f"Test notification delivered to {success_count} of {len(tokens)} device(s)."
    else:
        msg = f"Delivery failed for {len(tokens)} device(s). Please tap 'Re-sync Device' to refresh your device token."

    return {
        "message": msg,
        "devices_targeted": len(tokens),
        "devices_reached": success_count,
    }
