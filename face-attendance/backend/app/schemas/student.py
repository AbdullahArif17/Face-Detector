from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.images import MAX_IMAGE_BASE64_LENGTH
from app.core.phones import normalize_pakistan_phone


class StudentCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=255)
    student_code: str = Field(min_length=1, max_length=100)
    grade: str = Field(min_length=1, max_length=50)
    section: str = Field(min_length=1, max_length=20)
    parent_name: str = Field(min_length=1, max_length=255)
    parent_phone: str = Field(min_length=11, max_length=20)
    parent_phone_2: str | None = Field(default=None, max_length=20)
    profile_image: str | None = Field(default=None, max_length=MAX_IMAGE_BASE64_LENGTH)
    class_id: int | None = None

    @field_validator("parent_phone")
    @classmethod
    def validate_parent_phone(cls, value: str) -> str:
        return normalize_pakistan_phone(value)

    @field_validator("parent_phone_2")
    @classmethod
    def validate_second_parent_phone(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        return normalize_pakistan_phone(value)


class StudentUpdate(BaseModel):
    student_name: str | None = Field(default=None, min_length=1, max_length=255)
    student_code: str | None = Field(default=None, min_length=1, max_length=100)
    grade: str | None = Field(default=None, min_length=1, max_length=50)
    section: str | None = Field(default=None, min_length=1, max_length=20)
    parent_name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_phone: str | None = Field(default=None, max_length=20)
    parent_phone_2: str | None = Field(default=None, max_length=20)
    profile_image: str | None = Field(default=None, max_length=MAX_IMAGE_BASE64_LENGTH)
    class_id: int | None = None
    status: str | None = Field(default=None, max_length=50)

    @field_validator("parent_phone")
    @classmethod
    def validate_parent_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_pakistan_phone(value)

    @field_validator("parent_phone_2")
    @classmethod
    def validate_second_parent_phone(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        return normalize_pakistan_phone(value)


class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    class_id: int
    student_name: str
    student_code: str
    grade: str
    section: str
    parent_name: str
    parent_phone: str
    parent_phone_2: str | None
    profile_image: str | None
    status: str
    has_face_enrolled: bool = False
    created_at: datetime


class StudentImportError(BaseModel):
    row: int
    student_code: str | None = None
    error: str


class StudentImportResponse(BaseModel):
    created: int
    failed: int
    errors: list[StudentImportError]
