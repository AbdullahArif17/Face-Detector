from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class PlatformLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1)


class PlatformStatsResponse(BaseModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
    total_users: int
    total_students: int
    total_employees: int
    total_attendance_records: int
    today_attendance_records: int
    active_sessions_count: int


class OrgListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    package: str
    employee_limit: int
    status: str
    school_phone: str | None = None
    school_contact: str | None = None
    hr_email: str | None = None
    created_at: datetime
    updated_at: datetime
    users_count: int = 0
    students_count: int = 0
    employees_count: int = 0
    classes_count: int = 0
    today_attendance_count: int = 0


class PlatformUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    is_active: bool
    last_login: datetime | None = None
    created_at: datetime


class PlatformStudentItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_name: str
    student_code: str | None = None
    grade: str
    section: str
    class_id: int
    class_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_email: str | None = None
    status: str
    has_face_enrolled: bool = False
    created_at: datetime


class PlatformEmployeeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str | None = None
    designation: str | None = None
    department: str | None = None
    branch_id: int
    branch_name: str | None = None
    status: str
    expected_arrival_time: str | None = None
    expected_departure_time: str | None = None
    has_face_enrolled: bool = False
    created_at: datetime


class PlatformClassItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    location: str | None = None
    created_at: datetime


class OrgStats(BaseModel):
    users_count: int = 0
    students_count: int = 0
    employees_count: int = 0
    classes_count: int = 0
    total_attendance_records: int = 0
    today_attendance_records: int = 0


class OrgDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    package: str
    employee_limit: int
    status: str
    school_phone: str | None = None
    school_contact: str | None = None
    school_logo: str | None = None
    hr_email: str | None = None
    attendance_start_time: str = "09:00"
    check_in_end_time: str | None = None
    check_out_end_time: str | None = None
    api_key: str
    created_at: datetime
    updated_at: datetime
    stats: OrgStats
    users: list[PlatformUserItem]
    students: list[PlatformStudentItem]
    employees: list[PlatformEmployeeItem]
    classes: list[PlatformClassItem]


class OrgStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(pattern="^(active|suspended)$")


class OrgUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=255)
    package: str | None = Field(default=None, max_length=100)
    employee_limit: int | None = Field(default=None, ge=1)
    status: str | None = Field(default=None, pattern="^(active|suspended)$")
