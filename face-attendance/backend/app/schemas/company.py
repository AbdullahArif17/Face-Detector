from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def validate_clock_time(value: str | None) -> str | None:
    if value is None:
        return None
    hour, minute = (int(part) for part in value.split(":", 1))
    if hour > 23 or minute > 59:
        raise ValueError("Time must be a valid 24-hour HH:MM value")
    return value


class CompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    package: str = Field(default="starter", max_length=100)
    employee_limit: int = Field(default=10, ge=1)
    status: str = Field(default="active", max_length=50)
    school_phone: str | None = Field(default=None, max_length=50)
    school_logo: str | None = Field(default=None, max_length=500)
    absent_alert_time: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    attendance_start_time: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    late_grace_minutes: int = Field(default=15, ge=0, le=180)
    whatsapp_phone_id: str | None = Field(default=None, max_length=100)

    @field_validator("absent_alert_time", "attendance_start_time")
    @classmethod
    def validate_schedule_time(cls, value: str) -> str:
        return validate_clock_time(value) or "09:00"


class CompanyCreate(CompanyBase):
    pass


class CompanyRead(CompanyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class CompanyApiKeyResponse(BaseModel):
    company_id: int
    api_key: str


class CompanyKioskInfoResponse(BaseModel):
    company_id: int
    name: str
    school_logo: str | None = None
    class_id: int | None = None
    class_name: str | None = None
    class_location: str | None = None
    student_count: int = Field(default=0, ge=0)
    attendance_active: bool = False


class SchoolClassResponse(BaseModel):
    id: int
    name: str
    location: str | None = None


class SchoolSettingsResponse(BaseModel):
    company_id: int
    school_phone: str | None
    school_logo: str | None
    absent_alert_time: str
    attendance_start_time: str
    late_grace_minutes: int
    whatsapp_token_configured: bool
    whatsapp_school_token_configured: bool = False
    whatsapp_default_token_configured: bool = False
    whatsapp_uses_default_credentials: bool = False
    whatsapp_phone_id: str | None
    whatsapp_effective_phone_id: str | None = None
    whatsapp_webhook_secure: bool = False
    whatsapp_chatbot_ready: bool = False
    whatsapp_checkin_template_configured: bool = False
    whatsapp_checkout_template_configured: bool = False
    whatsapp_absent_template_configured: bool = False
    whatsapp_test_mode: bool = False
    whatsapp_test_recipient_masked: str | None = None


class SchoolSettingsUpdate(BaseModel):
    school_phone: str | None = Field(default=None, max_length=50)
    school_logo: str | None = Field(default=None, max_length=500)
    absent_alert_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    attendance_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    late_grace_minutes: int | None = Field(default=None, ge=0, le=180)
    whatsapp_token: str | None = Field(default=None, max_length=1000)
    whatsapp_phone_id: str | None = Field(default=None, max_length=100)

    @field_validator("absent_alert_time", "attendance_start_time")
    @classmethod
    def validate_schedule_time(cls, value: str | None) -> str | None:
        return validate_clock_time(value)
