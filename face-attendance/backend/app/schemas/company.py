from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CompanyBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    package: str = Field(default="starter", max_length=100)
    employee_limit: int = Field(default=10, ge=1)
    status: str = Field(default="active", max_length=50)
    school_phone: str | None = Field(default=None, max_length=50)
    school_contact: str | None = Field(default=None, max_length=50)
    school_logo: str | None = Field(default=None, max_length=500)


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
    student_count: int = Field(default=0, ge=0)
    attendance_active: bool = False


class SchoolClassResponse(BaseModel):
    id: int
    name: str
    location: str | None = None


class SchoolSettingsResponse(BaseModel):
    company_id: int
    school_phone: str | None
    school_contact: str | None
    school_logo: str | None
    attendance_start_time: str = "09:00"
    check_in_end_time: str | None = None
    check_out_end_time: str | None = None
    late_grace_minutes: int = 15
    whatsapp_token_configured: bool
    whatsapp_webhook_secure: bool = False
    whatsapp_chatbot_ready: bool = False
    whatsapp_checkin_template_configured: bool = False
    whatsapp_checkout_template_configured: bool = False
    whatsapp_absent_template_configured: bool = False
    whatsapp_test_mode: bool = False
    whatsapp_test_recipient_masked: str | None = None


class SchoolSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    school_phone: str | None = Field(default=None, max_length=50)
    school_contact: str | None = Field(default=None, max_length=50)
    school_logo: str | None = Field(default=None, max_length=500)
    check_in_end_time: str | None = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="Local check-in session end time as HH:MM. Blank = no auto-end.",
    )
    check_out_end_time: str | None = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="Local check-out session end time as HH:MM. Blank = no auto-end.",
    )
