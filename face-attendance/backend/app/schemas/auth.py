from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignupRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=255)
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("company_name", "name")
    @classmethod
    def strip_and_validate_text(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("must contain at least 2 non-space characters")
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
