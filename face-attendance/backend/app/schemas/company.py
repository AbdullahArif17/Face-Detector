from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    package: str = Field(default="starter", max_length=100)
    employee_limit: int = Field(default=10, ge=1)
    status: str = Field(default="active", max_length=50)
    school_phone: str | None = Field(default=None, max_length=50)
    school_logo: str | None = Field(default=None, max_length=500)
    absent_alert_time: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    whatsapp_phone_id: str | None = Field(default=None, max_length=100)


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


class SchoolSettingsResponse(BaseModel):
    company_id: int
    school_phone: str | None
    school_logo: str | None
    absent_alert_time: str
    whatsapp_token_configured: bool
    whatsapp_phone_id: str | None


class SchoolSettingsUpdate(BaseModel):
    school_phone: str | None = Field(default=None, max_length=50)
    school_logo: str | None = Field(default=None, max_length=500)
    absent_alert_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    whatsapp_token: str | None = Field(default=None, max_length=1000)
    whatsapp_phone_id: str | None = Field(default=None, max_length=100)
