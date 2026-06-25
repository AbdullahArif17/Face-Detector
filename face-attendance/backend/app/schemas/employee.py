from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeBase(BaseModel):
    company_id: int
    branch_id: int
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    designation: str | None = Field(default=None, max_length=150)
    status: str = Field(default="active", max_length=50)


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    company_id: int | None = None
    branch_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    designation: str | None = Field(default=None, max_length=150)
    status: str | None = Field(default=None, max_length=50)


class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
