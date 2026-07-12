from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WhatsappLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    student_id: int
    student_name: str | None = None
    parent_phone: str
    message_type: str
    message_body: str
    status: str
    meta_message_id: str | None
    error_message: str | None = None
    sent_at: datetime | None
    created_at: datetime


class WhatsappStatsResponse(BaseModel):
    sent_today: int
    failed_today: int
    total_this_month: int
    success_rate: float


class WhatsappTestRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=20)
    message: str = Field(min_length=1, max_length=1000)


class WhatsappTestResponse(BaseModel):
    success: bool
    message_id: str | None = None
    error: str | None = None


class WhatsappRetryResponse(BaseModel):
    retried: int
    success: int
    still_failed: int
