import json
import logging
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

import firebase_admin
from firebase_admin import credentials, messaging
from app.core.config import settings
from app.models.notification_log import NotificationLog

logger = logging.getLogger(__name__)

# Initialize Firebase Admin
_firebase_initialized = False

def init_firebase():
    global _firebase_initialized
    if _firebase_initialized:
        return
    
    try:
        if settings.firebase_credentials_path:
            cred = credentials.Certificate(settings.firebase_credentials_path)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin initialized from path.")
        elif settings.firebase_credentials_json:
            cert_dict = json.loads(settings.firebase_credentials_json)
            cred = credentials.Certificate(cert_dict)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin initialized from JSON.")
        else:
            logger.warning("Firebase credentials not configured. FCM will be disabled.")
    except Exception as e:
        logger.error(f"Failed to initialize Firebase Admin: {e}")

class NotificationService:
    @staticmethod
    async def log_notification(
        db: AsyncSession,
        company_id: int,
        notification_type: str,
        event_type: str,
        status: str,
        message_content: str,
        recipient_email: str | None = None,
        recipient_fcm_token: str | None = None,
        error_message: str | None = None,
    ):
        log = NotificationLog(
            company_id=company_id,
            notification_type=notification_type,
            event_type=event_type,
            status=status,
            message_content=message_content,
            recipient_email=recipient_email,
            recipient_fcm_token=recipient_fcm_token,
            error_message=error_message,
            created_at=datetime.now(timezone.utc),
        )
        db.add(log)
        await db.commit()

    @staticmethod
    async def send_fcm_push(
        db: AsyncSession,
        company_id: int,
        token: str,
        title: str,
        body: str,
        event_type: str,
        data: dict | None = None,
    ) -> bool:
        init_firebase()
        if not _firebase_initialized:
            logger.error("Cannot send FCM message: Firebase not initialized.")
            return False
            
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=token,
        )
        
        status = "failed"
        error_msg = None
        try:
            response = messaging.send(message)
            status = "sent"
            logger.info(f"Successfully sent message: {response}")
            success = True
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error sending FCM message: {e}")
            success = False
            
        await NotificationService.log_notification(
            db=db,
            company_id=company_id,
            notification_type="fcm",
            event_type=event_type,
            status=status,
            message_content=f"Title: {title} | Body: {body}",
            recipient_fcm_token=token,
            error_message=error_msg,
        )
        return success

    @staticmethod
    async def send_company_fcm(
        db: AsyncSession,
        company_id: int,
        title: str,
        body: str,
        event_type: str,
        data: dict | None = None,
    ):
        from sqlalchemy import select
        from app.models.user_device_token import UserDeviceToken
        from app.models.user import User

        result = await db.execute(
            select(UserDeviceToken.fcm_token)
            .join(User, User.id == UserDeviceToken.user_id)
            .where(User.company_id == company_id, User.is_active == True)
        )
        tokens = result.scalars().all()
        for token in tokens:
            await NotificationService.send_fcm_push(
                db=db,
                company_id=company_id,
                token=token,
                title=title,
                body=body,
                event_type=event_type,
                data=data,
            )

    @staticmethod
    async def send_email(
        db: AsyncSession,
        company_id: int,
        recipient_email: str,
        subject: str,
        body_text: str,
        body_html: str | None = None,
        event_type: str = "weekly_report",
    ) -> bool:
        if not all([settings.smtp_host, settings.smtp_port, settings.smtp_user, settings.smtp_pass, settings.smtp_from_email]):
            logger.error("SMTP configuration is incomplete. Cannot send email.")
            return False

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = settings.smtp_from_email
        msg['To'] = recipient_email
        msg.set_content(body_text)
        
        if body_html:
            msg.add_alternative(body_html, subtype='html')

        status = "failed"
        error_msg = None
        try:
            # We use smtplib blocking call, ideally run in a thread pool for true async
            # But for simplicity, we do it directly here
            import asyncio
            
            def _send():
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                    server.starttls()
                    server.login(settings.smtp_user, settings.smtp_pass) # type: ignore
                    server.send_message(msg)
                    
            await asyncio.to_thread(_send)
            status = "sent"
            success = True
            logger.info(f"Successfully sent email to {recipient_email}")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error sending email to {recipient_email}: {e}")
            success = False
            
        await NotificationService.log_notification(
            db=db,
            company_id=company_id,
            notification_type="email",
            event_type=event_type,
            status=status,
            message_content=f"Subject: {subject} | Body: {body_text}",
            recipient_email=recipient_email,
            error_message=error_msg,
        )
        return success
