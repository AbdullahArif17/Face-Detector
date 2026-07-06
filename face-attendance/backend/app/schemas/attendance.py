from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AttendanceBase(BaseModel):
    student_id: int
    company_id: int
    session_id: int | None = None
    check_in: datetime
    check_out: datetime | None = None
    status: str = Field(default="present", max_length=50)
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    notification_sent: bool = False
    notification_status: str | None = Field(default=None, max_length=50)


class AttendanceMark(BaseModel):
    student_id: int
    company_id: int
    check_in: datetime | None = None
    status: str = Field(default="present", max_length=50)
    confidence_score: float | None = Field(default=None, ge=0, le=1)


class AttendanceRead(AttendanceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class AttendanceSessionStart(BaseModel):
    branch_id: int = Field(gt=0)


class AttendanceSessionStop(BaseModel):
    session_id: int = Field(gt=0)


class AttendanceSessionRead(BaseModel):
    id: int
    company_id: int
    branch_id: int
    branch_name: str | None = None
    status: str
    started_by_id: int
    stopped_by_id: int | None = None
    started_at: datetime
    stopped_at: datetime | None = None
    created_at: datetime


class AttendanceSessionStatus(BaseModel):
    branch_id: int
    active_session: AttendanceSessionRead | None = None


class AttendanceAutoMarkRequest(BaseModel):
    image: str = Field(min_length=1)
    branch_id: int = Field(gt=0)


class AttendanceAutoStudent(BaseModel):
    id: int
    name: str
    grade: str
    section: str


class AttendanceAutoMarkResponse(BaseModel):
    matched: bool
    message: str
    student: AttendanceAutoStudent | None = None
    employee: AttendanceAutoStudent | None = None
    action: str | None = None
    time: str | None = None
    confidence_score: float | None = None
    notification_status: str | None = None


class AttendanceDashboardRecord(BaseModel):
    attendance_id: int | None = None
    student_id: int
    student_name: str
    employee_id: int | None = None
    employee_name: str | None = None
    designation: str | None = None
    grade: str
    section: str
    branch_id: int
    check_in: datetime | None = None
    check_out: datetime | None = None
    status: str
    confidence_score: float | None = None
    notification_sent: bool = False
    notification_status: str | None = None
    working_hours: str
    attendance_date: date
