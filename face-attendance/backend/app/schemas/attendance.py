from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AttendanceBase(BaseModel):
    employee_id: int
    company_id: int
    check_in: datetime
    check_out: datetime | None = None
    status: str = Field(default="present", max_length=50)
    confidence_score: float | None = Field(default=None, ge=0, le=1)


class AttendanceMark(BaseModel):
    employee_id: int
    company_id: int
    check_in: datetime | None = None
    status: str = Field(default="present", max_length=50)
    confidence_score: float | None = Field(default=None, ge=0, le=1)


class AttendanceRead(AttendanceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
