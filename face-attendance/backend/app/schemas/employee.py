from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    designation: str | None = Field(default=None, max_length=150)
    department: str | None = Field(default=None, max_length=150)
    headshot_url: str | None = None
    branch_id: int | None = None


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    designation: str | None = Field(default=None, max_length=150)
    department: str | None = Field(default=None, max_length=150)
    headshot_url: str | None = None
    branch_id: int | None = None
    status: str | None = Field(default=None, max_length=50)


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    branch_id: int
    name: str
    email: EmailStr
    phone: str | None
    designation: str | None
    department: str | None
    headshot_url: str | None
    status: str
    has_face_enrolled: bool = False


EmployeeRead = EmployeeResponse
