from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class UserDeviceTokenCreate(BaseModel):
    fcm_token: str = Field(..., description="Firebase Cloud Messaging Registration Token")
    device_name: str | None = Field(None, description="Optional name of the device")

class NotificationLogResponse(BaseModel):
    id: int
    company_id: int
    recipient_email: str | None
    recipient_fcm_token: str | None
    notification_type: str
    event_type: str
    status: str
    message_content: str
    error_message: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
